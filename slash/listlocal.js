import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// Đường dẫn folder nhạc local của bạn
const MUSIC_FOLDER = "C:\\Users\\SkastVnT\\Downloads\\Music";

export default {
  data: new SlashCommandBuilder()
    .setName("listlocal")
    .setDescription("📂 Xem danh sách nhạc local có thể phát")
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Trang số (mỗi trang 15 bài)")
        .setRequired(false)
        .setMinValue(1)
    ),

  async run({ client, interaction }) {
    await interaction.deferReply();

    // Kiểm tra folder tồn tại
    if (!existsSync(MUSIC_FOLDER)) {
      return interaction.editReply(
        `❌ Folder không tồn tại: \`${MUSIC_FOLDER}\`\n💡 Sửa đường dẫn trong file listlocal.js`
      );
    }

    const supportedFormats = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus"];
    const files = readdirSync(MUSIC_FOLDER)
      .filter((f) => {
        const fullPath = join(MUSIC_FOLDER, f);
        return statSync(fullPath).isFile() && supportedFormats.includes(extname(f).toLowerCase());
      })
      .sort();

    if (files.length === 0) {
      return interaction.editReply(
        `❌ Không có file nhạc trong folder!\n📁 Folder: \`${MUSIC_FOLDER}\`\n🎵 Hỗ trợ: ${supportedFormats.join(", ")}`
      );
    }

    // Phân trang
    const page = interaction.options.getInteger("page") || 1;
    const itemsPerPage = 15;
    const totalPages = Math.ceil(files.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, files.length);

    if (page > totalPages) {
      return interaction.editReply(
        `❌ Trang ${page} không tồn tại! Chỉ có ${totalPages} trang.`
      );
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
      .setColor(0x00ff99)
      .setTitle("📂 Danh sách nhạc Local")
      .setDescription(
        `📁 **Folder:** \`${MUSIC_FOLDER}\`\n🎵 **Tổng cộng:** ${files.length} bài\n\n${fileList}`
      )
      .setFooter({
        text: `📄 Trang ${page}/${totalPages} • Dùng /playlocal <số> để phát`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
