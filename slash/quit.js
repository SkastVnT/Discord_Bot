import { SlashCommandBuilder } from "@discordjs/builders";

export default {
  data: new SlashCommandBuilder()
    .setName("quit")
    .setDescription("⛔ Dừng bot và xóa danh sách chờ"),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);
    if (!queue) return interaction.editReply("❌ Không có hàng chờ để thoát.");

    queue.delete();
    await interaction.editReply("👋 Tạm biệt! ❤️");
  }
};
