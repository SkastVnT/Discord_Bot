import {
  SlashCommandBuilder,
  EmbedBuilder,
  type GuildMember,
  type GuildTextBasedChannel,
} from "discord.js";
import {
  createAudioResource,
  createAudioPlayer,
  StreamType,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import { COLORS, errorEmbed } from "../utils/embeds.js";
import { ensurePlayer, ensureConnected } from "../utils/player.js";
import type { SlashCommand } from "../types/command.js";

// Bug fix #8: use MUSIC_FOLDER env var instead of hardcoded path

// ZiPlayer 0.3.x Player không có chỗ nào để gắn AudioPlayer thô, nên giữ riêng
// theo guildId ở đây thay vì nhồi vào player.userdata (đang dùng cho .channel).
// Lấy type từ chính hàm factory: `import type { AudioPlayer }` dưới moduleResolution
// Node16 tạo ra một declaration khác với bản value import nên hai bên không khớp nhau.
const localAudioPlayers = new Map<string, ReturnType<typeof createAudioPlayer>>();

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
      const player = await ensurePlayer(
        interaction.guildId!,
        interaction.channel as GuildTextBasedChannel | null,
      );
      await ensureConnected(player, voiceChannel);

      const fileName = basename(filePath);
      const fileSize = (statSync(filePath).size / (1024 * 1024)).toFixed(2);

      const resource = createAudioResource(filePath, {
        inlineVolume: true,
        inputType: StreamType.Arbitrary,
      });

      if (resource.volume) {
        resource.volume.setVolume((player.volume ?? 100) / 100);
      }

      // Reuse existing audio player for this guild, or create and subscribe a new one
      const guildId = interaction.guildId!;
      let audioPlayer = localAudioPlayers.get(guildId);
      if (!audioPlayer) {
        audioPlayer = createAudioPlayer({
          behaviors: { noSubscriber: NoSubscriberBehavior.Play },
        });
        // ziplayer là CJS nên @discordjs/voice của nó resolve ra một declaration khác
        // với bản ESM ở file này — cùng một class runtime, hai type không tương thích.
        // Cast đúng sang type mà subscribe() của ziplayer mong đợi.
        const connection = player.connection!;
        connection.subscribe(
          audioPlayer as unknown as Parameters<typeof connection.subscribe>[0],
        );
        localAudioPlayers.set(guildId, audioPlayer);
      }

      audioPlayer.play(resource);

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
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
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi phát nhạc local. Kiểm tra file có tồn tại và định dạng hợp lệ không.")],
      });
    }
  },
};

export default cmd;
