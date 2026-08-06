import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
} from "discord.js";
import type { ButtonInteraction } from "discord.js";
import type { Track } from "ziplayer";
import { ensurePlayer, ensureConnected, isBusy } from "../utils/player.js";
import { COLORS, errorEmbed, successEmbed, infoEmbed } from "../utils/embeds.js";
import { formatMs } from "../utils/duration.js";
import { trackKey } from "../utils/trackKey.js";
import { parseYouTubeUrl } from "../utils/youtube.js";
import { countBlocked, listBlocked, unblockByKey } from "../db/blocklist.js";
import {
  assertDatabase,
  buildManageView,
  describeError,
  dismissLater,
  registerPlayHandler,
  registerPlayTrackHandler,
  startImport,
} from "../interactions/playlistUi.js";
import {
  addUploadedTrack,
  createPlaylist,
  findPlaylistById,
  findPlaylistByName,
  listPlaylists,
} from "../db/playlists.js";
import { importSearch } from "../services/playlistImport.js";
import { isAllowedAudio, isR2Configured, maxUploadBytes, uploadFromUrl } from "../services/r2.js";
import { PlaylistError } from "../types/playlist.js";
import type { PlaylistDocument, SavedTrack } from "../types/playlist.js";
import type { SlashCommand } from "../types/command.js";

/**
 * Nhóm lệnh /playlist.
 *
 * Giao diện chọn bài nằm ở interactions/playlistUi.ts; file này chỉ lo phần lệnh
 * và việc đưa playlist đã lưu vào ZiPlayer.
 */

// ─── Phát playlist ────────────────────────────────────────────────────────────

/** Số bài resolve song song. Giữ nhỏ để không nện YouTube quá tay. */
const RESOLVE_CONCURRENCY = 4;

/**
 * Đổi một SavedTrack thành Track của ZiPlayer.
 *
 * Cố tình KHÔNG lưu URL stream lúc import: URL stream của YouTube có chữ ký và
 * hết hạn sau vài giờ. Mỗi lần phát phải resolve lại từ URL video chuẩn.
 */
async function resolveTrack(saved: SavedTrack, requestedBy: string): Promise<Track | null> {
  try {
    const result = await importSearch(saved.url, requestedBy);
    return result?.tracks?.[0] ?? null;
  } catch (err) {
    console.warn(`[playlist] không resolve được "${saved.title}": ${(err as Error).message}`);
    return null;
  }
}

async function resolveBatch(tracks: SavedTrack[], requestedBy: string): Promise<Track[]> {
  const out: Track[] = [];
  for (let i = 0; i < tracks.length; i += RESOLVE_CONCURRENCY) {
    const slice = tracks.slice(i, i + RESOLVE_CONCURRENCY);
    const resolved = await Promise.all(slice.map((t) => resolveTrack(t, requestedBy)));
    for (const track of resolved) if (track) out.push(track);
  }
  return out;
}

/**
 * Phát một playlist đã lưu.
 *
 * Resolve BÀI ĐẦU trước rồi phát ngay, phần còn lại chạy nền. Nếu resolve hết mới
 * phát thì một playlist 50 bài phải chờ rất lâu mới có tiếng.
 */
