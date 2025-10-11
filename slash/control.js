import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { ViFontfetchInteraction, ViFonttrim } from "../ViFont.js";
import { extractSongTitle, setSyncedLyrics } from "./lyrics.js";
import { getPlayer } from "ziplayer";
import { lyricsExt } from "@ziplayer/extension";

export default {
  data: new SlashCommandBuilder()
    .setName("control")
    .setDescription("🎛️ Điều khiển trình phát nhạc như một ứng dụng mini"),

  async run({ client, interaction }) {
    const msg = await ViFontfetchInteraction(interaction);

    const player = getPlayer(interaction.guildId);
    if (!player || !player.isPlaying) {
      return interaction.editReply("❌ Không có bài hát nào đang phát!");
    }

    const track = player.currentTrack;
    const authorName = track.author?.toLowerCase() || "";
    const cleanedTitle = extractSongTitle(track.title, authorName);
    const lyricsExt = new lyricsExt();
    // 🔍 Tìm lyrics
    let results;
    try {
      results = await lyricsExt.fetch(`${cleanedTitle} ${authorName}`);
    } catch (err) {
      console.log("Lyrics search error:", err);
    }

    let lyrics =
      results?.find(
        (r) =>
          r?.artistName?.toLowerCase().includes(authorName) ||
          cleanedTitle.toLowerCase().includes(r?.trackName?.toLowerCase())
      ) || results?.[0];

    if (!lyrics?.plainLyrics && !lyrics?.syncedLyrics) {
      try {
        const fallback = await player.lyrics.search(cleanedTitle);
        lyrics = fallback?.[0];
      } catch (e) {
        console.log(e);
      }
    }

    if (!lyrics?.plainLyrics && !lyrics?.syncedLyrics) {
      return interaction.editReply("❌ Không tìm thấy lyrics cho bài này!");
    }

    // 🖼️ Embed gốc hiển thị
    const embed = new EmbedBuilder()
      .setTitle("🎶 Đang phát")
      .setColor("Random")
      .setAuthor({ name: track.author })
      .setThumbnail(track.thumbnail)
      .setDescription(`🎵 **${track.title}**\n\nĐang tải lyrics...`);

    const controlMessage = await interaction.editReply({ embeds: [embed] });

    // 🎤 Đồng bộ lyrics (nếu có synced)
    const synced = queue.syncedLyrics(lyrics);
    await setSyncedLyrics(queue, controlMessage, synced);

    synced?.onChange(async (line, time) => {
      const progress = queue.node.createProgressBar({
        timecodes: true,
        length: 18,
      });
      const timeFmt = new Date(time).toISOString().substr(14, 5);
      embed.setDescription(
        `🎵 **${track.title}**\n\n${progress}\n\n🕒 [${timeFmt}]\n**${line}**`
      );
      try {
        await controlMessage.edit({ embeds: [embed] });
      } catch {}
    });
    synced?.subscribe();

    // 🎚️ Các nút điều khiển
    const mainControls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("back")
        .setEmoji("⏮️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("pause_resume")
        .setEmoji(queue.node.isPaused() ? "▶️" : "⏸️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("skip")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("loop")
        .setEmoji("🔁")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shuffle")
        .setEmoji("🔀")
        .setStyle(ButtonStyle.Secondary)
    );

    const secondaryControls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("lyrics_popup")
        .setLabel("📜 Lyrics")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("queue_popup")
        .setLabel("📄 Queue")
        .setStyle(ButtonStyle.Secondary)
    );

    await controlMessage.edit({
      components: [mainControls, secondaryControls],
    });

    // 🧩 Collector để bắt hành động của user
    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (!player) {
        return btn.reply({
          content: "❌ Không có bài hát nào đang phát!",
          ephemeral: true,
        });
      }

      switch (btn.customId) {
        case "pause_resume":
          !player.isPaused ? player.pause() : player.resume();
          await btn.reply({
            content: player.isPaused
              ? "⏸️ Đã tạm dừng phát nhạc"
              : "▶️ Tiếp tục phát nhạc",
            ephemeral: true,
          });
          break;

        case "skip":
          await player.skip();
          await btn.reply({
            content: "⏭️ Đã chuyển sang bài kế tiếp",
            ephemeral: true,
          });
          break;

        case "back":
          if (player.previousTrack) {
            await player.previous();
            await btn.reply({
              content: "⏮️ Quay lại bài hát trước",
              ephemeral: true,
            });
          } else {
            await btn.reply({
              content: "❌ Không có bài nào trước đó!",
              ephemeral: true,
            });
          }
          break;

        case "shuffle":
          player.shuffle();
          await btn.reply({
            content: "🔀 Đã trộn ngẫu nhiên danh sách phát!",
            ephemeral: true,
          });
          break;

        case "loop":
          const newMode = player.loop === "track" ? "off" : "track";
          player.loop(newMode);
          await btn.reply({
            content:
              newMode === "track"
                ? "🔁 Bật chế độ lặp lại bài hát hiện tại!"
                : "➡️ Đã tắt chế độ lặp lại",
            ephemeral: true,
          });
          break;

        case "lyrics_popup":
          await btn.reply({
            content: ViFonttrim(lyrics?.plainLyrics || "Không có lyrics!"),
            ephemeral: true,
          });
          break;

        case "queue_popup":
          const tracks = queue.tracks.toArray().slice(0, 10);
          if (!tracks.length)
            return btn.reply({
              content: "📭 Danh sách chờ hiện đang trống.",
              ephemeral: true,
            });
          const list = tracks.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
          await btn.reply({
            content: `📄 **Danh sách chờ:**\n${list}`,
            ephemeral: true,
          });
          break;

        default:
          await btn.reply({
            content: "❓ Không xác định hành động này.",
            ephemeral: true,
          });
      }
    });

    collector.on("end", async () => {
      try {
        await controlMessage.edit({ components: [] });
      } catch {}
    });
  },
};
