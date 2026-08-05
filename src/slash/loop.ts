import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { infoEmbed, errorEmbed } from "../utils/embeds.js";
import { hasActiveTrack } from "../utils/player.js";
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

      if (!hasActiveTrack(player)) {
        return interaction.editReply({ embeds: [errorEmbed("Không có bài hát nào đang phát để lặp lại!")] });
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

      await interaction.editReply({ embeds: [infoEmbed(msg)] });
    } catch (error) {
      console.error("Lỗi trong lệnh loop:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi thay đổi chế độ lặp!")] });
    }
  },
};

export default cmd;
