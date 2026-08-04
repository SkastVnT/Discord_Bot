import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("replay")
    .setDescription("🔁 Phát lại bài hát hiện tại từ đầu"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.isPlaying) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào đang phát!")] });
      }

      const track = player.currentTrack!;

      await player.seek(0);

      await interaction.editReply({
        embeds: [
          successEmbed(`🔁 Đang phát lại: **${track.title}**`)
            .setThumbnail(track.thumbnail ?? null),
        ],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh replay:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi phát lại bài hát!")] });
    }
  },
};

export default cmd;
