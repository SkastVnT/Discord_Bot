import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("🔁 Bật hoặc tắt chế độ lặp lại bài hát / playlist")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Chọn kiểu lặp lại")
        .addChoices(
          { name: "🔂 single", value: "single" },
          { name: "🔁 playlist", value: "playlist" },
          { name: "❌ off", value: "off" },
        )
        .setRequired(true),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát để lặp lại!");
      }

      const mode = interaction.options.getString("mode", true);
      let repeatMode: "track" | "queue" | "off";

      switch (mode) {
        case "single":
          repeatMode = "track";
          break;
        case "playlist":
          repeatMode = "queue";
          break;
        default:
          repeatMode = "off";
          break;
      }

      player.loop(repeatMode);

      const msg =
        repeatMode === "track"
          ? "🎵 Lặp lại bài hát hiện tại"
          : repeatMode === "queue"
            ? "🎶 Lặp lại toàn bộ playlist"
            : "🛑 Đã tắt chế độ lặp";

      const embed = new EmbedBuilder().setColor("Random").setDescription(`✅ ${msg}`);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh loop:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi thay đổi chế độ lặp!");
    }
  },
};

export default cmd;
