import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { COLORS, errorEmbed, successEmbed } from "../utils/embeds.js";
import { formatMs } from "../utils/duration.js";
import {
  PAGE_SIZE,
  applyPageSelection,
  clampPage,
  deselectPage,
  indexesOnPage,
  sanitizeSelection,
  selectAll,
  selectPage,
  totalPages,
} from "../utils/selection.js";
import { previewPlaylist, enrichTracks } from "../services/playlistImport.js";
import {
  createSession,
  deleteSession,
  getSession,
  updateSession,
} from "../db/importSessions.js";
import {
  addTracks,
  createPlaylist,
  deletePlaylist,
  findPlaylistById,
  listPlaylists,
  removeTrackAt,
} from "../db/playlists.js";
import { isMongoReady } from "../db/mongo.js";
import { filterBlockedImported } from "../db/blocklist.js";
import { PlaylistError } from "../types/playlist.js";
import type {
  PlaylistErrorCode,
  PlaylistImportSessionDocument,
  SavedTrack,
} from "../types/playlist.js";

/**
 * Toàn bộ phần giao diện playlist trong Discord.
 *
 * Tách khỏi index.ts vì handler ở đó đã dài; ở đây gom cả việc dựng component lẫn
 * xử lý tương tác để hai thứ luôn khớp nhau — customId chỉ xuất hiện trong file này.
 */

// ─── customId ─────────────────────────────────────────────────────────────────
// Trần 100 ký tự nên chỉ mang session id (8 ký tự) và tham số ngắn; mọi dữ liệu
// khác tra lại từ phiên trong database.
const P = {
  pick: "pls", // pls:<sid>:<page>       select chọn bài
  btn: "plb", // plb:<sid>:<action>[:n]  nút trong panel chọn
  target: "plt", // plt:<sid>            select playlist đích
  manage: "plmg", // plmg:<action>[:id]  panel quản lý
  modal: "plmo", // plmo:<action>[:sid]  modal
  track: "pltr", // pltr:<id>:<page>     select một bài trong playlist
} as const;

/** Tất cả tiền tố của playlist, để index.ts biết interaction nào là của mình. */
export function isPlaylistCustomId(customId: string): boolean {
  return Object.values(P).some((prefix) => customId.startsWith(`${prefix}:`));
}

// ─── Thông báo lỗi ────────────────────────────────────────────────────────────
const ERROR_MESSAGES: Record<PlaylistErrorCode, string> = {
  INVALID_URL:
    "Link không hợp lệ. Chỉ nhận link YouTube (video, playlist hoặc Mix).",
  UNSUPPORTED_PROVIDER: "Nguồn này chưa được hỗ trợ. Hiện chỉ có YouTube.",
  PLAYLIST_NOT_FOUND: "Không tìm thấy playlist hoặc video này.",
  PLAYLIST_PRIVATE: "Playlist/video này ở chế độ riêng tư nên không đọc được.",
  PLAYLIST_FETCH_TIMEOUT: "YouTube phản hồi quá chậm. Thử lại sau một chút.",
  PLAYLIST_FETCH_FAILED: "Không đọc được dữ liệu từ YouTube. Thử lại hoặc dùng link khác.",
  IMPORT_SESSION_EXPIRED: "Phiên chọn bài đã hết hạn. Chạy lại `/playlist import` nhé.",
  RATE_LIMITED: "Bạn thao tác hơi nhanh. Chờ một lát rồi thử lại.",
  DATABASE_UNAVAILABLE:
    "Database chưa sẵn sàng nên chưa dùng được playlist. Các lệnh phát nhạc vẫn hoạt động bình thường.",
  PLAYLIST_EXISTS: "Bạn đã có playlist trùng tên rồi.",
  PLAYLIST_FULL: "Playlist đã đầy.",
  SPOTIFY_NOT_CONFIGURED:
    "Chưa cấu hình Spotify. Thêm SPOTIFY_CLIENT_ID và SPOTIFY_CLIENT_SECRET vào .env.",
  SPOTIFY_AUTH_FAILED: "Spotify từ chối xác thực. Kiểm tra lại Client ID/Secret.",
  SPOTIFY_NO_MATCH: "Không tìm được bài nào trên YouTube khớp với link Spotify này.",
  SPOTIFY_PLAYLIST_BLOCKED:
    "Spotify không còn cho ứng dụng ngoài đọc nội dung playlist (mọi playlist đều bị chặn, " +
    "không riêng playlist biên tập).\n**Link album và link bài hát vẫn dùng bình thường.**",
  R2_NOT_CONFIGURED:
    "Chưa cấu hình Cloudflare R2 nên chưa upload file được. Các lệnh khác vẫn dùng bình thường.",
  UNSUPPORTED_FILE_TYPE: "Định dạng này không phát được. Hỗ trợ: mp3, wav, ogg, m4a, flac, opus, aac, webm.",
  FILE_TOO_LARGE: "File quá lớn.",
  UPLOAD_FAILED: "Upload thất bại. Thử lại nhé.",
  NOT_ALLOWED: "Bạn không có quyền thao tác trên playlist này.",
};

