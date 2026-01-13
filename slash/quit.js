import { SlashCommandBuilder } from "@discordjs/builders";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("quit")
    .setDescription("⛔ Dừng bot và xóa danh sách chờ"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);
      if (!player) return interaction.editReply("❌ Không có hàng chờ để thoát.");

      player.destroy();
      await interaction.editReply("👋 Tạm biệt! ❤️");
    } catch (error) {
      console.error("Lỗi trong lệnh quit:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi thoát!");
    }
  },
};
