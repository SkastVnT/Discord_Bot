// Bug fix #15: changed import from "@discordjs/builders" to "discord.js"
import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("quit")
    .setDescription("⛔ Dừng bot và xóa danh sách chờ"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);
      if (!player) return interaction.editReply({ embeds: [errorEmbed("Không có hàng chờ để thoát.")] });

      player.destroy();
      await interaction.editReply({ embeds: [successEmbed("👋 Tạm biệt! ❤️")] });
    } catch (error) {
      console.error("Lỗi trong lệnh quit:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi thoát!")] });
    }
  },
};

export default cmd;
