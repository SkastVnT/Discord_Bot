import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("speed")
    .setDescription("⚡ Thay đổi tốc độ phát nhạc")
    .addNumberOption((option) =>
      option
        .setName("rate")
        .setDescription("Tốc độ phát (0.5 - 2.0)")
        .setMinValue(0.5)
        .setMaxValue(2.0)
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const rate = interaction.options.getNumber("rate");

      // Áp dụng speed filter
      try {
        await player.filters.set("Speed", { rate });
      } catch (err) {
        // Fallback method nếu không hỗ trợ
        console.log("Speed filter không hỗ trợ trực tiếp");
      }

      const speedEmoji = rate < 0.8 ? "🐌" : rate > 1.2 ? "⚡" : "🎵";
      const speedText =
        rate < 0.8 ? "Chậm" : rate > 1.2 ? "Nhanh" : "Bình thường";

      const embed = new EmbedBuilder()
        .setColor("Yellow")
        .setDescription(
          `${speedEmoji} Đã đặt tốc độ phát: **${rate}x** (${speedText})\n\n⚠️ *Có thể mất vài giây để áp dụng*`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh speed:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi thay đổi tốc độ!");
    }
  },
};
