import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("⏸️ Dừng bài hát hiện tại"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      player.pause();
      await interaction.editReply(
        "⏸️ Nhạc đã được tạm dừng. Sử dụng `/resume` để tiếp tục.",
      );
    } catch (error) {
      console.error("Lỗi trong lệnh pause:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi tạm dừng nhạc!");
    }
  },
};

export default cmd;
