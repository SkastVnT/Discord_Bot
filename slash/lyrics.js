import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import lyricsFinder from "lyrics-finder";
import { ViFonttrim } from "../ViFont.js";
import { getManager } from "ziplayer";

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
    const manager = getManager();
    const player = manager.players.get(interaction.guildId);

    const songName =
      interaction.options.getString("name") ||
      player?.currentTrack?.title ||
      null;

    if (!songName) {
      return interaction.channel.send(
        "❌ Không tìm thấy bài hát đang phát hoặc tên không hợp lệ."
      );
    }

    const loadingMsg = await interaction.channel.send("🔍 Đang tìm lời bài hát...");

    try {
      let lyricsText = null;

      const lyricsExtension = player?.extensions?.get?.("lyricsExt");
      if (lyricsExtension && typeof lyricsExtension.fetch === "function") {
        lyricsText = await lyricsExtension.fetch(songName);
      }

      if (!lyricsText) {
        lyricsText =
          (await lyricsFinder(songName)) || "Không tìm thấy lời bài hát.";
      }

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle(`🎵 Lời bài hát: ${songName}`)
        .setDescription(ViFonttrim(lyricsText?.text || lyricsText, 4000))
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      await loadingMsg.delete().catch(() => {});
    } catch (error) {
      console.error("🚨 Lỗi khi tìm lyrics:", error);
      await interaction.channel.send(`⚠️ Lỗi khi tìm lyrics: ${error.message}`);
      await loadingMsg.delete().catch(() => {});
    }
  },
};
