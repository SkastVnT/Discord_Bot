import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { ViFonttrim } from "../ViFont.js";
import { getManager } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("control")
    .setDescription("🎛️ Điều khiển trình phát nhạc như một ứng dụng mini"),

  async run({ client, interaction }) {
    const manager = getManager();
    const player = manager.players.get(interaction.guildId);

    if (!player || !player.playing) {
      return interaction.channel.send("❌ Không có bài hát nào đang phát!");
    }

    const track = player.currentTrack;
    const lyricsExtension = player?.extensions?.get?.("lyricsExt");
    let lyrics = null;

    if (lyricsExtension && typeof lyricsExtension.fetch === "function") {
      try {
        lyrics = await lyricsExtension.fetch(track.title);
      } catch (err) {
        console.log("Lyrics search error:", err);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🎶 Đang phát")
      .setColor("Random")
      .setAuthor({ name: track.author || "Không rõ" })
      .setThumbnail(track.thumbnail)
      .setDescription(
        `🎵 **${track.title}**\n\n${ViFonttrim(
          lyrics?.text || "Không có lời bài hát",
          1500
        )}`
      );

    const controlMessage = await interaction.channel.send({ embeds: [embed] });

    const mainControls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("back").setEmoji("⏮️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("pause_resume").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("skip").setEmoji("⏭️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary)
    );

    const secondaryControls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lyrics_popup").setLabel("📜 Lyrics").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("queue_popup").setLabel("📄 Queue").setStyle(ButtonStyle.Secondary)
    );

    await controlMessage.edit({ components: [mainControls, secondaryControls] });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      switch (btn.customId) {
        case "pause_resume":
          if (player.node.isPaused()) {
            player.node.resume();
            await btn.reply({ content: "▶️ Tiếp tục phát nhạc", ephemeral: true });
          } else {
            player.node.pause();
            await btn.reply({ content: "⏸️ Đã tạm dừng phát nhạc", ephemeral: true });
          }
          break;

        case "skip":
          await player.skip();
          await btn.reply({ content: "⏭️ Đã chuyển sang bài kế tiếp", ephemeral: true });
          break;

        case "back":
          if (player.previousTrack) {
            await player.previous();
            await btn.reply({ content: "⏮️ Quay lại bài hát trước", ephemeral: true });
          } else {
            await btn.reply({ content: "❌ Không có bài nào trước đó!", ephemeral: true });
          }
          break;

        case "shuffle":
          player.queue.shuffle();
          await btn.reply({ content: "🔀 Đã trộn ngẫu nhiên danh sách phát!", ephemeral: true });
          break;

        case "loop":
          player.setLoop(player.loopMode === "track" ? "off" : "track");
          await btn.reply({
            content:
              player.loopMode === "track"
                ? "🔁 Bật chế độ lặp lại bài hát hiện tại!"
                : "➡️ Đã tắt chế độ lặp lại",
            ephemeral: true,
          });
          break;

        case "lyrics_popup":
          await btn.reply({
            content: ViFonttrim(lyrics?.text || "Không có lyrics!", 1900),
            ephemeral: true,
          });
          break;

        case "queue_popup":
          const tracks = Array.from(player.queue.tracks || []);
          if (!tracks.length)
            return btn.reply({ content: "📭 Danh sách chờ trống.", ephemeral: true });
          const list = tracks.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join("\n");
          await btn.reply({ content: `📄 **Danh sách chờ:**\n${list}`, ephemeral: true });
          break;

        default:
          await btn.reply({ content: "❓ Không xác định hành động này.", ephemeral: true });
      }
    });

    collector.on("end", async () => {
      try {
        await controlMessage.edit({ components: [] });
      } catch {}
    });
  },
};
