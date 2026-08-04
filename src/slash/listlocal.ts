import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import { COLORS, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

// Bug fix #8: use MUSIC_FOLDER env var instead of hardcoded path

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("listlocal")
    .setDescription("📂 Xem danh sách nhạc local có thể phát")
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Trang số (mỗi trang 15 bài)")
        .setRequired(false)
        .setMinValue(1),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();

    const MUSIC_FOLDER = process.env.MUSIC_FOLDER ?? "";
    if (!MUSIC_FOLDER || !existsSync(MUSIC_FOLDER)) {
      return interaction.editReply({
        embeds: [errorEmbed("Folder không tồn tại hoặc chưa được cấu hình!\n💡 Thêm `MUSIC_FOLDER=...` vào file .env")],
      });
    }

    const supportedFormats = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus"];
    const files = readdirSync(MUSIC_FOLDER)
      .filter((f) => {
        const fullPath = join(MUSIC_FOLDER, f);
        return (
          statSync(fullPath).isFile() &&
          supportedFormats.includes(extname(f).toLowerCase())
        );
      })
      .sort();

    if (files.length === 0) {
      return interaction.editReply({
        embeds: [errorEmbed(`Không có file nhạc trong folder!\n📁 Folder: \`${MUSIC_FOLDER}\`\n🎵 Hỗ trợ: ${supportedFormats.join(", ")}`)],
      });
    }

    const page = interaction.options.getInteger("page") ?? 1;
    const itemsPerPage = 15;
    const totalPages = Math.ceil(files.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, files.length);

    if (page > totalPages) {
      return interaction.editReply({
        embeds: [errorEmbed(`Trang ${page} không tồn tại! Chỉ có **${totalPages}** trang.`)],
      });
    }

    const pageFiles = files.slice(startIndex, endIndex);
    const fileList = pageFiles
      .map((file, index) => {
        const num = startIndex + index + 1;
        const size = (statSync(join(MUSIC_FOLDER, file)).size / (1024 * 1024)).toFixed(2);
        const ext = extname(file).substring(1).toUpperCase();
        return `\`${num.toString().padStart(3, " ")}\` **${basename(file, extname(file))}** \`[${ext} ${size}MB]\``;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(COLORS.queue)
      .setTitle("📂 Danh sách nhạc Local")
      .setDescription(
        `📁 **Folder:** \`${MUSIC_FOLDER}\`\n🎵 **Tổng cộng:** ${files.length} bài\n\n${fileList}`,
      )
      .setFooter({
        text: `📄 Trang ${page}/${totalPages} • Dùng /playlocal <số> để phát`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default cmd;
