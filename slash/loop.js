import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { QueueRepeatMode } from "discord-player";

export default {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("🔁 Bật hoặc tắt chế độ lặp lại bài hát / playlist")
    .addStringOption(option =>
      option
        .setName("mode")
        .setDescription("Chọn kiểu lặp lại")
        .addChoices(
          { name: "🔂 single", value: "single" },
          { name: "🔁 playlist", value: "playlist" },
          { name: "❌ off", value: "off" }
        )
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.node.isPlaying()) {
      return interaction.editReply("❌ Không có bài hát nào đang phát để lặp lại!");
    }

    const mode = interaction.options.getString("mode");
    let repeatMode;

    switch (mode) {
      case "single":
        repeatMode = QueueRepeatMode.TRACK;
        break;
      case "playlist":
        repeatMode = QueueRepeatMode.QUEUE;
        break;
      case "off":
      default:
        repeatMode = QueueRepeatMode.OFF;
        break;
    }

    queue.setRepeatMode(repeatMode);

    const msg =
      repeatMode === QueueRepeatMode.TRACK
        ? "🎵 Lặp lại bài hát hiện tại"
        : repeatMode === QueueRepeatMode.QUEUE
        ? "🎶 Lặp lại toàn bộ playlist"
        : "🛑 Đã tắt chế độ lặp";

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setDescription(`✅ ${msg}`);

    await interaction.editReply({ embeds: [embed] });
  },
};
