import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("⏸️ Dừng bài hát hiện tại"),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.node.isPlaying()) {
      return interaction.editReply("❌ Không có bài hát nào đang phát!");
    }

    queue.node.pause();
    await interaction.editReply("⏸️ Nhạc đã được tạm dừng. Sử dụng `/resume` để tiếp tục.");
  },
};
