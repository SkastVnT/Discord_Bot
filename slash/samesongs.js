import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("samesongs")
    .setDescription("🎵 Thêm nhiều bài của cùng ca sĩ vào hàng chờ")
    .addNumberOption((option) =>
      option
        .setName("count")
        .setDescription("Số bài muốn thêm (1-10)")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.currentTrack) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const count = interaction.options.getNumber("count");
      await interaction.editReply(`🔍 Đang tìm ${count} bài của ${player.currentTrack.author}...`);

      const currentTrack = player.currentTrack;
      const searchQuery = `${currentTrack.author} songs`;
      const result = await player.search(searchQuery, interaction.user);

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy bài nào!");
      }

      // Lọc bỏ bài hiện tại và lấy số lượng cần thiết
      const songs = result.tracks
        .filter((t) => t.url !== currentTrack.url)
        .slice(0, count);

      if (!songs.length) {
        return interaction.editReply("❌ Không tìm thấy bài khác!");
      }

      player.queue.addMultiple(songs);

      const songList = songs
        .map((t, i) => `${i + 1}. ${t.title}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle(`🎵 Đã thêm ${songs.length} bài của ${currentTrack.author}`)
        .setDescription(songList.length > 2000 ? songList.substring(0, 2000) + "..." : songList)
        .setThumbnail(currentTrack.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh samesongs:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi!");
    }
  },
};
