import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { createAudioResource, createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior } from "@discordjs/voice";
import { getPlayer, getManager } from "ziplayer";
import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// Đường dẫn folder nhạc local của bạn
const MUSIC_FOLDER = "C:\\Users\\SkastVnT\\Downloads\\Music";

export default {
  data: new SlashCommandBuilder()
    .setName("playlocal")
    .setDescription("🎵 Phát nhạc local từ máy tính")
    .addStringOption((option) =>
      option
        .setName("file")
        .setDescription("Tên file hoặc số thứ tự (dùng /listlocal để xem)")
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ Bạn cần vào voice channel trước!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    // Kiểm tra folder tồn tại
    if (!existsSync(MUSIC_FOLDER)) {
      return interaction.editReply(
        `❌ Folder không tồn tại: \`${MUSIC_FOLDER}\`\n💡 Sửa đường dẫn trong file playlocal.js`
      );
    }

    const input = interaction.options.getString("file");
    let filePath = null;

    // Lấy danh sách file
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

    // Tìm file theo số thứ tự hoặc tên
    if (/^\d+$/.test(input)) {
      const index = parseInt(input) - 1;
      if (index >= 0 && index < files.length) {
        filePath = join(MUSIC_FOLDER, files[index]);
      }
    } else {
      // Tìm theo tên (không phân biệt hoa thường)
      const found = files.find((f) =>
        f.toLowerCase().includes(input.toLowerCase())
      );
      if (found) {
        filePath = join(MUSIC_FOLDER, found);
      }
    }

    if (!filePath || !existsSync(filePath)) {
      const fileList = files
        .slice(0, 10)
        .map((f, i) => `${i + 1}. ${basename(f)}`)
        .join("\n");

      return interaction.editReply(
        `❌ Không tìm thấy file: \`${input}\`\n\n📂 **${files.length} file có sẵn** (10 đầu tiên):\n\`\`\`\n${fileList}\n\`\`\`\n💡 Dùng \`/listlocal\` để xem đầy đủ`
      );
    }

    try {
      // Lấy hoặc tạo player
      let player = getPlayer(interaction.guildId);
      if (!player) {
        player = await getManager().create(interaction.guildId, {
          userdata: { channel: interaction.channel },
          selfDeaf: true,
          volume: 80,
          leaveOnEmpty: false,
          leaveOnEnd: false,
          leaveOnStop: false,
        });
      }

      if (!player.connection) {
        await player.connect(voiceChannel);
      }

      // Tạo audio resource từ file local
      const resource = createAudioResource(filePath, {
        inlineVolume: true,
      });

      // Set volume
      resource.volume?.setVolume(player.volume / 100);

      // Phát nhạc
      player.node.play(resource);

      const fileName = basename(filePath);
      const fileSize = (statSync(filePath).size / (1024 * 1024)).toFixed(2);

      const embed = new EmbedBuilder()
        .setColor(0x00ff99)
        .setTitle("🎵 Đang phát nhạc Local")
        .setDescription(`**${fileName}**`)
        .addFields(
          { name: "📁 Đường dẫn", value: `\`${filePath}\``, inline: false },
          { name: "💾 Kích thước", value: `${fileSize} MB`, inline: true },
          { name: "👤 Yêu cầu bởi", value: interaction.user.tag, inline: true }
        )
        .setFooter({ text: "🎵 Local Music Player" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Thêm event listener khi phát xong
      player.node.on(AudioPlayerStatus.Idle, () => {
        console.log("✅ Local file finished playing");
      });

    } catch (error) {
      console.error("🚨 Lỗi phát nhạc local:", error);
      await interaction.editReply(
        `❌ Lỗi: ${error.message}\n💡 Kiểm tra file có tồn tại và định dạng hợp lệ không.`
      );
    }
  },
};
