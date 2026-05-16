import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
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
        return interaction.editReply("❌ Không có hàng chờ nào!");
      }

      const queueSize = player.queue.tracks.size;

      if (queueSize === 0) {
        return interaction.editReply("❌ Hàng chờ đã trống!");
      }

      player.queue.clear();

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription(`🗑️ Đã xóa **${queueSize}** bài hát khỏi hàng chờ!`);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh clear:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi xóa hàng chờ!");
    }
  },
};

export default cmd;
