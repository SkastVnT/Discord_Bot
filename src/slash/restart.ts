import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { infoEmbed, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("🔄 Khởi động lại bài hát hiện tại"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.isPlaying) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào đang phát!")] });
      }

      const track = player.currentTrack!;

      await player.stop();
      await player.play(track);

      await interaction.editReply({
        embeds: [
          infoEmbed(`🔄 Đã khởi động lại: **${track.title}**`)
            .setThumbnail(track.thumbnail),
        ],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh restart:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi khởi động lại bài hát!")] });
    }
  },
};

export default cmd;
