import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("bassboost")
    .setDescription("🎸 Điều chỉnh mức bass boost")
    .addNumberOption((option) =>
      option
        .setName("level")
        .setDescription("Mức bass (0-100, 0 = tắt)")
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const level = interaction.options.getNumber("level");

      if (level === 0) {
        player.filters.remove("BassBoost");
        const embed = new EmbedBuilder()
          .setColor("Gray")
          .setDescription("🎸 Đã tắt bass boost");
        return interaction.editReply({ embeds: [embed] });
      }

      try {
        await player.filters.set("BassBoost", { gain: level / 100 });
      } catch (err) {
        console.log("BassBoost không hỗ trợ:", err);
      }

      const bassBar = "█".repeat(Math.floor(level / 5)) + "░".repeat(20 - Math.floor(level / 5));

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(
          `🎸 Đã đặt bass boost: **${level}%**\n\n\`${bassBar}\`\n\n⚠️ *Có thể mất vài giây để áp dụng*`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh bassboost:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi điều chỉnh bass!");
    }
  },
};