/**
 * Tự xoá panel ephemeral sau vài giây.
 *
 * Discord KHÔNG tự dọn tin nhắn ephemeral — nó nằm lại kèm dòng "Chỉ bạn mới có
 * thể thấy điều này • Bỏ qua tin nhắn" cho tới khi người dùng tự bấm bỏ qua, nên
 * dùng vài lệnh là channel đầy rác. Xoá chủ động ở các trạng thái kết thúc.
 *
 * Token interaction sống 15 phút nên delay vài giây luôn nằm trong hạn.
 */
function autoDismiss(
  interaction: {
    deleteReply: () => Promise<unknown>;
  },
  ms = 6_000,
): void {
  setTimeout(() => void interaction.deleteReply().catch(() => {}), ms);
}

export function describeError(err: unknown): string {
  if (err instanceof PlaylistError) return ERROR_MESSAGES[err.code];
  console.error("[playlist] lỗi ngoài dự kiến:", err);
  return "Đã xảy ra lỗi. Thử lại sau nhé.";
}

/** Cho lệnh slash dùng chung cách tự dọn tin nhắn ephemeral. */
export function dismissLater(
  interaction: { deleteReply: () => Promise<unknown> },
  ms = 6_000,
): void {
  autoDismiss(interaction, ms);
}

/** Chặn sớm khi Mongo chưa lên, để không ném lỗi lạ từ tận tầng db. */
export function assertDatabase(): void {
  if (!isMongoReady()) throw new PlaylistError("DATABASE_UNAVAILABLE");
}

// ─── Dựng panel chọn bài ──────────────────────────────────────────────────────

/** Discord giới hạn label 100 ký tự; chừa chỗ cho số thứ tự và thời lượng. */
function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface PanelView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
}

