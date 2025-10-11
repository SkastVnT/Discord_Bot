import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("🔀 Trộn ngẫu nhiên danh sách chờ"),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.tracks.size)
      return interaction.editReply("❌ Không có bài hát nào trong danh sách chờ!");

    queue.tracks.shuffle();
    await interaction.editReply(`🔀 Danh sách gồm ${queue.tracks.size} bài hát đã được trộn ngẫu nhiên!`);
  },
};
