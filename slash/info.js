import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("📀 Hiển thị thông tin bài hát đang phát"),

  async run({ client, interaction }) {
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
        { name: "⏱️ Thời lượng", value: track.duration, inline: true },
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
  },
};
