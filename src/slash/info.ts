import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import type { SlashCommand } from "../types/command.js";

// Bug fix: removed dead code block + reference to non-existent createProgressBar()
// that appeared after the try/catch (audit bug #3)

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("📀 Hiển thị thông tin bài hát đang phát"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const track = player.currentTrack;
      if (!track) {
        return interaction.editReply("❌ Không thể lấy thông tin bài hát!");
      }

      const progress =
        player.getProgressBar?.({ timecodes: true, length: 20 }) ?? "N/A";

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle("🎶 Đang phát:")
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
          { name: "👤 Ca sĩ / Tác giả", value: track.author || "Không rõ", inline: true },
          { name: "⏱️ Thời lượng", value: String(track.duration ?? "N/A"), inline: true },
          {
            name: "📡 Nguồn",
            value: track.source ?? "Không xác định",
            inline: true,
          },
          {
            name: "🧍‍♂️ Người yêu cầu",
            value: String(track.requestedBy ?? "Ẩn danh"),
            inline: true,
          },
        )
        .addFields({ name: "▶️ Tiến trình", value: `\`\`\`${progress}\`\`\`` })
        .setFooter({ text: "🎧 Hãy thưởng thức âm nhạc nào~" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh info:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi hiển thị thông tin bài hát!");
    }
  },
};

export default cmd;
