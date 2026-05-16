import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
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

      if (!player || !player.queue.tracks.size) {
        return interaction.editReply("❌ Không có bài hát nào trong danh sách chờ!");
      }

      const num = interaction.options.getNumber("tracknumber", true);
      if (num > player.queue.tracks.size) {
        return interaction.editReply("⚠️ Số bài hát không hợp lệ!");
      }

      await player.skip(num - 1);
      const track = player.currentTrack;

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setDescription(
          `⏩ Đã chuyển đến: **[${track?.title ?? "N/A"}](${track?.url ?? ""})**`,
        )
        .setThumbnail(track?.thumbnail ?? null);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh skipto:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi chuyển bài hát!");
    }
  },
};

export default cmd;
