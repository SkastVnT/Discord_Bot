import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { findLyricsWithAI } from "../aiService.js";

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
        { name: "🎤 Lyrics", value: "⏳ Đang tìm lyrics bằng AI..." }
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
      allLyrics: [],
      currentLineIndex: 0,
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

    // Fetch lyrics via AI and start live display
    fetchAndDisplayLyrics(session, track);

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

/**
 * Strip YouTube junk from track title to get clean song name
 */
function cleanTitle(title) {
  if (!title) return title;
  return title
    // Remove everything from first | onwards (handles both | and ||)
    .replace(/\s*\|+.*$/s, '')
    // Remove common suffixes in parens/brackets
    .replace(/\s*[\(\[]\s*(lyric[s]?|official|audio|video|mv|hd|4k|full|remix|cover|version|ost|feat[.\s].*|ft[.\s].*)([\)\]].*)*/gi, '')
    // Remove trailing " - Lyric/Official/etc"
    .replace(/\s*[-\u2013]\s*(lyric[s]?|official|audio|video|mv|hd|4k|full|ost).*$/gi, '')
    .trim();
}

/**
 * Try to extract artist from YouTube title (e.g. "Song Name - Artist" or "Artist - Song Name")
 */
function extractArtistFromTitle(title) {
  // Pattern: "Song || Artist || ..."
  const pipeMatch = title.match(/\|\|\s*([^|]+?)\s*\|\|/);
  if (pipeMatch) return pipeMatch[1].trim();
  // Pattern: "Song - Artist" or "Artist - Song"
  const dashMatch = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (dashMatch) return dashMatch[2].trim();
  return "";
}

/**
 * Fetch lyrics from AI and start progressive display
 */
export async function fetchAndDisplayLyrics(session, track) {
  try {
    const cleanedTitle = cleanTitle(track.title);
    const artist = track.author || extractArtistFromTitle(track.title) || "";

    console.log(`🎤 Sending to AI → title: "${cleanedTitle}", artist: "${artist}"`);

    const lyrics = await findLyricsWithAI(cleanedTitle, artist);
    
    if (!lyrics || !session.active) {
      if (session.active) {
        session.embed.spliceFields(4, 1, { name: "🎤 Lyrics", value: "❌ Không tìm thấy lyrics cho bài này" });
        await session.message.edit({ embeds: [session.embed] }).catch(() => {});
      }
      return;
    }

    // Parse lyrics into lines (filter empty)
    const allLines = lyrics.split("\n").filter(l => l.trim().length > 0);
    session.allLyrics = allLines;
    session.currentLineIndex = 0;
    session.lines = [];

    // Calculate time per line: clamp between 2s and 8s
    const durationMs = parseDuration(track.duration);
    const rawTimePerLine = durationMs > 0 ? Math.floor(durationMs / allLines.length) : 4000;
    const timePerLine = Math.min(8000, Math.max(2000, rawTimePerLine));

    console.log(`🎤 Lyrics loaded: ${allLines.length} lines, ~${timePerLine}ms/line (raw: ${rawTimePerLine}ms)`);

    // Helper to advance and display one line
    const showNextLine = () => {
      if (!session.active || session.currentLineIndex >= session.allLyrics.length) {
        if (session.lyricsInterval) clearInterval(session.lyricsInterval);
        return;
      }

      const currentLine = session.allLyrics[session.currentLineIndex];
      session.lines.push(currentLine);
      session.currentLineIndex++;

      // Keep only last 6 lines visible
      if (session.lines.length > 6) {
        session.lines.shift();
      }

      // Build display
      let display = "";
      for (let i = 0; i < session.lines.length - 1; i++) {
        display += `┃ *${session.lines[i]}*\n`;
      }
      if (session.lines.length > 0) {
        display += `┃ **➤ ${session.lines[session.lines.length - 1]}**`;
      }

      session.embed.spliceFields(4, 1, { name: "🎤 Lyrics", value: display || "⏳ Đang chờ lyrics..." });
      session.message.edit({ embeds: [session.embed] }).catch(() => {});
    };

    // Show first line immediately, then interval for subsequent lines
    showNextLine();
    session.lyricsInterval = setInterval(showNextLine, timePerLine);

  } catch (error) {
    console.error("❌ Error fetching lyrics:", error.message);
    if (session.active) {
      session.embed.spliceFields(4, 1, { name: "🎤 Lyrics", value: "❌ Lỗi khi tìm lyrics" });
      session.message.edit({ embeds: [session.embed] }).catch(() => {});
    }
  }
}

/**
 * Parse duration string (e.g. "3:45" or "1:02:30") to milliseconds
 */
function parseDuration(durationStr) {
  if (!durationStr) return 0;
  const str = String(durationStr);
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else {
    seconds = parts[0];
  }
  return seconds * 1000;
}

// Always keep global reference updated so index.js hot-reload picks up latest version
global.fetchAndDisplayLyrics = fetchAndDisplayLyrics;
