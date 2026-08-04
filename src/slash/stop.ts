import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("⏹️ Dừng nhạc và xóa toàn bộ hàng chờ"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player) {
        return interaction.editReply({
          embeds: [errorEmbed("Không có player nào đang hoạt động!")],
        });
      }

      const queueSize = player.queue.size;
      player.stop();
      player.queue.clear();

      await interaction.editReply({
        embeds: [
          successEmbed(`⏹️ Đã dừng nhạc và xóa **${queueSize}** bài trong hàng chờ!`),
        ],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh stop:", error);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi dừng nhạc!")],
      });
    }
  },
};

export default cmd;
