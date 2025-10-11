import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import lyricsFinder from "lyrics-finder";
import { ViFonttrim } from "../ViFont.js";
import { getPlayer } from "ziplayer";
import { lyricsExt } from "@ziplayer/extension";

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
    const lyricsExt = new lyricsExt();
    const player = getPlayer(interaction.guildId);
    const songName =
      interaction.options.getString("name") ||
      player?.currentTrack?.title ||
      null;

    if (!songName)
      return interaction.editReply(
        "❌ Không tìm thấy bài hát đang phát hoặc tên không hợp lệ."
      );

    await interaction.editReply("🔍 Đang tìm lời bài hát...");

    try {
      const lyrics =
        (await lyricsExt.fetch(songName)) ||
        (await lyricsFinder(songName)) ||
        "Không tìm thấy lời bài hát.";
      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle(`🎵 Lời bài hát: ${songName}`)
        .setDescription(ViFonttrim(lyrics?.text || lyrics, 4000))
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`⚠️ Lỗi khi tìm lyrics: ${error.message}`);
    }
  },
};
