import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("related")
    .setDescription("🎲 Phát bài hát liên quan đến bài hiện tại"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.currentTrack) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      await interaction.editReply("🔍 Đang tìm bài hát liên quan...");

      const currentTrack = player.currentTrack;
      
      // Tìm bài liên quan bằng cách search tên ca sĩ
      const searchQuery = `${currentTrack.author} music`;
      const result = await player.search(searchQuery, interaction.user);

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy bài liên quan!");
      }

      // Lấy bài ngẫu nhiên (không phải bài hiện tại)
      const relatedTracks = result.tracks.filter(
        (t) => t.url !== currentTrack.url
      );

      if (!relatedTracks.length) {
        return interaction.editReply("❌ Không tìm thấy bài liên quan khác!");
      }

      const randomTrack =
        relatedTracks[Math.floor(Math.random() * relatedTracks.length)];

      player.queue.add(randomTrack);

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle("🎲 Đã thêm bài liên quan")
        .setDescription(`**[${randomTrack.title}](${randomTrack.url})**`)
        .setThumbnail(randomTrack.thumbnail)
        .setFooter({ text: `⏱️ ${randomTrack.duration} | 👤 ${randomTrack.author}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh related:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi tìm bài liên quan!");
    }
  },
};
