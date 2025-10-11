import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getManager, getPlayer } from "ziplayer";

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
    .setDescription(
      "🧪 Kiểm tra một liên kết có phát được hay không qua tất cả subcommand của /play"
    )
    .addStringOption((option) =>
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
      { name: "/play song", queryType: "youtube_video" },
      { name: "/play playlist", queryType: "youtube_playlist" },
      { name: "/play search", queryType: "youtube_search" },
      { name: "/play soundcloud", queryType: "soundcloud_search" },
      { name: "/play spotify", queryType: "spotify_search" },
      { name: "/play spotifyalbum", queryType: "spotify_album" },
    ];

    const results = [];

    for (const test of tests) {
      try {
        const result = await getManager().search(url, interaction.user);

        if (!result || !result.tracks || result.tracks.length === 0) {
          results.push(`❌ **${test.name}** → Không phát được`);
        } else {
          const firstTrack = result.tracks?.[0];
          results.push(
            `✅ **${test.name}** → ${firstTrack.title || "Phát được"}`
          );
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
