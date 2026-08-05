import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import {
  successEmbed,
  errorEmbed,
  warningEmbed,
  buildNowPlayingEmbed,
  buildControlRows,
  controlStateOf,
} from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("back")
    .setDescription("⏮️ Quay lại bài hát trước đó"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.isPlaying) {
        return interaction.editReply({
          embeds: [errorEmbed("Không có bài hát nào đang phát!")],
        });
      }

      const success = await player.previous();

      if (!success) {
        return interaction.editReply({
          embeds: [warningEmbed("Không có bài hát trước đó trong lịch sử!")],
        });
      }

      // Hiện luôn bài đang phát cho khớp cách /skip trả lời, thay vì chỉ một câu thông báo.
      const track = player.currentTrack;
      if (track) {
        const embed = buildNowPlayingEmbed(track, player, interaction.user, {
          note: "⏮️ Đã quay lại bài trước",
        });
        return interaction.editReply({
          embeds: [embed],
          components: buildControlRows(controlStateOf(player)),
        });
      }

      await interaction.editReply({
        embeds: [successEmbed("⏮️ Đang phát lại bài hát trước đó!")],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh back:", error);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi quay lại bài hát trước!")],
      });
    }
  },
};

export default cmd;
