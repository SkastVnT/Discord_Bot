import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { infoEmbed, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("swap")
    .setDescription("🔄 Hoán đổi vị trí 2 bài hát trong hàng chờ")
    .addNumberOption((option) =>
      option
        .setName("position1")
        .setDescription("Vị trí bài hát thứ nhất")
        .setMinValue(1)
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName("position2")
        .setDescription("Vị trí bài hát thứ hai")
        .setMinValue(1)
        .setRequired(true),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.queue.tracks.size) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào trong hàng chờ!")] });
      }

      const pos1 = interaction.options.getNumber("position1", true) - 1;
      const pos2 = interaction.options.getNumber("position2", true) - 1;
      const tracks = player.queue.tracks.toArray();

      if (pos1 < 0 || pos1 >= tracks.length || pos2 < 0 || pos2 >= tracks.length) {
        return interaction.editReply({
          embeds: [errorEmbed(`Vị trí không hợp lệ! Hàng chờ có **${tracks.length}** bài.`)],
        });
      }

      if (pos1 === pos2) {
        return interaction.editReply({ embeds: [errorEmbed("Hai vị trí giống nhau!")] });
      }

      const track1 = tracks[pos1]!;
      const track2 = tracks[pos2]!;

      // Swap algorithm: remove + insert handles index shifting correctly
      // for both pos1 < pos2 and pos1 > pos2 cases.
      player.queue.remove(pos1);
      player.queue.insert(track2, pos1);
      player.queue.remove(pos2);
      player.queue.insert(track1, pos2);

      await interaction.editReply({
        embeds: [
          infoEmbed(
            `🔄 Đã hoán đổi:\n**#${pos1 + 1}** ${track1.title}\n↕️\n**#${pos2 + 1}** ${track2.title}`,
          ),
        ],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh swap:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi hoán đổi!")] });
    }
  },
};

export default cmd;
