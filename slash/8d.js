import { SlashCommandBuilder } from "@discordjs/builders";

export default {
  data: new SlashCommandBuilder()
    .setName("8d")
    .setDescription("Bật/tắt hiệu ứng âm thanh 8D xoay quanh đầu bạn"),
  async run(interaction, client) {
    await interaction.deferReply();
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.node.isPlaying()) {
      return interaction.editReply("❌ Không có bài nào đang phát!");
    }

    const filters = queue.filters;
    const isEnabled = filters.has("8D");

    if (isEnabled) {
      filters.remove("8D");
      await interaction.editReply("🧠 Đã tắt hiệu ứng 8D.");
    } else {
      filters.add("8D");
      await interaction.editReply("🎧 Đã bật hiệu ứng 8D!");
    }
  },
};
