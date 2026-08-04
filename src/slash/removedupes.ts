import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed, warningEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("removedupes")
    .setDescription("🗑️ Xóa các bài hát trùng lặp trong hàng chờ"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.queue.size) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào trong hàng chờ!")] });
      }

      const tracks = player.queue.getTracks();
      const seen = new Set<string>();
      const duplicates: number[] = [];

      for (let i = tracks.length - 1; i >= 0; i--) {
        const track = tracks[i]!;
        if (seen.has(track.url)) {
          duplicates.push(i);
        } else {
          seen.add(track.url);
        }
      }

      if (duplicates.length === 0) {
        return interaction.editReply({ embeds: [warningEmbed("Không có bài hát trùng lặp!")] });
      }

      for (const index of duplicates) {
        player.queue.remove(index);
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            `🗑️ Đã xóa **${duplicates.length}** bài trùng lặp! Còn lại: **${player.queue.size}** bài`,
          ),
        ],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh removedupes:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi xóa bài trùng!")] });
    }
  },
};

export default cmd;
