import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("⏹️ Dừng nhạc và xóa toàn bộ hàng chờ"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player) {
        return interaction.editReply("❌ Không có player nào đang hoạt động!");
      }

      const queueSize = player.queue.tracks.size;
      
      player.stop();
      player.queue.clear();

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription(
          `⏹️ Đã dừng nhạc và xóa ${queueSize} bài trong hàng chờ!`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh stop:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi dừng nhạc!");
    }
  },
};
