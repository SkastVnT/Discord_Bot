import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

const sleepTimers = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("sleep")
    .setDescription("⏰ Đặt hẹn giờ tắt nhạc")
    .addNumberOption((option) =>
      option
        .setName("minutes")
        .setDescription("Số phút (0 để hủy)")
        .setMinValue(0)
        .setMaxValue(1440)
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);

      if (!player) {
        return interaction.editReply("❌ Không có player nào đang hoạt động!");
      }

      const minutes = interaction.options.getNumber("minutes");
      const guildId = interaction.guildId;

      // Hủy timer cũ nếu có
      if (sleepTimers.has(guildId)) {
        clearTimeout(sleepTimers.get(guildId));
        sleepTimers.delete(guildId);
      }

      if (minutes === 0) {
        const embed = new EmbedBuilder()
          .setColor("Gray")
          .setDescription("⏰ Đã hủy hẹn giờ tắt nhạc");
        return interaction.editReply({ embeds: [embed] });
      }

      // Đặt timer mới
      const timer = setTimeout(() => {
        if (player && player.connection) {
          player.destroy();
          interaction.channel
            ?.send("⏰ Đã đến giờ ngủ! Tắt nhạc và rời voice channel.")
            .catch(() => {});
        }
        sleepTimers.delete(guildId);
      }, minutes * 60 * 1000);

      sleepTimers.set(guildId, timer);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(
          `⏰ Đã đặt hẹn giờ: Bot sẽ tắt sau **${minutes} phút**\n\n💡 *Dùng /sleep 0 để hủy*`
        )
        .setFooter({
          text: `Sẽ tắt lúc: ${new Date(
            Date.now() + minutes * 60 * 1000
          ).toLocaleTimeString("vi-VN")}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh sleep:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi đặt hẹn giờ!");
    }
  },
};
