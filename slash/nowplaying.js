import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("🎵 Hiển thị chi tiết bài hát đang phát với progress bar"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const track = player.currentTrack;
      const progress = player.getProgressBar?.({
        timecodes: true,
        length: 25,
      }) || createProgressBar(player.position || 0, parseDuration(track.duration));

      const queueSize = player.queue.tracks.size || 0;
      const volume = player.volume || 100;
      const loopMode = getLoopModeText(player.repeatMode);

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setAuthor({
          name: "🎵 Đang phát",
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTitle(track.title)
        .setURL(track.url)
        .setThumbnail(track.thumbnail)
        .addFields(
          {
            name: "👤 Ca sĩ",
            value: track.author || "Không rõ",
            inline: true,
          },
          {
            name: "⏱️ Thời lượng",
            value: track.duration,
            inline: true,
          },
          {
            name: "🔊 Âm lượng",
            value: `${volume}%`,
            inline: true,
          },
          {
            name: "🔁 Lặp lại",
            value: loopMode,
            inline: true,
          },
          {
            name: "📜 Trong hàng chờ",
            value: `${queueSize} bài`,
            inline: true,
          },
          {
            name: "🧍 Yêu cầu bởi",
            value: `${track.requestedBy}`,
            inline: true,
          },
          {
            name: "▶️ Tiến độ",
            value: `\`\`\`${progress}\`\`\``,
            inline: false,
          }
        )
        .setFooter({
          text: `Nguồn: ${track.source || "Unknown"}`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh nowplaying:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi hiển thị bài hát!");
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

function createProgressBar(current, total) {
  const percentage = current / total;
  const barLength = 25;
  const filled = Math.round(barLength * percentage);
  const bar = "━".repeat(filled) + "🔘" + "─".repeat(barLength - filled);
  
  const currentTime = formatTime(current);
  const totalTime = formatTime(total);
  
  return `${currentTime} ${bar} ${totalTime}`;
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getLoopModeText(mode) {
  if (mode === "track" || mode === 1) return "🔂 Bài hát";
  if (mode === "queue" || mode === 2) return "🔁 Playlist";
  return "❌ Tắt";
}