export function buildPickerView(session: PlaylistImportSessionDocument): PanelView {
  const tracks = session.tracks;
  const count = tracks.length;
  const page = clampPage(session.page, count);
  const pages = totalPages(count);
  const selected = new Set(sanitizeSelection(session.selectedIndexes, count));
  const pageIndexes = indexesOnPage(page, count);

  const options = pageIndexes.map((i) => {
    const track = tracks[i]!;
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(clip(`${i + 1}. ${track.title}`, 100))
      .setValue(String(i))
      .setDefault(selected.has(i));

    const parts = [track.author, formatMs(track.durationMs)].filter(Boolean);
    if (parts.length) option.setDescription(clip(parts.join(" • "), 100));
    return option;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${P.pick}:${session.sessionId}:${page}`)
    .setPlaceholder(`Chọn bài — trang ${page + 1}/${pages}`)
    .setMinValues(0)
    .setMaxValues(Math.max(1, options.length))
    .addOptions(options);

  const allOnPageSelected = pageIndexes.every((i) => selected.has(i));

  const bulkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${P.btn}:${session.sessionId}:${allOnPageSelected ? "nopage" : "allpage"}`)
      .setLabel(allOnPageSelected ? "Bỏ chọn trang này" : "Chọn trang này")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${P.btn}:${session.sessionId}:all`)
      .setLabel(`Chọn tất cả (${count})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(selected.size === count),
    new ButtonBuilder()
      .setCustomId(`${P.btn}:${session.sessionId}:none`)
      .setLabel("Bỏ chọn hết")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(selected.size === 0),
  );

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    bulkRow,
  ];

  // Chỉ hiện hàng lật trang khi thật sự có nhiều trang, đỡ một hàng nút thừa.
  if (pages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${P.btn}:${session.sessionId}:page:${page - 1}`)
          .setLabel("◀ Trước")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 0),
        new ButtonBuilder()
          .setCustomId(`${P.btn}:${session.sessionId}:noop`)
          .setLabel(`${page + 1} / ${pages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${P.btn}:${session.sessionId}:page:${page + 1}`)
          .setLabel("Tiếp ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= pages - 1),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${P.btn}:${session.sessionId}:cancel`)
        .setLabel("Hủy")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${P.btn}:${session.sessionId}:confirm`)
        .setLabel(selected.size ? `Thêm ${selected.size} bài` : "Chưa chọn bài nào")
        .setStyle(ButtonStyle.Success)
        .setDisabled(selected.size === 0),
    ),
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.queue)
    .setTitle(`📀 ${clip(session.sourceTitle ?? "Kết quả từ YouTube", 200)}`)
    .setDescription(
      `Tìm thấy **${count}** bài • đang chọn **${selected.size}**\n` +
        `-# Lựa chọn được giữ khi lật trang. Bấm **Thêm** khi xong.`,
    )
    .setFooter({ text: `Trang ${page + 1}/${pages} • ${PAGE_SIZE} bài mỗi trang` });

  return { embeds: [embed], components: rows };
}

/** Bước 2: chọn playlist đích sau khi đã tick xong. */
async function buildTargetView(
  session: PlaylistImportSessionDocument,
  userId: string,
  guildId: string,
): Promise<PanelView> {
  const playlists = await listPlaylists(userId, guildId);
  const selectedCount = sanitizeSelection(session.selectedIndexes, session.tracks.length).length;

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${P.target}:${session.sessionId}`)
    .setPlaceholder("Chọn playlist để thêm vào")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("➕ Tạo playlist mới")
        .setValue("__new__")
        .setDescription("Đặt tên rồi thêm luôn vào đó"),
      ...playlists.map((p) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(clip(p.name, 100))
          .setValue(p.id)
          .setDescription(`${p.trackCount} bài`),
      ),
    );

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("📥 Thêm vào playlist nào?")
    .setDescription(`Đã chọn **${selectedCount}** bài.`);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${P.btn}:${session.sessionId}:back`)
          .setLabel("◀ Quay lại chọn bài")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ─── Panel /playlist manage ───────────────────────────────────────────────────
