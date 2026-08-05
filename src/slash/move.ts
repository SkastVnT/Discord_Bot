import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { infoEmbed, errorEmbed, trackThumbnail } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("🔄 Di chuyển bài hát trong hàng chờ")
    .addNumberOption((option) =>
      option
        .setName("from")
        .setDescription("Vị trí hiện tại của bài")
        .setMinValue(1)
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName("to")
        .setDescription("Vị trí muốn chuyển đến")
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

      const from = interaction.options.getNumber("from", true) - 1;
      const to = interaction.options.getNumber("to", true) - 1;
      const tracks = player.queue.getTracks();

      if (from < 0 || from >= tracks.length || to < 0 || to >= tracks.length) {
        return interaction.editReply({
          embeds: [errorEmbed(`Vị trí không hợp lệ! Hàng chờ có **${tracks.length}** bài.`)],
        });
      }

      if (from === to) {
        return interaction.editReply({ embeds: [errorEmbed("Vị trí hiện tại và đích trùng nhau!")] });
      }

      const track = tracks[from]!;

      player.queue.remove(from);
      player.queue.insert(track, to);

      await interaction.editReply({
        embeds: [
          infoEmbed(`🔄 Di chuyển: **${track.title}**\nTừ vị trí **#${from + 1}** → **#${to + 1}**`)
            .setThumbnail(trackThumbnail(track)),
        ],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh move:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi di chuyển bài hát!")] });
    }
  },
};

export default cmd;
