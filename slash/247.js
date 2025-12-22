import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("247")
    .setDescription("🔄 Bật/tắt chế độ 24/7 (bot không rời khi hết nhạc)"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player) {
        return interaction.editReply("❌ Không có player nào đang hoạt động!");
      }

      // Toggle 24/7 mode
      const current247 = player.leaveOnEnd === false && player.leaveOnEmpty === false;
      
      if (current247) {
        // Tắt 24/7
        player.leaveOnEnd = true;
        player.leaveOnEmpty = true;
      } else {
        // Bật 24/7
        player.leaveOnEnd = false;
        player.leaveOnEmpty = false;
      }

      const embed = new EmbedBuilder()
        .setColor(current247 ? "Red" : "Green")
        .setDescription(
          current247
            ? "❌ Đã **tắt** chế độ 24/7\n\n*Bot sẽ tự động rời khi hết nhạc*"
            : "🔄 Đã **bật** chế độ 24/7!\n\n*Bot sẽ ở lại voice channel ngay cả khi hết nhạc*"
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh 247:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi thay đổi chế độ 24/7!");
    }
  },
};
