import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("removedupes")
    .setDescription("🗑️ Xóa các bài hát trùng lặp trong hàng chờ"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.queue.tracks.size) {
        return interaction.editReply("❌ Không có bài hát nào trong hàng chờ!");
      }

      const tracks = player.queue.tracks.toArray();
      const seen = new Set();
      const duplicates = [];

      // Tìm các bài trùng
      for (let i = tracks.length - 1; i >= 0; i--) {
        const track = tracks[i];
        if (seen.has(track.url)) {
          duplicates.push(i);
        } else {
          seen.add(track.url);
        }
      }

      if (duplicates.length === 0) {
        return interaction.editReply("✅ Không có bài hát trùng lặp!");
      }

      // Xóa các bài trùng
      for (const index of duplicates) {
        player.queue.remove(index);
      }

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setDescription(
          `🗑️ Đã xóa **${duplicates.length}** bài hát trùng lặp!\n\n` +
          `📜 Còn lại: **${player.queue.tracks.size}** bài`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh removedupes:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi xóa bài trùng!");
    }
  },
};
