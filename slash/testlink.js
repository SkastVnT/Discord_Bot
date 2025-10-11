import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { QueryType } from "discord-player";

/**
 * Chuẩn hóa link YouTube rút gọn (youtu.be → youtube.com/watch?v=)
 */
function normalizeYouTubeUrl(url) {
  if (url.includes("youtu.be/")) {
    try {
      const videoId = url.split("youtu.be/")[1].split(/[?&]/)[0];
      return `https://www.youtube.com/watch?v=${videoId}`;
    } catch {
      return url;
    }
  }
  return url;
}

export default {
  data: new SlashCommandBuilder()
    .setName("testlink")
    .setDescription("🧪 Kiểm tra một liên kết có phát được hay không qua tất cả subcommand của /play")
    .addStringOption(option =>
      option
        .setName("url")
        .setDescription("Liên kết nhạc bạn muốn kiểm tra")
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    const rawUrl = interaction.options.getString("url");
    const url = normalizeYouTubeUrl(rawUrl);

    await interaction.deferReply();

    const tests = [
      { name: "/play song", queryType: QueryType.YOUTUBE_VIDEO },
      { name: "/play playlist", queryType: QueryType.YOUTUBE_PLAYLIST },
      { name: "/play search", queryType: QueryType.YOUTUBE_SEARCH },
      { name: "/play soundcloud", queryType: QueryType.SOUNDCLOUD },
      { name: "/play spotify", queryType: QueryType.SPOTIFY },
      { name: "/play spotifyalbum", queryType: QueryType.SPOTIFY_ALBUM },
    ];

    const results = [];

    for (const test of tests) {
      try {
        const result = await client.player.search(url, {
          requestedBy: interaction.user,
          searchEngine: test.queryType,
        });

        if (!result || !result.tracks || result.tracks.size === 0) {
          results.push(`❌ **${test.name}** → Không phát được`);
        } else {
          const firstTrack = result.tracks.at(0);
          results.push(`✅ **${test.name}** → ${firstTrack.title || "Phát được"}`);
        }
      } catch (err) {
        results.push(`⚠️ **${test.name}** → Lỗi: ${err.message}`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🧪 Kết quả kiểm tra URL")
      .setColor("Random")
      .setDescription(`🔗 **Link:** ${url}\n\n${results.join("\n")}`)
      .setFooter({ text: "discord-player v7.1.0 test" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
