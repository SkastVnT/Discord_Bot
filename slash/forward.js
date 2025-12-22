import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("forward")
    .setDescription("⏩ Tua nhanh bài hát")
    .addNumberOption((option) =>
      option
        .setName("seconds")
        .setDescription("Số giây muốn tua (mặc định: 10s)")
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
      const newPosition = currentPosition + seconds * 1000;
      
      const durationMs = parseDuration(track.duration);

      if (newPosition > durationMs) {
        return interaction.editReply("❌ Không thể tua quá độ dài bài hát!");
      }

      await player.seek(newPosition);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(
          `⏩ Đã tua **+${seconds}s** trong bài **${track.title}**`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh forward:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi tua bài hát!");
    }
  },
};

function parseDuration(duration) {
  const parts = duration.split(":").reverse();
  let ms = 0;
  ms += parseInt(parts[0]) * 1000;
  if (parts[1]) ms += parseInt(parts[1]) * 60 * 1000;
  if (parts[2]) ms += parseInt(parts[2]) * 3600 * 1000;
  return ms;
}
