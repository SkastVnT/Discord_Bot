import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { ViFonttrim } from "../ViFont.js";
import { getPlayer } from "ziplayer";
import { findLyricsWithAI } from "../aiService.js";
import { extractSongTitle } from "./lyrics.js";

/**
 * Slash command /ailyrics - Tìm lyrics bằng AI (Google Search + Gemini/Grok/DeepSeek)
 */
export default {
  data: new SlashCommandBuilder()
    .setName("ailyrics")
    .setDescription("🤖 Tìm lời bài hát bằng AI (chậm hơn nhưng chính xác)")
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
      `🤖 Đang tìm lời bài hát bằng AI cho "${cleanSongName}" - ${artist}...\n⏳ Có thể mất 5-10 giây...`
    );

    try {
      // AI-powered search with Google Search + multi-provider fallback
      const lyrics = await findLyricsWithAI(cleanSongName, artist);

      if (!lyrics || lyrics.length < 50) {
        return interaction.editReply(
          `❌ AI không tìm thấy lời bài hát cho "${cleanSongName}" của ${artist}.\n💡 Kiểm tra lại tên bài hát và tác giả.`
        );
      }

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle(`🎵 ${cleanSongName}`)
        .setAuthor({ name: artist || "Unknown Artist" })
        .setDescription(ViFonttrim(lyrics, 4000))
        .setFooter({ text: "🤖 Powered by AI (Gemini/Grok/DeepSeek)" })
        .setTimestamp();

      if (track?.thumbnail) {
        embed.setThumbnail(track.thumbnail);
      }

      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (error) {
      console.error("❌ AI Lyrics command error:", error);
      
      // Check if quota error
      if (error.message?.includes("quota") || error.message?.includes("429")) {
        return interaction.editReply(
          `⚠️ Đã hết quota API!\n💡 Vui lòng thử lại sau hoặc dùng \`/lyrics\` cho tìm kiếm thông thường.`
        );
      }
      
      await interaction.editReply(
        `⚠️ Lỗi khi tìm lyrics bằng AI: ${error.message}\n💡 Thử lại sau hoặc dùng \`/lyrics\`.`
      );
    }
  },
};
