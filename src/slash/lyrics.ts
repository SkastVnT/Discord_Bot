import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { lyricsExt } from "@ziplayer/extension";
import { COLORS, buildLyricsPageRow, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const PAGE_SIZE = 3500;

// Keyed by reply message ID — expires after 10 minutes
export const lyricsPageCache = new Map<
  string,
  { pages: string[]; trackName: string; expires: number }
>();

function paginate(text: string): string[] {
  const lines = text.split("\n");
  const pages: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > PAGE_SIZE) {
      pages.push(current.trim());
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current.trim()) pages.push(current.trim());
  return pages;
}

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("🎤 Xem lời bài hát")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Tên bài hát (bỏ trống để dùng bài đang phát)")
        .setRequired(false),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      let query = interaction.options.getString("query") ?? null;

      if (!query) {
        const player = getPlayer(interaction.guildId!);
        const track = player?.currentTrack;
        if (!track) {
          return interaction.editReply({
            embeds: [
              errorEmbed("Không có bài hát nào đang phát và bạn chưa nhập tên bài!"),
            ],
          });
        }
        query = `${track.title} ${track.author ?? ""}`.trim();
      }

      const lyric = new lyricsExt();
      const res = await lyric.fetch({ title: query });

      if (!res?.text) {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              `Không tìm thấy lyrics cho **${query}**\n*Thử dùng tên tiếng Anh hoặc tên chính xác hơn.*`,
            ),
          ],
        });
      }

      const trackName = res.trackName ?? query;
      const pages = paginate(res.text);
      const totalPages = pages.length;

      const buildPage = (p: number) =>
        new EmbedBuilder()
          .setColor(COLORS.lyrics)
          .setTitle(`🎤 ${trackName}`)
          .setDescription(pages[p]!)
          .setFooter({
            text: `📄 Trang ${p + 1}/${totalPages} • Powered by lrclib`,
            iconURL: interaction.user.displayAvatarURL({ size: 32 }),
          })
          .setTimestamp();

      const msg = await interaction.editReply({
        embeds: [buildPage(0)],
        components: totalPages > 1 ? [buildLyricsPageRow(0, totalPages)] : [],
      });

      if (totalPages > 1) {
        lyricsPageCache.set(msg.id, {
          pages,
          trackName,
          expires: Date.now() + 10 * 60 * 1000,
        });
        // Prune expired entries
        for (const [id, entry] of lyricsPageCache) {
          if (Date.now() > entry.expires) lyricsPageCache.delete(id);
        }
      }
    } catch (err) {
      console.error("Lỗi trong lệnh lyrics:", err);
      await interaction.editReply({
        embeds: [errorEmbed("Đã xảy ra lỗi khi tải lyrics!")],
      });
    }
  },
};

export default cmd;
