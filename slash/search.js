import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("🔍 Tìm kiếm và chọn bài hát")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Tên bài hát muốn tìm")
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

      const query = interaction.options.getString("query");
      await interaction.editReply("🔍 Đang tìm kiếm...");

      const player = getPlayer(interaction.guildId);
      if (!player) {
        return interaction.editReply("❌ Không có player nào!");
      }

      const result = await player.search(query, interaction.user, {
        searchEngine: "youtube_search",
      });

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");
      }

      const tracks = result.tracks.slice(0, 10);
      
      const description = tracks
        .map(
          (t, i) =>
            `**${i + 1}.** [${t.title}](${t.url})\n` +
            `\`⏱️ ${t.duration}\` | \`👤 ${t.author}\``
        )
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("🔍 Kết quả tìm kiếm")
        .setDescription(
          description +
            "\n\n💡 *Sử dụng `/play song [url]` để phát bài cụ thể*"
        )
        .setFooter({ text: `Tìm thấy ${tracks.length} kết quả` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh search:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi tìm kiếm!");
    }
  },
};
