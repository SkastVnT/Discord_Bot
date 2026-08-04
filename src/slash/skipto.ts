import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { buildNowPlayingEmbed, errorEmbed, warningEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("skipto")
    .setDescription("⏩ Chuyển đến bài hát theo số thứ tự")
    .addNumberOption((option) =>
      option
        .setName("tracknumber")
        .setDescription("Số thứ tự bài hát trong danh sách chờ")
        .setMinValue(1)
        .setRequired(true),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.queue.size) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào trong danh sách chờ!")] });
      }

      const num = interaction.options.getNumber("tracknumber", true);
      if (num > player.queue.size) {
        return interaction.editReply({ embeds: [warningEmbed("Số bài hát không hợp lệ!")] });
      }

      await player.skip(num - 1);
      const track = player.currentTrack;

      if (track) {
        await interaction.editReply({
          embeds: [buildNowPlayingEmbed(track, player, interaction.user)],
        });
      } else {
        await interaction.editReply({ embeds: [errorEmbed("Đã chuyển bài nhưng không tải được thông tin bài tiếp theo!")] });
      }
    } catch (error) {
      console.error("Lỗi trong lệnh skipto:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi chuyển bài hát!")] });
    }
  },
};

export default cmd;
