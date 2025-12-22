import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("grab")
    .setDescription("💾 Gửi thông tin bài hát đang phát vào DM của bạn"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const track = player.currentTrack;

      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setTitle("💾 Bài hát đã lưu")
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
          {
            name: "👤 Ca sĩ",
            value: track.author || "Không rõ",
            inline: true,
          },
          {
            name: "⏱️ Thời lượng",
            value: track.duration,
            inline: true,
          },
          {
            name: "📡 Nguồn",
            value: track.source || "Unknown",
            inline: true,
          }
        )
        .setFooter({
          text: `Yêu cầu từ server: ${interaction.guild.name}`,
        })
        .setTimestamp();

      try {
        await interaction.user.send({ embeds: [embed] });
        await interaction.editReply(
          "✅ Đã gửi thông tin bài hát vào DM của bạn!"
        );
      } catch (error) {
        await interaction.editReply(
          "❌ Không thể gửi DM! Hãy bật nhận tin nhắn từ thành viên server."
        );
      }
    } catch (error) {
      console.error("Lỗi trong lệnh grab:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi lưu bài hát!");
    }
  },
};
