import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed, warningEmbed } from "../utils/embeds.js";
import { hasActiveTrack } from "../utils/player.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("⏸️ Dừng bài hát hiện tại"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      // Kiểm tra pause TRƯỚC: isPlaying là false lúc đang pause, nên nếu để guard
      // "không có bài nào đang phát" lên trước thì nhánh cảnh báo dưới thành code chết.
      if (!hasActiveTrack(player)) {
        return interaction.editReply({
          embeds: [errorEmbed("Không có bài hát nào đang phát!")],
        });
      }

      if (player.isPaused) {
        return interaction.editReply({
          embeds: [warningEmbed("Nhạc đang được tạm dừng. Dùng `/resume` để tiếp tục!")],
        });
      }

      player.pause();
      await interaction.editReply({
        embeds: [successEmbed("⏸️ Nhạc đã được tạm dừng. Dùng `/resume` để tiếp tục!")],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh pause:", error);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi tạm dừng nhạc!")],
      });
    }
  },
};

export default cmd;
