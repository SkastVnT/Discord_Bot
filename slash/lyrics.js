import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import lyricsFinder from "lyrics-finder";
import { ViFonttrim } from "../ViFont.js";
import { getPlayer } from "ziplayer";
import { lyricsExt as LyricsExt } from "@ziplayer/extension";
import { findLyricsWithAI } from "../aiService.js";

/**
 * Trích xuất tiêu đề bài hát từ title và artist
 */
export function extractSongTitle(title, artist = "") {
  const normalizedArtist = artist.toLowerCase().trim();
  const parts = title.split(/[-|[\]()]/).map((s) => s.trim());
  for (const p of parts) {
    if (
      p &&
      !p.toLowerCase().includes("official") &&
      !p.toLowerCase().includes("lyrics") &&
      !p.toLowerCase().includes(normalizedArtist)
    ) {
      return p;
    }
  }
  return title;
}

/**
 * Tự động đồng bộ lyrics (giả lập)
 */
export async function setSyncedLyrics(queue, message, lyrics) {
  if (!lyrics) return;

  const track = queue.currentTrack;
  const embed = new EmbedBuilder()
    .setColor("Random")
    .setTitle(`🎶 Lyrics: ${track.title}`)
    .setDescription(ViFonttrim(lyrics, 4000));

  try {
    await message.edit({ embeds: [embed] });
  } catch (e) {
    console.warn("Không thể cập nhật lyrics:", e.message);
  }
}

/**
 * Slash command /lyrics
 */
export default {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("📜 Tìm lời bài hát đang phát hoặc theo tên")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Tên bài hát (tùy chọn)")
        .setRequired(false)
    ),

  async run({ client, interaction }) {
    await interaction.deferReply();
    const player = getPlayer(interaction.guildId);
    const songName =
      interaction.options.getString("name") ||
      player?.currentTrack?.title ||
      null;

    if (!songName)
      return interaction.editReply(
        "❌ Không tìm thấy bài hát đang phát hoặc tên không hợp lệ."
      );

    // Extract song name and artist
    const track = player?.currentTrack;
    const artist = track?.author || "";
    const cleanSongName = extractSongTitle(songName, artist);

    await interaction.editReply(
      `🔍 Đang tìm lời bài hát cho "${cleanSongName}" - ${artist}...\n🤖 Sử dụng AI để tìm chính xác...`
    );

    try {
      let lyrics = null;

      // 1. Try AI-powered search (most accurate)
      try {
        lyrics = await findLyricsWithAI(cleanSongName, artist);
        if (lyrics) {
          console.log("✅ Found lyrics via AI");
        }
      } catch (error) {
        console.log("⚠️ AI search failed:", error.message);
      }

      // 2. Fallback to ZiPlayer extension
      if (!lyrics) {
        try {
          const lyricsExtInstance = new LyricsExt();
          const result = await lyricsExtInstance.fetch(`${cleanSongName} ${artist}`);
          if (result && result.length > 0) {
            lyrics = result[0]?.lyrics || result[0]?.plainLyrics;
            if (lyrics) console.log("✅ Found lyrics via ZiPlayer extension");
          }
        } catch (error) {
          console.log("⚠️ ZiPlayer extension failed:", error.message);
        }
      }

      // 3. Fallback to lyrics-finder
      if (!lyrics) {
        try {
          lyrics = await lyricsFinder(cleanSongName, artist);
          if (lyrics) console.log("✅ Found lyrics via lyrics-finder");
        } catch (error) {
          console.log("⚠️ lyrics-finder failed:", error.message);
        }
      }

      if (!lyrics || lyrics.length < 50) {
        return interaction.editReply(
          `❌ Không tìm thấy lời bài hát cho "${cleanSongName}" của ${artist}.\n💡 Hãy thử tìm kiếm với tên bài hát chính xác hơn.`
        );
      }

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle(`🎵 ${cleanSongName}`)
        .setAuthor({ name: artist || "Unknown Artist" })
        .setDescription(ViFonttrim(lyrics, 4000))
        .setFooter({ text: "🤖 Powered by AI + Multi-source search" })
        .setTimestamp();

      if (track?.thumbnail) {
        embed.setThumbnail(track.thumbnail);
      }

      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (error) {
      console.error("❌ Lyrics command error:", error);
      await interaction.editReply(
        `⚠️ Lỗi khi tìm lyrics: ${error.message}\n💡 Hãy thử lại sau.`
      );
    }
  },
};
