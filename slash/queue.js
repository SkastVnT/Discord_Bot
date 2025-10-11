import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getManager } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("📜 Hiển thị danh sách bài hát trong hàng chờ")
    .addNumberOption((option) =>
      option
        .setName("page")
        .setDescription("Trang danh sách (1, 2, 3...)")
        .setMinValue(1)
    ),

  async run({ client, interaction }) {
    const manager = getManager();
    const player = manager.players.get(interaction.guildId);

    if (!player || !player.playing) {
      return interaction.channel.send("❌ Không có bài hát nào trong danh sách chờ!");
    }

    const tracks = Array.isArray(player.queue.tracks)
      ? player.queue.tracks
      : Array.from(player.queue.tracks || []);

    const totalPages = Math.ceil(tracks.length / 10) || 1;
    const page = (interaction.options.getNumber("page") || 1) - 1;

    if (page >= totalPages) {
      return interaction.channel.send(`⚠️ Chỉ có ${totalPages} trang danh sách chờ.`);
    }

    const current = player.currentTrack;
    const queueStr = tracks
      .slice(page * 10, page * 10 + 10)
      .map(
        (t, i) =>
          `**${page * 10 + i + 1}.** \`[${t.duration}]\` ${t.title} — <@${
            t.requestedBy?.id || "?"
          }>`
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setDescription(
        `🎶 **Đang phát:**\n` +
          (current
            ? `\`[${current.duration}]\` ${current.title}`
            : "Không có bài hát") +
          `\n\n📜 **Hàng chờ:**\n${queueStr || "Trống!"}`
      )
      .setFooter({ text: `Trang ${page + 1}/${totalPages}` })
      .setThumbnail(current?.thumbnail || null);

    await interaction.channel.send({ embeds: [embed] });
  },
};
