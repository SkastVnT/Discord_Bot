import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("❌ Xóa một bài hát khỏi hàng chờ")
    .addNumberOption((option) =>
      option
        .setName("position")
        .setDescription("Vị trí bài hát trong hàng chờ")
        .setMinValue(1)
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.queue.tracks.size) {
        return interaction.editReply("❌ Không có bài hát nào trong hàng chờ!");
      }

      const position = interaction.options.getNumber("position") - 1;
      const tracks = player.queue.tracks.toArray();

      if (position < 0 || position >= tracks.length) {
        return interaction.editReply(
          `❌ Vị trí không hợp lệ! Hàng chờ có ${tracks.length} bài.`
        );
      }

      const removedTrack = tracks[position];
      player.queue.remove(position);

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription(
          `❌ Đã xóa: **${removedTrack.title}**\nTừ vị trí **#${position + 1}**`
        )
        .setThumbnail(removedTrack.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh remove:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi xóa bài hát!");
    }
  },
};
