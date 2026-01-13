import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("replay")
    .setDescription("🔁 Phát lại bài hát hiện tại từ đầu"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const track = player.currentTrack;
      
      // Tua về đầu bài
      await player.seek(0);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setDescription(`🔁 Đang phát lại: **${track.title}**`)
        .setThumbnail(track.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh replay:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi phát lại bài hát!");
    }
  },
};
