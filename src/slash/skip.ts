import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { buildNowPlayingEmbed, warningEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("⏭️ Bỏ qua bài hát hiện tại"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.isPlaying) {
        return interaction.editReply({
          embeds: [errorEmbed("Không có bài hát nào để bỏ qua!")],
        });
      }

      const skipped = player.currentTrack!;
      await player.skip();
      const next = player.currentTrack;

      if (next) {
        const embed = buildNowPlayingEmbed(next, player, interaction.user);
        embed.setDescription(`⏭️ Đã bỏ qua: **${skipped.title}**`);
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          embeds: [successEmbed(`⏭️ Đã bỏ qua: **${skipped.title}**\n*Hàng chờ đã hết!*`)],
        });
      }
    } catch (error) {
      console.error("Lỗi trong lệnh skip:", error);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi bỏ qua bài hát!")],
      });
    }
  },
};

export default cmd;
