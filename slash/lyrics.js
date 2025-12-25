import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import lyricsFinder from "lyrics-finder";
import { ViFonttrim } from "../ViFont.js";
import { getPlayer } from "ziplayer";
import { lyricsExt as LyricsExt } from "@ziplayer/extension";

export default {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("📜 Tìm lời bài hát đang phát hoặc theo tên")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Tên bài hát (tùy chọn)")
        .setRequired(false)
    ),

  async run({ client, interaction }) {
    await interaction.deferReply();
    const player = getPlayer(interaction.guildId);
    const songName =
      interaction.options.getString("name") ||
      player?.currentTrack?.title ||
      null;

    if (!songName) {
      return interaction.editReply(
        "❌ Không tìm thấy bài hát đang phát hoặc tên không hợp lệ."
      );
    }

    // Extract song name and artist
    const track = player?.currentTrack;
    
    // Clean title thoroughly
    let cleanSongName = songName
      .replace(/\s*-?\s*(Official Video|Official Music Video|Lyrics?|Lyric Video|MV|Audio|HD|4K)\s*/gi, '')
      .replace(/\s*[\[\(].*?[\]\)]\s*/g, '') // Remove brackets
      .replace(/\s*[|\u2022]\s*/g, '') // Remove | and bullet points
      .split(/[-–—]/).map(s => s.trim()).filter(Boolean)[0] || songName; // Take first part before dash
    
    cleanSongName = cleanSongName.trim();
    
    console.log(`🎵 Original: "${songName}"`);
    console.log(`🎵 Cleaned: "${cleanSongName}"`);

    await interaction.editReply(
      `🔍 Đang tìm lời bài hát cho "${cleanSongName}"...`
    );

    try {
      let lyrics = null;

      // Try lyrics-finder with cleaned title
      try {
        console.log(`🔍 Searching lyrics-finder...`);
        lyrics = await lyricsFinder(cleanSongName);
        console.log(`📊 lyrics-finder result: ${lyrics?.length || 0} chars`);
        if (lyrics && lyrics.length > 50) {
          console.log("✅ Found lyrics via lyrics-finder");
        } else {
          lyrics = null; // Reset if too short
        }
      } catch (error) {
        console.log("⚠️ lyrics-finder failed:", error.message);
      }

      if (!lyrics || lyrics.length < 50) {
        return interaction.editReply(
          `❌ Không tìm thấy lời cho "${cleanSongName}" (có thể do bài hát Việt Nam).\n💡 Dùng \`/ailyrics\` để tìm bằng AI hoặc thử tên tiếng Anh.`
        );
      }

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle(`🎵 ${cleanSongName}`)
        .setDescription(ViFonttrim(lyrics, 4000))
        .setFooter({ text: "📜 Via lyrics-finder" })
        .setTimestamp();

      if (track?.thumbnail) {
        embed.setThumbnail(track.thumbnail);
      }

      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (error) {
      console.error("❌ Lyrics command error:", error);
      await interaction.editReply(
        `⚠️ Lỗi khi tìm lyrics: ${error.message}\n💡 Hãy thử lại sau.`
      );
    }
  },
};
