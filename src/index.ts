import { createRequire } from "module";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client, Collection, Events, GatewayIntentBits, EmbedBuilder, MessageFlags } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord.js";
import { PlayerManager, getPlayer } from "ziplayer";
import { YouTubePlugin } from "@ziplayer/plugin";
import { YTexec } from "@ziplayer/ytexecplug";
import { buildControlRow, buildQueuePageRow, buildLyricsPageRow, buildNowPlayingEmbed, COLORS, errorEmbed, formatDuration } from "./utils/embeds.js";
import { activeSessions, updateLiveLyricsFromExt, attemptFallbackLyrics, renderLyricsField, shouldAttemptFallback } from "./slash/livelyrics.js";
import { lyricsPageCache } from "./slash/lyrics.js";
import type { SlashCommand } from "./types/command.js";

dotenv.config();

// ===========================================
// 🔧 createRequire for CJS-only modules (ffmpeg-static, dependency check)
const require = createRequire(import.meta.url);

// ===========================================
// ✅ Env validation
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = (process.env.GUILD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN) throw new Error("TOKEN is not set in .env");
if (!CLIENT_ID) throw new Error("CLIENT_ID is not set in .env");
if (!GUILD_IDS.length) throw new Error("GUILD_IDS is not set in .env");

const LOAD_SLASH = process.argv[2] === "load";

// ===========================================
// 🎵 FFmpeg — use createRequire since ffmpeg-static is a CJS module
const ffmpegPath = require("ffmpeg-static") as string | null;
if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

// ===========================================
// 🔌 Plugins
// YouTubePlugin 0.3.x tự lo PoToken (bgutils-js) nên đường stream gốc thường chạy được.
// yt-dlp chỉ dùng khi đường gốc fail — dùng hook fallbackStream của plugin thay vì
// ghi đè getStream như trước (cách cũ lấy method rời khỏi instance nên mất `this`).
const ytexec = new YTexec();
const ytbplg = new YouTubePlugin({
  fallbackStream: (track) => ytexec.getStream(track),
});

// ===========================================
// 🎧 Player Manager
// KHÔNG khai extension ở đây: ZiPlayer 0.3.x activate toàn bộ extension mức manager
// khi create() không truyền `extensions`, nên mọi guild sẽ chia sẻ đúng một instance
// lyricsExt (extension giữ state theo track/player → lyrics lẫn giữa các server).
// Mỗi player tự mang instance riêng, tạo trong src/utils/player.ts.
const playerManager = new PlayerManager({
  plugins: [ytbplg],
});

// ===========================================
// 🧩 Dependency check
function check(pkg: string): string {
  try {
    require(pkg);
    return "✅ loaded";
  } catch {
    return "❌ not found";
  }
}

console.log("--------------------------------------------------");
console.log("Core Dependencies");
console.log("- @discordjs/voice:", check("@discordjs/voice"));
console.log("- @ziplayer/plugin:", check("@ziplayer/plugin"));
console.log("\nOpus Libraries");
console.log("- @discordjs/opus:", check("@discordjs/opus"));
console.log("--------------------------------------------------");
console.log("✅ Audio dependencies loaded successfully!");
console.log("--------------------------------------------------");
console.log("Token loaded:", TOKEN ? "✅ found" : "❌ UNDEFINED");

// ===========================================
// 🤖 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.slashcommands = new Collection<string, SlashCommand>();

// ===========================================
// ⏰ Idle Timeout — auto leave after 30 min of silence
const IDLE_TIMEOUT = 30 * 60 * 1000;
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function resetIdleTimer(guildId: string): void {
  const existing = idleTimers.get(guildId);
  if (existing) {
    clearTimeout(existing);
    idleTimers.delete(guildId);
  }
}

function startIdleTimer(guildId: string): void {
  resetIdleTimer(guildId);

  const timer = setTimeout(async () => {
    try {
      const { getPlayer } = await import("ziplayer");
      const currentPlayer = getPlayer(guildId);
      if (currentPlayer && !currentPlayer.isPlaying) {
        console.log(`⏰ [${guildId}] Idle timeout 30 phút - Tự động rời voice channel`);
        currentPlayer.userdata?.channel
          ?.send("⏰ Đã 30 phút không phát nhạc - Bot tự động rời voice channel. Gọi `/play` để mời lại!")
          .catch(() => {});
        currentPlayer.destroy();
      }
      idleTimers.delete(guildId);
    } catch (e) {
      console.error("Idle timer error:", e);
    }
  }, IDLE_TIMEOUT);

  idleTimers.set(guildId, timer);
  console.log(`⏰ [${guildId}] Bắt đầu đếm idle 30 phút`);
}

