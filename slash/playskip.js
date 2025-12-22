import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("playskip")
    .setDescription("⚡ Phát bài hát ngay lập tức và skip bài hiện tại")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Link hoặc tên bài hát")
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.editReply(
          "❌ Bạn cần vào voice channel trước!"
        );
      }

      await interaction.editReply("🔍 Đang tìm bài hát...");

      const player = getPlayer(interaction.guildId);
      if (!player) {
        return interaction.editReply("❌ Không có player nào!");
      }

      const query = interaction.options.getString("url");
      const result = await player.search(query, interaction.user);

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");
      }

      const track = result.tracks[0];
      
      // Thêm vào đầu queue và skip
      player.queue.insert(track, 0);
      await player.skip();

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("⚡ Đang phát ngay")
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .setFooter({ text: `⏱️ ${track.duration} | 👤 ${track.author}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh playskip:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi phát bài hát!");
    }
  },
};
