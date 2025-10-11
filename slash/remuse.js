import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("▶️ Tiếp tục phát nhạc"),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.node.isPaused())
      return interaction.editReply("❌ Không có bài hát nào đang bị tạm dừng!");

    queue.node.resume();
    await interaction.editReply("▶️ Tiếp tục phát nhạc!");
  },
};