export async function buildManageView(userId: string, guildId: string): Promise<PanelView> {
  const playlists = await listPlaylists(userId, guildId);

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle("🎵 Playlist của bạn")
    .setDescription(
      playlists.length
        ? playlists
            .map((p) => `**${p.name}** — ${p.trackCount} bài`)
            .join("\n")
        : "*Chưa có playlist nào. Bấm **Thêm từ liên kết** để tạo cái đầu tiên.*",
    );

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (playlists.length) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${P.manage}:pick`)
          .setPlaceholder("Chọn playlist để xem thao tác")
          .addOptions(
            playlists.map((p) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(clip(p.name, 100))
                .setValue(p.id)
                .setDescription(`${p.trackCount} bài`),
            ),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${P.manage}:addlink`)
        .setLabel("➕ Thêm từ liên kết")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${P.manage}:create`)
        .setLabel("📝 Tạo playlist rỗng")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { embeds: [embed], components: rows };
}

/** Số bài hiện mỗi trang khi xem chi tiết playlist. Bằng trần option của select menu. */
const DETAIL_PAGE_SIZE = 25;

const SOURCE_ICON: Record<string, string> = {
  youtube: "🔴",
  spotify: "🟢",
  soundcloud: "🟠",
  upload: "📁",
};

/**
 * Chi tiết một playlist: phân trang, chọn từng bài để phát ngay hoặc xóa.
 *
 * `page` nằm trong customId chứ không lưu ở đâu cả — panel này chỉ đọc, không có
 * trạng thái nào cần giữ giữa các lần bấm, nên không cần session.
 */
async function buildPlaylistDetailView(playlistId: string, page = 0): Promise<PanelView> {
  const playlist = await findPlaylistById(playlistId);
  if (!playlist) throw new PlaylistError("PLAYLIST_NOT_FOUND");

  const ordered = [...playlist.tracks].sort((a, b) => a.position - b.position);
  const count = ordered.length;
  const pages = Math.max(1, Math.ceil(count / DETAIL_PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = ordered.slice(current * DETAIL_PAGE_SIZE, (current + 1) * DETAIL_PAGE_SIZE);

  const totalMs = ordered.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const uploads = ordered.filter((t) => t.source === "upload").length;

  const body = slice
    .map(
      (t) =>
        `${SOURCE_ICON[t.source] ?? "🎵"} **${t.position + 1}.** \`[${formatMs(t.durationMs)}]\` ${clip(t.title, 60)}`,
    )
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(COLORS.queue)
    .setTitle(`📀 ${playlist.name}`)
    .setDescription(body || "*Playlist đang trống — dùng `/playlist import` hoặc `/playlist upload`*")
    .setFooter({
      text:
        `${count} bài • ${formatMs(totalMs)}` +
        (uploads ? ` • ${uploads} file tự upload` : "") +
        (pages > 1 ? ` • trang ${current + 1}/${pages}` : ""),
    });

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (slice.length) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${P.track}:${playlistId}:${current}`)
          .setPlaceholder("Chọn một bài để phát ngay hoặc xóa")
          .addOptions(
            slice.map((t) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(clip(`${t.position + 1}. ${t.title}`, 100))
                .setValue(String(t.position))
                .setDescription(
                  clip(
                    [t.author, formatMs(t.durationMs)].filter(Boolean).join(" • ") || "—",
                    100,
                  ),
                ),
            ),
          ),
      ),
    );
  }

  if (pages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${P.manage}:detail:${playlistId}:${current - 1}`)
          .setLabel("◀ Trước")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current <= 0),
        new ButtonBuilder()
          .setCustomId(`${P.manage}:noop`)
          .setLabel(`${current + 1} / ${pages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${P.manage}:detail:${playlistId}:${current + 1}`)
          .setLabel("Tiếp ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current >= pages - 1),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${P.manage}:play:${playlistId}`)
        .setLabel("▶ Phát cả playlist")
        .setStyle(ButtonStyle.Success)
        .setDisabled(count === 0),
      new ButtonBuilder()
        .setCustomId(`${P.manage}:delete:${playlistId}`)
        .setLabel("🗑 Xóa playlist")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${P.manage}:home`)
        .setLabel("◀ Quay lại")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { embeds: [embed], components: rows };
}

/** Hỏi lại trước khi xóa một bài — bấm nhầm trong select menu rất dễ. */
function buildTrackActionView(
  playlistId: string,
  page: number,
  track: SavedTrack,
): PanelView {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(clip(track.title, 200))
    .setDescription(
      `${SOURCE_ICON[track.source] ?? "🎵"} ${track.author ?? "Không rõ ca sĩ"} • \`${formatMs(track.durationMs)}\`` +
        (track.source === "upload" ? "\n-# File tự upload, lưu trên Cloudflare R2" : ""),
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${P.manage}:playone:${playlistId}:${track.position}`)
          .setLabel("▶ Phát bài này")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${P.manage}:rmtrack:${playlistId}:${track.position}:${page}`)
          .setLabel("🗑 Xóa khỏi playlist")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${P.manage}:detail:${playlistId}:${page}`)
          .setLabel("◀ Quay lại")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ─── Điểm vào: mở panel chọn bài từ một URL ───────────────────────────────────
/**
 * Đọc URL rồi trả về panel chọn bài.
 *
 * Chỗ gọi phải defer trước vì bước này gọi mạng và có thể mất vài giây.
 */
export async function startImport(
  url: string,
  userId: string,
  guildId: string,
): Promise<PanelView> {
  assertDatabase();
  const preview = await previewPlaylist(url, userId);

  // Lọc bài đã chặn NGAY Ở PREVIEW chứ không đợi lúc xác nhận: mục đích của
  // danh sách chặn là để không phải nhìn thấy chúng nữa.
  const { tracks, blockedCount } = await filterBlockedImported(userId, guildId, preview.tracks);

  if (!tracks.length) {
    throw new PlaylistError(
      "PLAYLIST_NOT_FOUND",
      blockedCount ? "Mọi bài trong link này đều đã bị bạn chặn" : "Không có bài nào",
    );
  }

  const session = await createSession({
    userId,
    guildId,
    sourceUrl: url,
    ...(preview.source.title ? { sourceTitle: preview.source.title } : {}),
    tracks,
  });

  const view = buildPickerView(session);

  // Nói rõ đã bỏ bao nhiêu và vì sao, không âm thầm cắt bớt.
  const notes: string[] = [];
  if (preview.droppedCount > 0) {
    notes.push(`${preview.droppedCount} video tổng hợp (playlist, full album, bản 1 tiếng)`);
  }
  if (blockedCount > 0) {
    notes.push(`${blockedCount} bài trong danh sách chặn`);
  }
  if (notes.length) {
    view.embeds[0]!.addFields({ name: "🧹 Đã lọc", value: notes.join("\n") });
  }
  return view;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function buildLinkModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${P.modal}:link`)
    .setTitle("Thêm bài từ liên kết")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("url")
          .setLabel("Link YouTube")
          .setPlaceholder("https://www.youtube.com/watch?v=...")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
}

