import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { buildNowPlayingEmbed, buildControlRows, controlStateOf, errorEmbed } from "../utils/embeds.js";
import { hasActiveTrack } from "../utils/player.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("📀 Hiển thị thông tin bài hát đang phát"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!hasActiveTrack(player)) {
        return interaction.editReply({
          embeds: [errorEmbed("Không có bài hát nào đang phát!")],
        });
      }

      const track = player.currentTrack;
      if (!track) {
        return interaction.editReply({
          embeds: [errorEmbed("Không thể lấy thông tin bài hát!")],
        });
      }

      const embed = buildNowPlayingEmbed(track, player, interaction.user);
      const controlRows = buildControlRows(controlStateOf(player));

      await interaction.editReply({ embeds: [embed], components: controlRows });
    } catch (error) {
      console.error("Lỗi trong lệnh info:", error);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi hiển thị thông tin bài hát!")],
      });
    }
  },
};

export default cmd;
