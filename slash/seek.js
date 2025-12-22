import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("⏩ Tua bài hát đến thời điểm cụ thể")
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Thời gian (VD: 1:30, 90, 2:15:30)")
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const timeInput = interaction.options.getString("time");
      const milliseconds = parseTime(timeInput);

      if (milliseconds === null) {
        return interaction.editReply(
          "❌ Định dạng thời gian không hợp lệ! VD: `1:30`, `90`, `2:15:30`"
        );
      }

      const track = player.currentTrack;
      const durationMs = parseDuration(track.duration);

      if (milliseconds > durationMs) {
        return interaction.editReply(
          `❌ Thời gian vượt quá độ dài bài hát (${track.duration})`
        );
      }

      await player.seek(milliseconds);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(
          `⏩ Đã tua đến **${formatTime(milliseconds)}** trong bài **${track.title}**`
        )
        .setThumbnail(track.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh seek:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi tua bài hát!");
    }
  },
};

// Parse time input như "1:30" hoặc "90" thành milliseconds
function parseTime(input) {
  try {
    if (input.includes(":")) {
      const parts = input.split(":").reverse();
      let ms = 0;
      ms += parseInt(parts[0]) * 1000; // giây
      if (parts[1]) ms += parseInt(parts[1]) * 60 * 1000; // phút
      if (parts[2]) ms += parseInt(parts[2]) * 3600 * 1000; // giờ
      return ms;
    } else {
      return parseInt(input) * 1000;
    }
  } catch {
    return null;
  }
}

// Parse duration string như "3:45" thành milliseconds
function parseDuration(duration) {
  const parts = duration.split(":").reverse();
  let ms = 0;
  ms += parseInt(parts[0]) * 1000;
  if (parts[1]) ms += parseInt(parts[1]) * 60 * 1000;
  if (parts[2]) ms += parseInt(parts[2]) * 3600 * 1000;
  return ms;
}

// Format milliseconds thành "MM:SS"
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
