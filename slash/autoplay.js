import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("📻 Bật/tắt chế độ tự động phát bài liên quan"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player) {
        return interaction.editReply("❌ Không có player nào đang hoạt động!");
      }

      // Toggle autoplay
      const currentAutoplay = player.autoplay || false;
      player.autoplay = !currentAutoplay;

      const embed = new EmbedBuilder()
        .setColor(player.autoplay ? "Green" : "Red")
        .setDescription(
          player.autoplay
            ? "📻 Đã **bật** chế độ autoplay!\n\n✨ *Bot sẽ tự động phát bài liên quan khi hết queue*"
            : "❌ Đã **tắt** chế độ autoplay"
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh autoplay:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi thay đổi autoplay!");
    }
  },
};
