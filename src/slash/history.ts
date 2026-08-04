import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { COLORS, errorEmbed, warningEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("📜 Xem lịch sử các bài đã phát")
    .addNumberOption((option) =>
      option
        .setName("page")
        .setDescription("Trang lịch sử (mặc định: 1)")
        .setMinValue(1),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player) {
        return interaction.editReply({ embeds: [errorEmbed("Không có player nào đang hoạt động!")] });
      }

      const history = player.history?.tracks?.toArray() ?? [];

      if (!history.length) {
        return interaction.editReply({ embeds: [warningEmbed("Chưa có lịch sử phát nhạc!")] });
      }

      const page = (interaction.options.getNumber("page") ?? 1) - 1;
      const totalPages = Math.ceil(history.length / 10);

      if (page >= totalPages) {
        return interaction.editReply({ embeds: [warningEmbed(`Chỉ có **${totalPages}** trang lịch sử.`)] });
      }

      const historyStr = history
        .slice(page * 10, page * 10 + 10)
        .map(
          (t, i) =>
            `**${page * 10 + i + 1}.** [${t.title}](${t.url})\n` +
            `\`⏱️ ${t.duration}\` | \`👤 ${t.author}\``,
        )
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setColor(COLORS.queue)
        .setTitle("📜 Lịch sử phát nhạc")
        .setDescription(historyStr || "Chưa có lịch sử")
        .setFooter({
          text: `Trang ${page + 1}/${totalPages} | Tổng: ${history.length} bài`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh history:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi hiển thị lịch sử!")] });
    }
  },
};

export default cmd;
