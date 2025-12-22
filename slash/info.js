import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getManager } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("📀 Hiển thị thông tin bài hát đang phát"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const track = player.currentTrack;

      const progress = player.getProgressBar({
        timecodes: true,
        length: 20,
      });

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle("🎶 Đang phát:")
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
          {
            name: "👤 Ca sĩ / Tác giả",
            value: track.author || "Không rõ",
            inline: true,
          },
          { name: "⏱️ Thời lượng", value: String(track.duration || "N/A"), inline: true },
          {
            name: "📡 Nguồn",
            value: track.source || "Không xác định",
            inline: true,
          },
          {
            name: "🧍‍♂️ Người yêu cầu",
            value: `${track.requestedBy}`,
            inline: true,
          }
        )
        .addFields({ name: "▶️ Tiến trình", value: `\`\`\`${progress}\`\`\`` })
        .setFooter({ text: "🎧 Hãy thưởng thức âm nhạc nào~" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh info:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi hiển thị thông tin bài hát!");
    }
    const manager = getManager();
    const player = manager.players.get(interaction.guildId);

    if (!player || !player.playing) {
      return interaction.channel.send("❌ Không có bài hát nào đang phát!");
    }

    const track = player.currentTrack;
    if (!track) {
      return interaction.channel.send("⚠️ Không thể lấy thông tin bài hát hiện tại.");
    }

    const timestamp = player.node.getTimestamp();
    const progress = createProgressBar(timestamp, track.duration);

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setTitle("🎶 Đang phát:")
      .setDescription(`**[${track.title}](${track.url})**`)
      .setThumbnail(track.thumbnail)
      .addFields(
        {
          name: "👤 Ca sĩ / Tác giả",
          value: track.author || "Không rõ",
          inline: true,
        },
        { name: "⏱️ Thời lượng", value: track.duration || "Không rõ", inline: true },
        {
          name: "📡 Nguồn",
          value: track.source || "Không xác định",
          inline: true,
        },
        {
          name: "🧍‍♂️ Người yêu cầu",
          value: `${track.requestedBy || "Ẩn danh"}`,
          inline: true,
        },
        {
          name: "▶️ Tiến trình",
          value: `\`\`\`${progress}\`\`\``,
        }
      )
      .setFooter({ text: "🎧 Hãy thưởng thức âm nhạc nào~" })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
  },
};

function createProgressBar(timestamp, totalDuration) {
  if (!timestamp || !timestamp.current || !timestamp.total)
    return "Không rõ tiến trình.";

  const total = timestamp.total;
  const current = timestamp.current;
  const barLength = 20;
  const progress = Math.floor((current / total) * barLength);
  const bar = "▬".repeat(progress) + "🔘" + "▬".repeat(barLength - progress);

  const formatTime = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return `${bar} (${formatTime(current)} / ${formatTime(total)})`;
}
