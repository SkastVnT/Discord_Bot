import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("pitch")
    .setDescription("🎼 Thay đổi cao độ (pitch) của bài hát")
    .addNumberOption((option) =>
      option
        .setName("level")
        .setDescription("Mức pitch (-12 đến +12 semitones)")
        .setMinValue(-12)
        .setMaxValue(12)
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
        player.filters.remove("Pitch");
        const embed = new EmbedBuilder()
          .setColor("Gray")
          .setDescription("🎼 Đã reset pitch về mức bình thường");
        return interaction.editReply({ embeds: [embed] });
      }

      try {
        await player.filters.set("Pitch", { pitch: level });
      } catch (err) {
        console.log("Pitch không hỗ trợ:", err);
      }

      const pitchEmoji = level > 0 ? "⬆️" : "⬇️";
      const pitchText = level > 0 ? "cao hơn" : "thấp hơn";

      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setDescription(
          `🎼 ${pitchEmoji} Đã thay đổi pitch: **${level > 0 ? '+' : ''}${level}** semitones (${pitchText})\n\n⚠️ *Có thể mất vài giây để áp dụng*`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh pitch:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi thay đổi pitch!");
    }
  },
};