// ===========================================
// 🔄 Load Slash Commands
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands: unknown[] = [];
const slashFolder = path.join(__dirname, "slash");

async function loadCommand(file: string): Promise<SlashCommand | null> {
  try {
    const filePath = path.join(slashFolder, file);
    const fileURL = `file://${filePath}?update=${Date.now()}`;
    const { default: slashcmd } = (await import(fileURL)) as { default: SlashCommand };
    client.slashcommands.set(slashcmd.data.name, slashcmd);
    console.log(`✅ Đã load: ${slashcmd.data.name}`);
    return slashcmd;
  } catch (error) {
    console.error(`❌ Lỗi khi load ${file}:`, (error as Error).message);
    return null;
  }
}

const slashFiles = fs.readdirSync(slashFolder).filter((f) => f.endsWith(".js"));
for (const file of slashFiles) {
  const slashcmd = await loadCommand(file);
  if (slashcmd) commands.push(slashcmd.data.toJSON());
}

// 🔥 Hot Reload — watch dist/slash/ for compiled .js changes
// In dev mode, rely on `tsx watch` to restart the process instead.
console.log("🔥 Hot reload đã được bật! (production: cần chạy `tsc --watch` song song)");
fs.watch(slashFolder, { recursive: false }, async (eventType, filename) => {
  const fname = filename as string | null;
  if (!fname || !fname.endsWith(".js")) return;
  if (eventType === "change") {
    console.log(`🔄 Phát hiện thay đổi: ${fname} - Đang reload...`);
    const slashcmd = await loadCommand(fname);
    if (slashcmd) {
      console.log(`✨ Hot reload thành công: ${slashcmd.data.name}`);
    }
  }
});

// ===========================================
// 🧩 Register Commands
async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(TOKEN!);
  try {
    // Xóa global commands cũ (nếu trước đây đã đăng ký global)
    await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: [] });
    console.log("🧹 Đã xóa tất cả global commands cũ.");

    console.log(
      `🔄 Reloading ${commands.length} slash command(s) cho ${GUILD_IDS.length} guild(s)...`,
    );
    for (const guildId of GUILD_IDS) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID!, guildId), {
        body: commands,
      });
      console.log(`✅ Đã load commands cho guild: ${guildId}`);
    }
    console.log("✅ Reload slash commands thành công cho tất cả guilds!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi khi load slash commands:", error);
    process.exit(1);
  }
}

