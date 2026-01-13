import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import os from "os";

export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("📊 Hiển thị thống kê bot"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);
      
      // Tính uptime
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      // Memory usage
      const memUsage = process.memoryUsage();
      const memUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
      const memTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);

      // System info
      const cpuUsage = process.cpuUsage();
      const platform = os.platform();
      const arch = os.arch();
      const nodeVersion = process.version;

      // Music stats
      const queueSize = player?.queue.tracks.size || 0;
      const isPlaying = player?.isPlaying || false;
      const currentTrack = player?.currentTrack?.title || "Không có";

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("📊 Thống kê Bot")
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          {
            name: "🤖 Bot",
            value: `**Tên:** ${client.user.tag}\n**Uptime:** ${uptimeStr}\n**Node:** ${nodeVersion}`,
            inline: true,
          },
          {
            name: "💾 Bộ nhớ",
            value: `**Used:** ${memUsed} MB\n**Total:** ${memTotal} MB\n**Platform:** ${platform}/${arch}`,
            inline: true,
          },
          {
            name: "🎵 Nhạc",
            value: `**Đang phát:** ${isPlaying ? "✅" : "❌"}\n**Bài hiện tại:** ${currentTrack.substring(0, 30)}${currentTrack.length > 30 ? "..." : ""}\n**Hàng chờ:** ${queueSize} bài`,
            inline: false,
          }
        )
        .setFooter({
          text: `Personal Bot | ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh stats:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi hiển thị thống kê!");
    }
  },
};