async function playPlaylistDocument(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  playlist: PlaylistDocument,
): Promise<void> {
  const voiceChannel = (interaction.member as GuildMember)?.voice?.channel;
  if (!voiceChannel) {
    const payload = {
      embeds: [errorEmbed("Bạn cần vào voice channel trước!")],
      flags: MessageFlags.Ephemeral as const,
    };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
    return;
  }

  if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

  const ordered = [...playlist.tracks].sort((a, b) => a.position - b.position);
  if (!ordered.length) {
    await interaction.editReply({ embeds: [errorEmbed("Playlist này đang trống.")] });
    return;
  }

  const player = await ensurePlayer(
    interaction.guildId!,
    interaction.channel as GuildTextBasedChannel | null,
  );
  await ensureConnected(player, voiceChannel);

  const first = await resolveTrack(ordered[0]!, interaction.user.id);
  if (!first) {
    await interaction.editReply({
      embeds: [errorEmbed(`Không phát được bài đầu tiên: **${ordered[0]!.title}**`)],
    });
    return;
  }

  // isBusy tính cả trạng thái pause, để /playlist play lúc đang tạm dừng không
  // cướp chỗ bài đang dở.
  if (!isBusy(player)) await player.play(first);
  else player.queue.add(first);

  await interaction.editReply({
    embeds: [
      infoEmbed(
        `▶️ Đang phát **${playlist.name}** — ${ordered.length} bài\n` +
          `-# Đang nạp ${ordered.length - 1} bài còn lại vào hàng chờ...`,
      ),
    ],
  });

  if (ordered.length === 1) return;

  const rest = await resolveBatch(ordered.slice(1), interaction.user.id);
  if (rest.length) player.queue.addMultiple(rest);

  const failed = ordered.length - 1 - rest.length;
  await interaction
    .editReply({
      embeds: [
        successEmbed(
          `▶️ **${playlist.name}** — đã nạp **${rest.length + 1}/${ordered.length}** bài` +
            (failed > 0 ? `\n-# ${failed} bài không phát được (bị xóa hoặc riêng tư)` : ""),
        ),
      ],
    })
    .catch(() => {});
}

/**
 * Phát đúng một bài, chèn lên đầu hàng chờ.
 *
 * File upload trên R2 là URL audio trực tiếp nên AttachmentsPlugin xử lý được;
 * bài YouTube thì đi qua đường tìm kiếm như bình thường.
 */
