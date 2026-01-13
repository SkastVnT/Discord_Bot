import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("playtime")
    .setDescription("⏱️ Hiển thị tổng thời gian đã phát nhạc trong session"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);

      if (!player) {
        return interaction.editReply("❌ Không có player nào đang hoạt động!");
      }

      // Tính tổng thời gian từ history (nếu có)
      const history = player.history?.tracks?.toArray() || [];
      
      let totalMs = 0;
      for (const track of history) {
        totalMs += parseDuration(track.duration);
      }

      // Thêm bài hiện tại nếu đang phát
      if (player.currentTrack) {
        totalMs += player.position || 0;
      }

      const hours = Math.floor(totalMs / 3600000);
      const minutes = Math.floor((totalMs % 3600000) / 60000);
      const seconds = Math.floor((totalMs % 60000) / 1000);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("⏱️ Thống kê thời gian phát nhạc")
        .addFields(
          {
            name: "📊 Tổng thời gian",
            value: `**${hours}h ${minutes}m ${seconds}s**`,
            inline: true,
          },
          {
            name: "🎵 Số bài đã phát",
            value: `**${history.length}** bài`,
            inline: true,
          },
          {
            name: "📜 Trong hàng chờ",
            value: `**${player.queue.tracks.size}** bài`,
            inline: true,
          }
        )
        .setFooter({ text: "Session hiện tại" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh playtime:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi tính thời gian!");
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
