import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

// Store active live lyrics sessions - use global to share between instances
if (!global.liveLyricsSessions) {
  global.liveLyricsSessions = new Map();
}
export const activeSessions = global.liveLyricsSessions;

export default {
  data: new SlashCommandBuilder()
    .setName("livelyrics")
    .setDescription("🎤 Hiển thị lyrics realtime đồng bộ với nhạc")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Bật hoặc tắt live lyrics")
        .setRequired(false)
        .addChoices(
          { name: "Bật", value: "on" },
          { name: "Tắt", value: "off" }
        )
    ),

  async run({ client, interaction }) {
    await interaction.deferReply();
    
    const player = getPlayer(interaction.guildId);
    const action = interaction.options.getString("action") || "on";
    
    if (!player || !player.isPlaying) {
      return interaction.editReply("❌ Không có bài hát nào đang phát!");
    }

    const guildId = interaction.guildId;

    // Turn off live lyrics
    if (action === "off") {
      const session = activeSessions.get(guildId);
      if (session) {
        session.active = false;
        activeSessions.delete(guildId);
        return interaction.editReply("⏹️ Đã tắt live lyrics!");
      }
      return interaction.editReply("❌ Live lyrics chưa được bật!");
    }

    // Check if already active
    if (activeSessions.has(guildId)) {
      return interaction.editReply("⚠️ Live lyrics đang hoạt động! Dùng `/livelyrics off` để tắt.");
    }

    const track = player.currentTrack;

    // Create initial embed
    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle(`🎤 ${track.title}`)
      .setDescription(`✅ Live lyrics đã bật!\n\n👤 ${track.author || 'Unknown'}\n\n⏳ Đang chờ lyrics...`)
      .setThumbnail(track.thumbnail)
      .setFooter({ text: "🎵 /livelyrics off để tắt" });

    const message = await interaction.editReply({ embeds: [embed] });

    // Create session
    const session = {
      active: true,
      message,
      embed,
      track,
      lines: [],
      guildId
    };
    activeSessions.set(guildId, session);

    // Auto cleanup after track ends
    const checkInterval = setInterval(async () => {
      const currentSession = activeSessions.get(guildId);
      if (!currentSession || !currentSession.active) {
        clearInterval(checkInterval);
        return;
      }
      
      const currentPlayer = getPlayer(guildId);
      if (!currentPlayer || !currentPlayer.isPlaying) {
        currentSession.embed.setDescription("⏹️ Bài hát đã dừng!");
        currentSession.embed.setColor("#888888");
        await currentSession.message.edit({ embeds: [currentSession.embed] }).catch(() => {});
        activeSessions.delete(guildId);
        clearInterval(checkInterval);
      } else if (currentPlayer.currentTrack?.title !== currentSession.track.title) {
        // Track changed - update session
        currentSession.track = currentPlayer.currentTrack;
        currentSession.lines = [];
        currentSession.embed
          .setTitle(`🎤 ${currentPlayer.currentTrack.title}`)
          .setDescription(`🔄 Đang phát bài mới...\n\n👤 ${currentPlayer.currentTrack.author || 'Unknown'}`)
          .setThumbnail(currentPlayer.currentTrack.thumbnail)
          .setColor("#00FF00");
        await currentSession.message.edit({ embeds: [currentSession.embed] }).catch(() => {});
      }
    }, 3000);
    
    session.checkInterval = checkInterval;
  },
};

// Function to update lyrics - called from index.js
export function updateLiveLyrics(guildId, line) {
  const session = activeSessions.get(guildId);
  if (!session || !session.active) return;
  
  // Add new line
  session.lines.push(line);
  
  // Keep only last 5 lines
  if (session.lines.length > 5) {
    session.lines.shift();
  }
  
  // Build display
  let display = "";
  
  // Previous lines (dimmed)
  for (let i = 0; i < session.lines.length - 1; i++) {
    display += `*${session.lines[i]}*\n`;
  }
  
  // Current line (highlighted)
  if (session.lines.length > 0) {
    display += `\n**🎤 ${session.lines[session.lines.length - 1]}**\n`;
  }
  
  session.embed
    .setDescription(display || "⏳ Đang chờ lyrics...")
    .setColor("#FF6B6B");
  
  session.message.edit({ embeds: [session.embed] }).catch(() => {});
}