function buildNameModal(sessionId?: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(sessionId ? `${P.modal}:name:${sessionId}` : `${P.modal}:name`)
    .setTitle("Tạo playlist mới")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Tên playlist")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80),
      ),
    );
}

// ─── Xử lý tương tác ──────────────────────────────────────────────────────────

/** Hàm phát playlist, do index.ts tiêm vào để tránh import vòng với slash/playlist.ts. */
export type PlayPlaylistFn = (
  interaction: ButtonInteraction,
  playlistId: string,
) => Promise<void>;

export type PlayTrackFn = (
  interaction: ButtonInteraction,
  playlistId: string,
  position: number,
) => Promise<void>;

let playPlaylist: PlayPlaylistFn | null = null;
let playTrack: PlayTrackFn | null = null;

export function registerPlayHandler(fn: PlayPlaylistFn): void {
  playPlaylist = fn;
}

export function registerPlayTrackHandler(fn: PlayTrackFn): void {
  playTrack = fn;
}

async function replyError(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  err: unknown,
): Promise<void> {
  const embed = errorEmbed(describeError(err));
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  } else {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  autoDismiss(interaction, 8_000);
}

async function handlePick(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, sessionId, pageRaw] = interaction.customId.split(":");
  const session = await getSession(sessionId!, interaction.user.id, interaction.guildId!);
  const page = clampPage(Number(pageRaw), session.tracks.length);

  const received = interaction.values.map(Number).filter(Number.isInteger);
  const selectedIndexes = applyPageSelection(
    session.selectedIndexes,
    page,
    received,
    session.tracks.length,
  );

  await updateSession(sessionId!, { selectedIndexes, page });
  session.selectedIndexes = selectedIndexes;
  session.page = page;

  await interaction.update(buildPickerView(session));
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const sessionId = parts[1]!;
  const action = parts[2]!;

  if (action === "noop") {
    await interaction.deferUpdate();
    return;
  }

  if (action === "cancel") {
    await deleteSession(sessionId).catch(() => {});
    // Huỷ thì xoá thẳng panel, không để lại tin nhắn "đã huỷ" làm gì.
    await interaction.deferUpdate();
    await interaction.deleteReply().catch(() => {});
    return;
  }

  const session = await getSession(sessionId, interaction.user.id, interaction.guildId!);
  const count = session.tracks.length;

  switch (action) {
    case "page":
      session.page = clampPage(Number(parts[3]), count);
      break;
    case "allpage":
      session.selectedIndexes = selectPage(session.selectedIndexes, session.page, count);
      break;
    case "nopage":
      session.selectedIndexes = deselectPage(session.selectedIndexes, session.page, count);
      break;
    case "all":
      session.selectedIndexes = selectAll(count);
      break;
    case "none":
      session.selectedIndexes = [];
      break;
    case "back":
      await interaction.update(buildPickerView(session));
      return;
    case "confirm": {
      const selected = sanitizeSelection(session.selectedIndexes, count);
      if (!selected.length) {
        await interaction.deferUpdate();
        return;
      }
      await updateSession(sessionId, { selectedIndexes: selected });
      session.selectedIndexes = selected;
      await interaction.update(
        await buildTargetView(session, interaction.user.id, interaction.guildId!),
      );
      return;
    }
    default:
      await interaction.deferUpdate();
      return;
  }

  await updateSession(sessionId, {
    selectedIndexes: session.selectedIndexes,
    page: session.page,
  });
  await interaction.update(buildPickerView(session));
}

