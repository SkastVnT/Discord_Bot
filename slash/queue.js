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
    try {
      const player = getPlayer(interaction.guildId);
      if (!player || !player.isPlaying) {
        return interaction.editReply(
          "❌ Không có bài hát nào trong danh sách chờ!"
        );
      }

      // Kiểm tra xem queue có tồn tại không
      if (!player.queue || !player.queue.tracks) {
        return interaction.editReply(
          "❌ Không thể truy cập hàng chờ!"
        );
      }

      const tracks = player.queue.tracks.toArray();
      const totalPages = Math.ceil(tracks.length / 10) || 1;
      const page = (interaction.options.getNumber("page") || 1) - 1;

      if (page >= totalPages) {
        return interaction.editReply(
          `⚠️ Chỉ có ${totalPages} trang danh sách chờ.`
        );
      }

      const current = player.currentTrack;
      const queueStr = tracks
        .slice(page * 10, page * 10 + 10)
        .map(
          (t, i) =>
            `**${page * 10 + i + 1}.** \`[${t.duration || "N/A"}]\` ${t.title || "Unknown"} — <@${
              t.requestedBy?.id || "Unknown"
            }>`
        )
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setDescription(
          `🎶 **Đang phát:**\n` +
            (current
              ? `\`[${current.duration || "N/A"}]\` ${current.title || "Unknown"}`
              : "Không có bài hát") +
            `\n\n📜 **Hàng chờ:**\n${queueStr || "Trống!"}`
        )
        .setFooter({ text: `Trang ${page + 1}/${totalPages}` })
        .setThumbnail(current?.thumbnail || null);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh queue:", error);
      return interaction.editReply(
        "❌ Đã xảy ra lỗi khi hiển thị danh sách chờ!"
      );
    }
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
