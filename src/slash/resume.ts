// Bug fix #9: renamed from remuse.js → resume.ts (file now matches command name)
import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed, warningEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("▶️ Tiếp tục phát nhạc"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player) {
        return interaction.editReply({
          embeds: [errorEmbed("Không có player nào đang hoạt động!")],
        });
      }

      if (!player.isPaused) {
        return interaction.editReply({
          embeds: [warningEmbed("Nhạc đang phát, không cần resume!")],
        });
      }

      player.resume();
      await interaction.editReply({
        embeds: [successEmbed("▶️ Tiếp tục phát nhạc!")],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh resume:", error);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi tiếp tục phát nhạc!")],
      });
    }
  },
};

export default cmd;
