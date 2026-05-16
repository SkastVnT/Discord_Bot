import { SlashCommandBuilder, EmbedBuilder, type GuildMember } from "discord.js";
import {
  createAudioResource,
  createAudioPlayer,
  StreamType,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { getPlayer, getManager } from "ziplayer";
import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import type { SlashCommand } from "../types/command.js";

// Bug fix #8: use MUSIC_FOLDER env var instead of hardcoded path

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("playlocal")
    .setDescription("🎵 Phát nhạc local từ máy tính")
    .addStringOption((option) =>
      option
        .setName("file")
        .setDescription("Tên file hoặc số thứ tự (dùng /listlocal để xem)")
        .setRequired(true),
    ),

  async run({ client: _client, interaction }) {
    const voiceChannel = (interaction.member as GuildMember)?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ Bạn cần vào voice channel trước!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const MUSIC_FOLDER = process.env.MUSIC_FOLDER ?? "";
    if (!MUSIC_FOLDER || !existsSync(MUSIC_FOLDER)) {
      return interaction.editReply(
        `❌ Folder không tồn tại hoặc chưa được cấu hình!\n💡 Thêm \`MUSIC_FOLDER=...\` vào file .env`,
      );
    }

    const input = interaction.options.getString("file", true);
    let filePath: string | null = null;

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
      return interaction.editReply(
        `❌ Không có file nhạc trong folder!\n📁 Folder: \`${MUSIC_FOLDER}\`\n🎵 Hỗ trợ: ${supportedFormats.join(", ")}`,
      );
    }

    if (/^\d+$/.test(input)) {
      const index = parseInt(input, 10) - 1;
      if (index >= 0 && index < files.length) {
        filePath = join(MUSIC_FOLDER, files[index]!);
      }
    } else {
      const found = files.find((f) => f.toLowerCase().includes(input.toLowerCase()));
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
        `❌ Không tìm thấy file: \`${input}\`\n\n📂 **${files.length} file có sẵn** (10 đầu tiên):\n\`\`\`\n${fileList}\n\`\`\`\n💡 Dùng \`/listlocal\` để xem đầy đủ`,
      );
    }

    try {
      let player = getPlayer(interaction.guildId!);
      if (!player) {
        player = await getManager().create(interaction.guildId!, {
          userdata: { channel: interaction.channel as import("discord.js").GuildTextBasedChannel | null },
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

      const fileName = basename(filePath);
      const fileSize = (statSync(filePath).size / (1024 * 1024)).toFixed(2);

      const resource = createAudioResource(filePath, {
        inlineVolume: true,
        inputType: StreamType.Arbitrary,
      });

      if (resource.volume) {
        resource.volume.setVolume((player.volume ?? 100) / 100);
      }

      // Reuse existing node (audio player) or create a new one
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let audioPlayer: any;
      if (player.node) {
        audioPlayer = player.node;
      } else {
        audioPlayer = createAudioPlayer({
          behaviors: { noSubscriber: NoSubscriberBehavior.Play },
        });
        player.connection!.subscribe(audioPlayer);
        player.node = audioPlayer;
      }

      audioPlayer.play(resource);

      const embed = new EmbedBuilder()
        .setColor(0x00ff99)
        .setTitle("🎵 Đang phát nhạc Local")
        .setDescription(`**${fileName}**`)
        .addFields(
          { name: "📁 Đường dẫn", value: `\`${filePath}\``, inline: false },
          { name: "💾 Kích thước", value: `${fileSize} MB`, inline: true },
          { name: "👤 Yêu cầu bởi", value: interaction.user.tag, inline: true },
        )
        .setFooter({ text: "🎵 Local Music Player" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("🚨 Lỗi phát nhạc local:", error);
      await interaction.editReply(
        "❌ Đã xảy ra lỗi khi phát nhạc local. Kiểm tra file có tồn tại và định dạng hợp lệ không.",
      );
    }
  },
};

export default cmd;