async function playSingleTrack(
  interaction: ButtonInteraction,
  saved: SavedTrack,
): Promise<void> {
  const voiceChannel = (interaction.member as GuildMember)?.voice?.channel;
  if (!voiceChannel) {
    await interaction.reply({
      embeds: [errorEmbed("Bạn cần vào voice channel trước!")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const player = await ensurePlayer(
    interaction.guildId!,
    interaction.channel as GuildTextBasedChannel | null,
  );
  await ensureConnected(player, voiceChannel);

  const track = await resolveTrack(saved, interaction.user.id);
  if (!track) {
    await interaction.editReply({
      embeds: [errorEmbed(`Không phát được **${saved.title}**.`)],
    });
    return;
  }

  if (!isBusy(player)) await player.play(track);
  else player.queue.add(track);

  await interaction.editReply({
    embeds: [
      successEmbed(
        isBusy(player)
          ? `➕ Đã thêm vào hàng chờ: **${saved.title}**`
          : `▶️ Đang phát: **${saved.title}**`,
      ),
    ],
  });
}

// Cho panel /playlist manage gọi các nút phát mà không tạo import vòng giữa
// slash/playlist.ts và interactions/playlistUi.ts.
registerPlayHandler(async (interaction, playlistId) => {
  const playlist = await findPlaylistById(playlistId);
  if (!playlist) {
    await interaction.reply({
      embeds: [errorEmbed("Không tìm thấy playlist.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await playPlaylistDocument(interaction, playlist);
});

registerPlayTrackHandler(async (interaction, playlistId, position) => {
  const playlist = await findPlaylistById(playlistId);
  const saved = playlist?.tracks.find((t) => t.position === position);
  if (!saved) {
    await interaction.reply({
      embeds: [errorEmbed("Không tìm thấy bài hát.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await playSingleTrack(interaction, saved);
});

// ─── Lệnh ─────────────────────────────────────────────────────────────────────

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("📀 Lưu và phát playlist riêng của bạn")
    .addSubcommand((sub) =>
      sub
        .setName("import")
        .setDescription("Thêm bài từ link YouTube (video, playlist hoặc Mix)")
        .addStringOption((opt) =>
          opt.setName("url").setDescription("Link YouTube").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("upload")
        .setDescription("Tải file nhạc của bạn lên và thêm vào playlist")
        .addAttachmentOption((opt) =>
          opt
            .setName("file")
            .setDescription("File nhạc (mp3, wav, ogg, m4a, flac, opus, aac)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("playlist")
            .setDescription("Playlist đích (chưa có thì bot tạo mới)")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Đặt tên khác cho bài (mặc định lấy tên file)"),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("manage").setDescription("Xem, phát hoặc xóa playlist đã lưu"),
    )
    .addSubcommand((sub) =>
      sub.setName("blocked").setDescription("Xem những bài bạn đã loại bỏ (sẽ không thêm lại)"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unblock")
        .setDescription("Gỡ một bài khỏi danh sách chặn — phải dán link video đơn")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("Link MỘT video, không nhận link playlist/Mix")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Phát một playlist đã lưu")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Tên playlist")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async run({ client: _client, interaction }) {
    const sub = interaction.options.getSubcommand();

    try {
      assertDatabase();

      if (sub === "import") {
        // Đọc YouTube mất vài giây nên phải defer trước.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const url = interaction.options.getString("url", true);
        const view = await startImport(url, interaction.user.id, interaction.guildId!);
        return interaction.editReply(view);
      }

      if (sub === "upload") {
        if (!isR2Configured()) throw new PlaylistError("R2_NOT_CONFIGURED");

        const file = interaction.options.getAttachment("file", true);
        if (!isAllowedAudio(file.name)) throw new PlaylistError("UNSUPPORTED_FILE_TYPE");
        // Chặn sớm bằng size Discord báo, đỡ phải tải về rồi mới biết là quá lớn.
        if (file.size > maxUploadBytes()) {
          throw new PlaylistError(
            "FILE_TOO_LARGE",
            `${(file.size / 1024 / 1024).toFixed(1)}MB vượt trần ${(maxUploadBytes() / 1024 / 1024).toFixed(0)}MB`,
          );
        }

        // Tải từ Discord rồi đẩy lên R2 mất vài giây với file lớn.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Phòng hờ: bỏ hậu tố "(N bài)" nếu người dùng chép lại nguyên gợi ý cũ,
        // để không tạo nhầm playlist trùng nội dung với tên rác.
        const wanted = interaction.options
          .getString("playlist", true)
          .replace(/\s*\(\d+\s*bài\)\s*$/i, "")
          .trim();
        const playlist =
          (await findPlaylistById(wanted)) ??
          (await findPlaylistByName(interaction.user.id, interaction.guildId!, wanted));
        const playlistId =
          playlist?._id?.toString() ??
          (await createPlaylist(interaction.user.id, interaction.guildId!, wanted));

        const uploaded = await uploadFromUrl(
          file.url,
          file.name,
          interaction.user.id,
          file.size,
        );

        const title =
          interaction.options.getString("title")?.trim() ||
          file.name.replace(/\.[^.]+$/, "");

        await addUploadedTrack(playlistId, interaction.user.id, {
          source: "upload",
          externalId: uploaded.key,
          url: uploaded.url,
          title,
          addedBy: interaction.user.id,
          r2Key: uploaded.key,
          fileBytes: uploaded.bytes,
        });

        const target = await findPlaylistById(playlistId);
        await interaction.editReply({
          embeds: [
            successEmbed(
              `📁 Đã thêm **${title}** vào **${target?.name ?? wanted}**\n` +
                `-# ${(uploaded.bytes / 1024 / 1024).toFixed(2)}MB • lưu trên Cloudflare R2`,
            ),
          ],
        });
        dismissLater(interaction);
        return;
      }

      if (sub === "blocked") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const blocked = await listBlocked(interaction.user.id, interaction.guildId!, 25);
        const total = await countBlocked(interaction.user.id, interaction.guildId!);

        if (!total) {
          await interaction.editReply({
            embeds: [infoEmbed("Bạn chưa chặn bài nào. Xóa một bài khỏi playlist là nó tự vào đây.")],
          });
          dismissLater(interaction, 10_000);
          return;
        }

        const body = blocked
          .map((b, i) => `**${i + 1}.** [${b.title.slice(0, 60)}](${b.url})`)
          .join("\n");

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.warning)
              .setTitle(`🚫 Đã chặn ${total} bài`)
              .setDescription(
                `${body}${total > 25 ? `\n-# …và ${total - 25} bài nữa` : ""}\n\n` +
                  "-# Gỡ chặn: `/playlist unblock url:<link video đơn>`",
              ),
          ],
        });
        dismissLater(interaction, 30_000);
        return;
      }

      if (sub === "unblock") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const raw = interaction.options.getString("url", true);
        const parsed = parseYouTubeUrl(raw);

        if (!parsed) throw new PlaylistError("INVALID_URL");

        // Cố ý CHỈ nhận video đơn. Link Mix/playlist chứa hàng chục bài, gỡ theo
        // link đó thì một thao tác vô hiệu hoá cả rổ lựa chọn đã bỏ công loại —
        // trái hẳn mục đích của danh sách chặn.
        if (parsed.kind !== "video") {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                "Chỉ gỡ chặn được bằng link **một video**.\n" +
                  `Link bạn dán là ${parsed.kind === "mix" ? "một Mix" : "một playlist"} — bỏ phần \`list=...\` đi rồi thử lại.\n` +
                  "-# Ví dụ: `https://www.youtube.com/watch?v=abc123`",
              ),
            ],
          });
          dismissLater(interaction, 15_000);
          return;
        }

        const removed = await unblockByKey(
          interaction.user.id,
          interaction.guildId!,
          trackKey({ url: parsed.canonicalUrl }),
        );

        await interaction.editReply({
          embeds: [
            removed
              ? successEmbed(`Đã gỡ chặn **${removed.title}**. Giờ thêm lại được rồi.`)
              : infoEmbed("Bài này vốn không nằm trong danh sách chặn."),
          ],
        });
        dismissLater(interaction);
        return;
      }

      if (sub === "manage") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const view = await buildManageView(interaction.user.id, interaction.guildId!);
        return interaction.editReply(view);
      }

      if (sub === "play") {
        const name = interaction.options.getString("name", true);
        const playlist =
          (await findPlaylistById(name)) ??
          (await findPlaylistByName(interaction.user.id, interaction.guildId!, name));
        if (!playlist) throw new PlaylistError("PLAYLIST_NOT_FOUND");
        return playPlaylistDocument(interaction, playlist);
      }
    } catch (err) {
      const embed = errorEmbed(describeError(err));
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: [] });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      dismissLater(interaction, 8_000);
      return;
    }
  },
};

/**
 * Gợi ý tên playlist cho `/playlist play`.
 *
 * Trả về id làm value để tránh mơ hồ khi hai playlist trùng tên sau khi bỏ dấu;
 * run() vẫn nhận cả tên gõ tay nên người dùng tự nhập cũng được.
 */
export async function autocompletePlaylistName(
  interaction: import("discord.js").AutocompleteInteraction,
): Promise<void> {
  try {
    const focused = interaction.options.getFocused().toLowerCase();
    const playlists = await listPlaylists(interaction.user.id, interaction.guildId!);
    // Hiện ĐÚNG tên playlist, không kèm "(N bài)": người dùng hay gõ lại chuỗi
    // nhìn thấy thay vì bấm chọn, mà chuỗi có hậu tố thì không khớp tên nào cả
    // và `/playlist upload` sẽ tạo nhầm một playlist mới tên "suy (14 bài)".
    const matches = playlists
      .filter((p) => p.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((p) => ({ name: p.name.slice(0, 100), value: p.id }));
    await interaction.respond(matches);
  } catch {
    await interaction.respond([]).catch(() => {});
  }
}

export { formatMs };
export default cmd;
