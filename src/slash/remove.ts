import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed, trackThumbnail } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("❌ Xóa một bài hát khỏi hàng chờ")
    .addNumberOption((option) =>
      option
        .setName("position")
        .setDescription("Vị trí bài hát trong hàng chờ")
        .setMinValue(1)
        .setRequired(true),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.queue.size) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào trong hàng chờ!")] });
      }

      const position = interaction.options.getNumber("position", true) - 1;
      const tracks = player.queue.getTracks();

      if (position < 0 || position >= tracks.length) {
        return interaction.editReply({
          embeds: [errorEmbed(`Vị trí không hợp lệ! Hàng chờ có **${tracks.length}** bài.`)],
        });
      }

      const removedTrack = tracks[position]!;
      player.queue.remove(position);

      await interaction.editReply({
        embeds: [
          successEmbed(`Đã xóa: **${removedTrack.title}** khỏi vị trí **#${position + 1}**`)
            .setThumbnail(trackThumbnail(removedTrack)),
        ],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh remove:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi xóa bài hát!")] });
    }
  },
};

export default cmd;
