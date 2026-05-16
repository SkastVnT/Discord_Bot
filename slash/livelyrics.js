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
        if (session.lyricsInterval) clearInterval(session.lyricsInterval);
        if (session.progressInterval) clearInterval(session.progressInterval);
        if (session.checkInterval) clearInterval(session.checkInterval);
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
      .setColor("#FF6B6B")
      .setTitle(`🎶 ${track.title}`)
      .setURL(track.url)
      .setThumbnail(track.thumbnail)
      .addFields(
        { name: "👤 Ca sĩ", value: track.author || "Không rõ", inline: true },
        { name: "⏱️ Thời lượng", value: String(track.duration || "N/A"), inline: true },
        { name: "📡 Nguồn", value: track.source || "youtube", inline: true },
        { name: "▶️ Tiến trình", value: "`0:00  advancement 0:00`" },
        { name: "🎤 Lyrics", value: "⏳ Đang tải lyrics từ lyricsExt..." }
      )
      .setFooter({ text: "🎵 /livelyrics off để tắt" })
      .setTimestamp();

    const message = await interaction.editReply({ embeds: [embed] });

    // Create session
    const session = {
      active: true,
      message,
      embed,
      track,
      lines: [],
      lastLine: null,
      plainShown: false,
      guildId
    };
    activeSessions.set(guildId, session);

    // Start progress bar updates
    session.progressInterval = setInterval(async () => {
      try {
        const currentPlayer = getPlayer(guildId);
        if (!currentPlayer || !currentPlayer.isPlaying) {
          clearInterval(session.progressInterval);
          return;
        }
        const newProgress = currentPlayer.getProgressBar?.({ timecodes: true, length: 15 }) || "";
        if (newProgress) {
          session.embed.spliceFields(3, 1, { name: "▶️ Tiến trình", value: `\`${newProgress}\`` });
          await session.message.edit({ embeds: [session.embed] }).catch(() => {});
        }
      } catch (e) {}
    }, 5000);

    // Auto cleanup after track ends
    const checkInterval = setInterval(async () => {
      const currentSession = activeSessions.get(guildId);
      if (!currentSession || !currentSession.active) {
        clearInterval(checkInterval);
        return;
      }
      
      const currentPlayer = getPlayer(guildId);
      if (!currentPlayer || !currentPlayer.isPlaying) {
        if (currentSession.lyricsInterval) clearInterval(currentSession.lyricsInterval);
        if (currentSession.progressInterval) clearInterval(currentSession.progressInterval);
        currentSession.embed.spliceFields(4, 1, { name: "🎤 Lyrics", value: "⏹️ Bài hát đã dừng!" });
        currentSession.embed.setColor("#888888");
        await currentSession.message.edit({ embeds: [currentSession.embed] }).catch(() => {});
        activeSessions.delete(guildId);
        clearInterval(checkInterval);
      }
    }, 3000);
    
    session.checkInterval = checkInterval;
  },
};

function buildLyricsDisplay(lines) {
  let display = "";
  for (let i = 0; i < lines.length - 1; i++) {
    display += `┃ *${lines[i]}*\n`;
  }
  if (lines.length > 0) {
    display += `┃ **➤ ${lines[lines.length - 1]}**`;
  }
  return display || "⏳ Đang chờ lyrics...";
}

export function updateLiveLyricsFromExt(guildId, track, lyricsPayload) {
  const session = activeSessions.get(guildId);
  if (!session || !session.active) return;
  if (!session.track) return;

  const sameTrack =
    (session.track.url && track?.url && session.track.url === track.url) ||
    session.track.title === track?.title;
  if (!sameTrack) return;

  const currentLine = lyricsPayload?.current?.trim?.() || "";
  const plainText = lyricsPayload?.text?.trim?.() || "";

  if (currentLine) {
    if (session.lastLine === currentLine) return;
    session.lastLine = currentLine;
    session.lines.push(currentLine);
    if (session.lines.length > 6) session.lines.shift();

    session.embed.spliceFields(4, 1, {
      name: "🎤 Lyrics",
      value: buildLyricsDisplay(session.lines),
    });
    session.message.edit({ embeds: [session.embed] }).catch(() => {});
    return;
  }

  if (plainText && !session.plainShown) {
    const lines = plainText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!lines.length) return;

    session.plainShown = true;
    session.lines = lines;
    session.lastLine = lines[lines.length - 1];

    session.embed.spliceFields(4, 1, {
      name: "🎤 Lyrics",
      value: buildLyricsDisplay(session.lines),
    });
    session.message.edit({ embeds: [session.embed] }).catch(() => {});
  }
}

global.updateLiveLyricsFromExt = updateLiveLyricsFromExt;
