import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { COLORS, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("playtime")
    .setDescription("⏱️ Hiển thị tổng thời gian đã phát nhạc trong session"),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player) {
        return interaction.editReply({ embeds: [errorEmbed("Không có player nào đang hoạt động!")] });
      }

      // ZiPlayer 0.3.x: lịch sử ở queue.previousTracks, duration đã là millisecond
      const history = player.queue.previousTracks;

      let totalMs = 0;
      for (const track of history) {
        if (Number.isFinite(track.duration)) totalMs += track.duration;
      }

      if (player.currentTrack) {
        totalMs += player.getTime().current;
      }

      const hours = Math.floor(totalMs / 3600000);
      const minutes = Math.floor((totalMs % 3600000) / 60000);
      const seconds = Math.floor((totalMs % 60000) / 1000);

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
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
            value: `**${player.queue.size}** bài`,
            inline: true,
          },
        )
        .setFooter({ text: "Session hiện tại" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh playtime:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi tính thời gian!")] });
    }
  },
};

export default cmd;
