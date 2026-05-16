import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("🔄 Khởi động lại bài hát hiện tại"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const track = player.currentTrack!;

      await player.stop();
      await player.play(track);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(`🔄 Đã khởi động lại: **${track.title}**`)
        .setThumbnail(track.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh restart:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi khởi động lại bài hát!");
    }
  },
};

export default cmd;
