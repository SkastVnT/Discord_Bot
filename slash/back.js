import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("back")
    .setDescription("⏮️ Quay lại bài hát trước đó"),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.node.isPlaying()) {
      return interaction.editReply("❌ Không có bài hát nào đang phát!");
    }

    const success = await queue.history.back();

    if (!success) {
      return interaction.editReply("⚠️ Không có bài hát trước đó trong lịch sử!");
    }

    await interaction.editReply("⏮️ Đang phát lại bài hát trước đó!");
  },
};