/** Ghi các bài đã chọn vào playlist. Metadata lấy từ phiên, không tin client. */
async function commitSelection(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
  session: PlaylistImportSessionDocument,
  playlistId: string,
): Promise<void> {
  const selected = sanitizeSelection(session.selectedIndexes, session.tracks.length);
  const tracks = selected.map((i) => session.tracks[i]!);

  // Bổ sung metadata có thể mất vài giây (mỗi bài một request), vượt quá 3 giây mà
  // Discord cho phép trả lời một component. Defer trước rồi mới làm.
  const canDefer = interaction.isModalSubmit() ? interaction.isFromMessage() : true;
  if (canDefer && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  await enrichTracks(tracks);

  const result = await addTracks(playlistId, interaction.user.id, tracks, interaction.user.id);
  await deleteSession(session.sessionId).catch(() => {});

  const playlist = await findPlaylistById(playlistId);
  const lines = [`Đã thêm **${result.added}** bài vào **${playlist?.name ?? "playlist"}**.`];
  if (result.duplicatesSkipped) lines.push(`Bỏ qua **${result.duplicatesSkipped}** bài đã có.`);
  if (result.blockedSkipped) lines.push(`Bỏ qua **${result.blockedSkipped}** bài đã chặn.`);
  if (result.rejected) lines.push(`**${result.rejected}** bài không thêm được vì playlist đã đầy.`);

  const payload = { embeds: [successEmbed(lines.join("\n"))], components: [] };

  // Đã defer ở trên thì sửa lại; modal mở từ slash command không có message nào để
  // sửa nên phải trả lời mới.
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
  autoDismiss(interaction);
}

async function handleTargetSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const sessionId = interaction.customId.split(":")[1]!;
  const session = await getSession(sessionId, interaction.user.id, interaction.guildId!);
  const choice = interaction.values[0]!;

  if (choice === "__new__") {
    await interaction.showModal(buildNameModal(sessionId));
    return;
  }

  await commitSelection(interaction, session, choice);
}

