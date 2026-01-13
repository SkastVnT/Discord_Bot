import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("🔀 Trộn ngẫu nhiên danh sách chờ"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.queue.tracks.size)
        return interaction.editReply(
          "❌ Không có bài hát nào trong danh sách chờ!"
        );

      player.shuffle();
      await interaction.editReply(
        `🔀 Danh sách gồm ${player.queue.tracks.size} bài hát đã được trộn ngẫu nhiên!`
      );
    } catch (error) {
      console.error("Lỗi trong lệnh shuffle:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi trộn danh sách!");
    }
  },
};
