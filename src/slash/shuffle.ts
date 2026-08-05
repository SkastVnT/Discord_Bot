import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("🔀 Trộn ngẫu nhiên danh sách chờ"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.queue.size) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào trong danh sách chờ!")] });
      }

      const count = player.queue.size;
      player.shuffle();
      await interaction.editReply({
        embeds: [successEmbed(`🔀 Đã trộn ngẫu nhiên **${count}** bài hát!`)],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh shuffle:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi trộn danh sách!")] });
    }
  },
};

export default cmd;