async function handleManage(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const action = interaction.isStringSelectMenu() ? "pick" : parts[1]!;

  if (action === "pick") {
    const id = (interaction as StringSelectMenuInteraction).values[0]!;
    await interaction.update(await buildPlaylistDetailView(id));
    return;
  }

  const button = interaction as ButtonInteraction;

  switch (action) {
    case "noop":
      await button.deferUpdate();
      return;
    case "addlink":
      await button.showModal(buildLinkModal());
      return;
    case "create":
      await button.showModal(buildNameModal());
      return;
    case "home":
      await button.update(await buildManageView(button.user.id, button.guildId!));
      return;
    case "detail":
      await button.update(await buildPlaylistDetailView(parts[2]!, Number(parts[3] ?? 0)));
      return;
    case "delete": {
      const ok = await deletePlaylist(parts[2]!, button.user.id);
      await button.update({
        embeds: [
          ok
            ? successEmbed("Đã xóa playlist và toàn bộ file đã upload của nó.")
            : errorEmbed("Không xóa được — playlist không tồn tại hoặc không phải của bạn."),
        ],
        components: [],
      });
      autoDismiss(button);
      return;
    }
    case "rmtrack": {
      const [, , playlistId, positionRaw, pageRaw] = parts;
      // Xóa file trên R2 có thể mất một lúc, vượt 3 giây Discord cho phép.
      await button.deferUpdate();
      const removed = await removeTrackAt(playlistId!, button.user.id, Number(positionRaw));
      const view = await buildPlaylistDetailView(playlistId!, Number(pageRaw ?? 0));
      if (removed) {
        view.embeds.unshift(successEmbed(`Đã xóa **${clip(removed.title, 80)}** khỏi playlist.`));
      }
      await button.editReply(view);
      return;
    }
    case "playone": {
      if (!playTrack) {
        await button.reply({
          embeds: [errorEmbed("Chức năng phát chưa sẵn sàng.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await playTrack(button, parts[2]!, Number(parts[3]));
      return;
    }
    case "play": {
      if (!playPlaylist) {
        await button.reply({
          embeds: [errorEmbed("Chức năng phát chưa sẵn sàng.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await playPlaylist(button, parts[2]!);
      return;
    }
    default:
      await button.deferUpdate();
  }
}

/** Chọn một bài trong panel chi tiết → hiện hai lựa chọn phát / xóa. */
async function handleTrackSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, playlistId, pageRaw] = interaction.customId.split(":");
  const position = Number(interaction.values[0]);

  const playlist = await findPlaylistById(playlistId!);
  if (!playlist) throw new PlaylistError("PLAYLIST_NOT_FOUND");

  const track = playlist.tracks.find((t) => t.position === position);
  if (!track) throw new PlaylistError("PLAYLIST_NOT_FOUND");

  await interaction.update(buildTrackActionView(playlistId!, Number(pageRaw ?? 0), track));
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const action = parts[1]!;

  if (action === "link") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const url = interaction.fields.getTextInputValue("url");
    const view = await startImport(url, interaction.user.id, interaction.guildId!);
    await interaction.editReply(view);
    return;
  }

  if (action === "name") {
    const name = interaction.fields.getTextInputValue("name");
    const sessionId = parts[2];

    assertDatabase();
    const playlistId = await createPlaylist(interaction.user.id, interaction.guildId!, name);

    // Có sessionId nghĩa là đang ở giữa luồng import: tạo xong thì ghi luôn.
    if (sessionId) {
      const session = await getSession(sessionId, interaction.user.id, interaction.guildId!);
      await commitSelection(interaction, session, playlistId);
      return;
    }

    await interaction.reply({
      embeds: [successEmbed(`Đã tạo playlist **${name}**.`)],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Điểm vào duy nhất cho index.ts.
 *
 * Trả `true` khi đã xử lý, `false` khi interaction không thuộc về playlist —
 * để handler cũ ở index.ts chạy tiếp bình thường.
 */
export async function handlePlaylistInteraction(interaction: Interaction): Promise<boolean> {
  const customId =
    interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()
      ? interaction.customId
      : null;
  if (!customId || !isPlaylistCustomId(customId)) return false;

  try {
    if (customId.startsWith(`${P.manage}:`)) {
      await handleManage(interaction as ButtonInteraction | StringSelectMenuInteraction);
    } else if (interaction.isStringSelectMenu()) {
      if (customId.startsWith(`${P.pick}:`)) await handlePick(interaction);
      else if (customId.startsWith(`${P.target}:`)) await handleTargetSelect(interaction);
      else if (customId.startsWith(`${P.track}:`)) await handleTrackSelect(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    await replyError(
      interaction as ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
      err,
    );
  }
  return true;
}
