import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("rewind")
    .setDescription("⏪ Tua lùi bài hát")
    .addNumberOption((option) =>
      option
        .setName("seconds")
        .setDescription("Số giây muốn tua lùi (mặc định: 10s)")
        .setMinValue(1)
        .setMaxValue(300)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const seconds = interaction.options.getNumber("seconds") || 10;
      const track = player.currentTrack;
      
      // Lấy vị trí hiện tại
      const currentPosition = player.position || 0;
      const newPosition = Math.max(0, currentPosition - seconds * 1000);

      await player.seek(newPosition);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(
          `⏪ Đã tua lùi **-${seconds}s** trong bài **${track.title}**`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh rewind:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi tua lùi bài hát!");
    }
  },
};
