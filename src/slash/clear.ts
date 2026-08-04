import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed, warningEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🗑️ Xóa toàn bộ hàng chờ"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player) {
        return interaction.editReply({ embeds: [errorEmbed("Không có hàng chờ nào!")] });
      }

      const queueSize = player.queue.size;

      if (queueSize === 0) {
        return interaction.editReply({ embeds: [warningEmbed("Hàng chờ đã trống!")] });
      }

      player.queue.clear();

      await interaction.editReply({
        embeds: [successEmbed(`🗑️ Đã xóa **${queueSize}** bài hát khỏi hàng chờ!`)],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh clear:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi xóa hàng chờ!")] });
    }
  },
};

export default cmd;