// ===========================================
// 🟢 Client Events
client.once(Events.ClientReady, async () => {
  console.log(`✅ Đăng nhập thành công: ${client.user!.tag}`);
  if (LOAD_SLASH) await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  // ============================================
  // 🔘 Button Interactions
  if (interaction.isButton()) {
    const { customId, guildId } = interaction;
    if (!guildId) return;

    // Disabled label buttons — do nothing
    if (customId === "ctrl_queue_label" || customId === "ctrl_lyr_label") {
      await interaction.deferUpdate();
      return;
    }

    // Music control buttons
    if (["ctrl_pause", "ctrl_skip", "ctrl_prev", "ctrl_stop"].includes(customId)) {
      const player = getPlayer(guildId);
      if (!player) {
        await interaction.reply({ embeds: [errorEmbed("Bot không đang phát nhạc!")], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferUpdate();
      try {
        if (customId === "ctrl_pause") {
          if (player.isPaused) player.resume(); else player.pause();
        } else if (customId === "ctrl_skip") {
          await player.skip();
        } else if (customId === "ctrl_prev") {
          await player.previous();
        } else if (customId === "ctrl_stop") {
          player.stop();
          player.queue.clear();
          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.neutral).setDescription("\u23f9\ufe0f \u0110\u00e3 d\u1eebng ph\u00e1t nh\u1ea1c.")],
            components: [],
          });
          return;
        }
        const newRow = buildControlRow(player.isPaused, !!player.previousTrack);
        const session = activeSessions.get(guildId);
        if (session) session.controlRow = newRow;
        await interaction.editReply({ components: [newRow] });
      } catch (err) {
        console.error(`Button error [${customId}]:`, err);
      }
      return;
    }

    // Queue page buttons: ctrl_queue_N
    if (customId.startsWith("ctrl_queue_")) {
      const page = parseInt(customId.replace("ctrl_queue_", ""), 10);
      if (isNaN(page)) return;
      const player = getPlayer(guildId);
      if (!player) {
        await interaction.reply({ embeds: [errorEmbed("Bot không đang phát nhạc!")], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferUpdate();
      const tracks = player.queue.getTracks();
      const totalPages = Math.ceil(tracks.length / 10) || 1;
      if (page < 0 || page >= totalPages) return;
      const current = player.currentTrack;
      const queueStr = tracks
        .slice(page * 10, page * 10 + 10)
        .map((t, i) => `**${page * 10 + i + 1}.** \`[${formatDuration(t.duration)}]\` ${t.title}`)
        .join("\n");
      const queueEmbed = new EmbedBuilder()
        .setColor(COLORS.queue)
        .setTitle(`\ud83d\udcdc H\u00e0ng ch\u1edd \u2014 Trang ${page + 1}/${totalPages}`)
        .setDescription(
          `\ud83c\udfb6 **\u0110ang ph\u00e1t:** ${current ? `\`[${formatDuration(current.duration)}]\` ${current.title}` : "*Kh\u00f4ng c\u00f3*"}\n\n${queueStr || "*Tr\u1ed1ng!*"}`,
        )
        .setThumbnail(current?.thumbnail ?? null)
        .setFooter({ text: `${tracks.length} b\u00e0i trong h\u00e0ng ch\u1edd` });
      await interaction.editReply({ embeds: [queueEmbed], components: [buildQueuePageRow(page, totalPages)] });
      return;
    }

    // Lyrics page buttons: ctrl_lyr_N
    if (customId.startsWith("ctrl_lyr_")) {
      const page = parseInt(customId.replace("ctrl_lyr_", ""), 10);
      if (isNaN(page)) return;
      const cached = lyricsPageCache.get(interaction.message.id);
      if (!cached || Date.now() > cached.expires) {
        await interaction.reply({ embeds: [errorEmbed("Lyrics đã hết hạn. Chạy lại /lyrics để xem.")], flags: MessageFlags.Ephemeral });
        return;
      }
      const { pages, trackName } = cached;
      if (page < 0 || page >= pages.length) return;
      await interaction.deferUpdate();
      const lyrEmbed = new EmbedBuilder()
        .setColor(COLORS.lyrics)
        .setTitle(`\ud83c\udfa4 ${trackName}`)
        .setDescription(pages[page]!)
        .setFooter({ text: `\ud83d\udcc4 Trang ${page + 1}/${pages.length} \u2022 Powered by lrclib` })
        .setTimestamp();
      await interaction.editReply({ embeds: [lyrEmbed], components: [buildLyricsPageRow(page, pages.length)] });
      return;
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const slashcmd = client.slashcommands.get(interaction.commandName);
  if (!slashcmd) {
    try {
      await interaction.reply({ content: "Không tìm thấy lệnh này!", flags: MessageFlags.Ephemeral });
    } catch { /* interaction expired or already replied */ }
    return;
  }

  try {
    await slashcmd.run({ client, interaction });
  } catch (err) {
    console.error("❌ Lỗi khi chạy lệnh:", err);
    try {
      // Handle both deferred and non-deferred interactions
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "Đã xảy ra lỗi khi chạy lệnh!" });
      } else {
        await interaction.reply({ content: "Đã xảy ra lỗi khi chạy lệnh!", flags: MessageFlags.Ephemeral });
      }
    } catch {
      // Secondary reply failed — interaction may have timed out
    }
  }
});

// ===========================================
// 🎶 Player Events
playerManager.on("queueAdd", (_player, track) => {
  console.log(`🎵 Đã thêm: ${track.title} vào queue`);
});

playerManager.on("trackStart", async (player, track) => {
  console.log(`▶️ Bắt đầu phát: ${track.title}`);
  resetIdleTimer(player.guildId);

  const guildId = player.guildId;
  const channel = player.userdata?.channel;
  const session = activeSessions.get(guildId);

  if (session?.active && channel) {
    await session.message.delete().catch(() => {});
    if (session.progressInterval) clearInterval(session.progressInterval);
    if (session.lyricsInterval) clearInterval(session.lyricsInterval);

    session.lines = [];
    session.timedLines = undefined;
    session.lastLine = null;
    session.plainShown = false;
    session.track = track;
    session.createdAt = Date.now();
    session.lyricsAttempted = false;

    const newEmbed = buildNowPlayingEmbed(track, player);
    newEmbed.addFields({ name: "\ud83c\udfa4 Lyrics", value: "\u23f3 \u0110ang t\u1ea3i lyrics t\u1eeb lyricsExt..." });
    newEmbed.setFooter({ text: "\ud83c\udfb5 /livelyrics off \u0111\u1ec3 t\u1eaft" });
    const controlRow = buildControlRow(player.isPaused, !!player.previousTrack);
    session.controlRow = controlRow;
    const newMessage = await channel.send({ embeds: [newEmbed], components: [controlRow] });
    session.embed = newEmbed;
    session.message = newMessage;

    session.progressInterval = setInterval(async () => {
      try {
        const currentPlayer = getPlayer(guildId);
        if (!currentPlayer?.isPlaying) {
          clearInterval(session.progressInterval);
          return;
        }
        const freshEmbed = buildNowPlayingEmbed(session.track, currentPlayer);
        if (shouldAttemptFallback(session)) {
          attemptFallbackLyrics(session).catch(() => {});
        }
        freshEmbed.addFields({ name: "🎤 Lyrics", value: renderLyricsField(session, currentPlayer) });
        freshEmbed.setFooter({ text: "🎵 /livelyrics off để tắt" });
        const freshRow = buildControlRow(currentPlayer.isPaused, !!currentPlayer.previousTrack);
        session.controlRow = freshRow;
        await session.message.edit({ embeds: [freshEmbed], components: [freshRow] }).catch(() => {});
        session.embed = freshEmbed;
      } catch {
        // ignore
      }
    }, 5000);

    console.log(`🔄 Created new embed for: ${track.title}`);
  }
  // NOTE: no else branch — play.ts always creates the initial session embed
});

playerManager.on("trackEnd", (_player, track) => {
  console.log(`🏁 Kết thúc: ${track.title}`);
});

playerManager.on("lyricsCreate", (player, track, lyricsPayload) => {
  updateLiveLyricsFromExt(player.guildId, track, lyricsPayload);
});

playerManager.on("lyricsChange", (player, track, lyricsPayload) => {
  updateLiveLyricsFromExt(player.guildId, track, lyricsPayload);
});

playerManager.on("queueEnd", (player) => {
  console.log("📝 Queue trống, bắt đầu đếm idle 30 phút");
  player.userdata?.channel
    ?.send("✅ Đã phát hết nhạc! Bot sẽ tự rời sau 30 phút nếu không phát nhạc mới.")
    .catch(() => {});

  startIdleTimer(player.guildId);

  const guildId = player.guildId;
  const session = activeSessions.get(guildId);
  if (session) {
    if (session.progressInterval) clearInterval(session.progressInterval);
    if (session.lyricsInterval) clearInterval(session.lyricsInterval);
    session.active = false;
    const stoppedEmbed = new EmbedBuilder()
      .setColor(COLORS.neutral)
      .setDescription("\u23f9\ufe0f \u0110\u00e3 ph\u00e1t h\u1ebft nh\u1ea1c trong h\u00e0ng ch\u1edd.");
    session.message.edit({ embeds: [stoppedEmbed], components: [] }).catch(() => {});
    activeSessions.delete(guildId);
  }
});

// NOTE: ZiPlayer 0.3.x không có event "disconnect" — playerDestroy đã bao trùm
// trường hợp bot rời voice channel, nên listener cũ được gộp vào đây.
playerManager.on("playerDestroy", (player) => {
  console.log("🚪 Player bị hủy");
  resetIdleTimer(player.guildId);

  const guildId = player.guildId;
  const session = activeSessions.get(guildId);
  if (session) {
    if (session.progressInterval) clearInterval(session.progressInterval);
    if (session.lyricsInterval) clearInterval(session.lyricsInterval);
  }
  activeSessions.delete(guildId);
});

// ===========================================
client.on("error", (err) => console.error("❌ Discord client error:", err));
client.login(TOKEN);
