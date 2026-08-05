import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { COLORS, buildQueuePageRow, errorEmbed, warningEmbed, formatDuration } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const PAGE_SIZE = 10;

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("📜 Hiển thị danh sách bài hát trong hàng chờ")
    .addNumberOption((option) =>
      option.setName("page").setDescription("Trang danh sách (1, 2, 3...)").setMinValue(1),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.isPlaying) {
        return interaction.editReply({
          embeds: [errorEmbed("Không có bài hát nào trong danh sách chờ!")],
        });
      }

      if (!player.queue) {
        return interaction.editReply({
          embeds: [errorEmbed("Không thể truy cập hàng chờ!")],
        });
      }

      const tracks = player.queue.getTracks();
      const totalPages = Math.ceil(tracks.length / PAGE_SIZE) || 1;
      const page = (interaction.options.getNumber("page") ?? 1) - 1;

      if (page >= totalPages) {
        return interaction.editReply({
          embeds: [warningEmbed(`Chỉ có **${totalPages}** trang danh sách chờ.`)],
        });
      }

      const current = player.currentTrack;
      const queueStr = tracks
        .slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
        .map(
          (t, i) =>
            `**${page * PAGE_SIZE + i + 1}.** \`[${formatDuration(t.duration)}]\` ${t.title ?? "Unknown"}`,
        )
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(COLORS.queue)
        .setTitle(`📜 Hàng chờ — Trang ${page + 1}/${totalPages}`)
        .setDescription(
          `🎶 **Đang phát:** ${current ? `\`[${formatDuration(current.duration)}]\` ${current.title ?? "Unknown"}` : "*Không có*"}\n\n` +
            `${queueStr || "*Trống!*"}`,
        )
        .setThumbnail(current?.thumbnail ?? null)
        .setFooter({ text: `${tracks.length} bài trong hàng chờ` });

      const components = totalPages > 1 ? [buildQueuePageRow(page, totalPages)] : [];
      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      console.error("Lỗi trong lệnh queue:", error);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi hiển thị danh sách chờ!")],
      });
    }
  },
};

export default cmd;
