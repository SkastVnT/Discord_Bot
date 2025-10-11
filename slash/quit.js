import { SlashCommandBuilder } from "@discordjs/builders";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("quit")
    .setDescription("⛔ Dừng bot và xóa danh sách chờ"),

  async run({ client, interaction }) {
    const player = getPlayer(interaction.guildId);
    if (!player) return interaction.editReply("❌ Không có hàng chờ để thoát.");

    player.destroy();
    await interaction.editReply("👋 Tạm biệt! ❤️");
  },
};
