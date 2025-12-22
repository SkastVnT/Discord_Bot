import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("⏸️ Dừng bài hát hiện tại"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      player.pause();
      await interaction.editReply(
        "⏸️ Nhạc đã được tạm dừng. Sử dụng `/resume` để tiếp tục."
      );
    } catch (error) {
      console.error("Lỗi trong lệnh pause:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi tạm dừng nhạc!");
    }
  },
};
