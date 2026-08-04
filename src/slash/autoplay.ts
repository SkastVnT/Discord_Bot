import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, warningEmbed, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("📻 Bật/tắt chế độ tự động phát bài liên quan"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player) {
        return interaction.editReply({ embeds: [errorEmbed("Không có player nào đang hoạt động!")] });
      }

      const currentAutoplay = player.autoplay ?? false;
      player.autoplay = !currentAutoplay;

      const embed = player.autoplay
        ? successEmbed("📻 Đã **bật** chế độ autoplay!\n\n✨ *Bot sẽ tự động phát bài liên quan khi hết queue*")
        : warningEmbed("❌ Đã **tắt** chế độ autoplay");

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh autoplay:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi thay đổi autoplay!")] });
    }
  },
};

export default cmd;
