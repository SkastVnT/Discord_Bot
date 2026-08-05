import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import type { Track } from "ziplayer";
import { lyricsExt } from "@ziplayer/extension";
import { COLORS, buildLyricsPageRow, errorEmbed, trackAuthor } from "../utils/embeds.js";
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
      const queryInput = interaction.options.getString("query");
      const currentTrack = getPlayer(interaction.guildId!)?.currentTrack ?? null;

      if (!queryInput && !currentTrack) {
        return interaction.editReply({
          embeds: [
            errorEmbed("Không có bài hát nào đang phát và bạn chưa nhập tên bài!"),
          ],
        });
      }

      // lyricsExt.fetch() chỉ đọc title / metadata.author / duration của Track.
      // Khi người dùng nhập tay thì không có Track thật nên dựng object tối thiểu,
      // cast một lần duy nhất ở đây thay vì rải `as any` khắp file.
      const track = queryInput
        ? ({ title: queryInput, metadata: {} } as unknown as Track)
        : currentTrack!;
      const query = queryInput ?? `${currentTrack!.title} ${trackAuthor(currentTrack!, "")}`.trim();

      const res = await new lyricsExt().fetch(track);

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
