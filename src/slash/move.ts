import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
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

      if (!player || !player.queue.tracks.size) {
        return interaction.editReply("❌ Không có bài hát nào trong hàng chờ!");
      }

      const from = interaction.options.getNumber("from", true) - 1;
      const to = interaction.options.getNumber("to", true) - 1;
      const tracks = player.queue.tracks.toArray();

      if (from < 0 || from >= tracks.length || to < 0 || to >= tracks.length) {
        return interaction.editReply(
          `❌ Vị trí không hợp lệ! Hàng chờ có ${tracks.length} bài.`,
        );
      }

      if (from === to) {
        return interaction.editReply("❌ Vị trí hiện tại và đích trùng nhau!");
      }

      const track = tracks[from]!;

      player.queue.remove(from);
      player.queue.insert(track, to);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(
          `🔄 Đã di chuyển **${track.title}**\nTừ vị trí **#${from + 1}** → **#${to + 1}**`,
        )
        .setThumbnail(track.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh move:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi di chuyển bài hát!");
    }
  },
};

export default cmd;
