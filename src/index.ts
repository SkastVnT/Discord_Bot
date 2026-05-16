import { createRequire } from "module";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client, Collection, Events, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord.js";
import { PlayerManager } from "ziplayer";
import { YouTubePlugin } from "@ziplayer/plugin";
import { lyricsExt } from "@ziplayer/extension";
import { activeSessions, updateLiveLyricsFromExt } from "./slash/livelyrics.js";
import type { SlashCommand } from "./types/command.js";

dotenv.config();

// ===========================================
// 🔧 CJS interop for @ziplayer/ytexecplug
const require = createRequire(import.meta.url);
type YTexecCtor = new () => { getStream: unknown };
const { YTexec } = require("@ziplayer/ytexecplug") as { YTexec: YTexecCtor };

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
const ytbplg = new YouTubePlugin();
ytbplg.getStream = new YTexec().getStream;

// ===========================================
// 🎧 Player Manager
const playerManager = new PlayerManager({
  plugins: [ytbplg],
  extensions: [
    new lyricsExt(null, {
      provider: "lrclib",
      includeSynced: true,
      autoFetchOnTrackStart: true,
    }),
  ],
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
  if (!interaction.isChatInputCommand()) return;

  const slashcmd = client.slashcommands.get(interaction.commandName);
  if (!slashcmd) {
    await interaction.reply({ content: "Không tìm thấy lệnh này!", ephemeral: true });
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
        await interaction.reply({ content: "Đã xảy ra lỗi khi chạy lệnh!", ephemeral: true });
      }
    } catch {
      // Secondary reply failed — interaction may have timed out
    }
  }
});

// ===========================================
// 🎶 Player Events
playerManager.on("audioTrackAdd", (_player, track) => {
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
    session.lastLine = null;
    session.plainShown = false;
    session.track = track;

    const progress =
      player.getProgressBar?.({ timecodes: true, length: 15 }) ?? "0:00  ─────── 0:00";

    const newEmbed = new EmbedBuilder()
      .setColor("#FF6B6B")
      .setTitle(`🎶 ${track.title}`)
      .setURL(track.url)
      .setThumbnail(track.thumbnail)
      .addFields(
        { name: "👤 Ca sĩ", value: track.author || "Không rõ", inline: true },
        { name: "⏱️ Thời lượng", value: String(track.duration ?? "N/A"), inline: true },
        { name: "📡 Nguồn", value: track.source ?? "youtube", inline: true },
        { name: "▶️ Tiến trình", value: `\`${progress}\`` },
        { name: "🎤 Lyrics", value: "⏳ Đang tải lyrics từ lyricsExt..." },
      )
      .setFooter({ text: "🎵 /livelyrics off để tắt" })
      .setTimestamp();

    const newMessage = await channel.send({ embeds: [newEmbed] });
    session.embed = newEmbed;
    session.message = newMessage;

    session.progressInterval = setInterval(async () => {
      try {
        const { getPlayer } = await import("ziplayer");
        const currentPlayer = getPlayer(guildId);
        if (!currentPlayer?.isPlaying) {
          clearInterval(session.progressInterval);
          return;
        }
        const newProgress =
          currentPlayer.getProgressBar?.({ timecodes: true, length: 15 }) ?? "";
        if (newProgress) {
          session.embed.spliceFields(3, 1, {
            name: "▶️ Tiến trình",
            value: `\`${newProgress}\``,
          });
          await session.message.edit({ embeds: [session.embed] }).catch(() => {});
        }
      } catch {
        // ignore
      }
    }, 5000);

    console.log(`🔄 Created new embed for: ${track.title}`);
  } else {
    channel?.send(`🎶 Đang phát: **${track.title}**`).catch(() => {});
  }
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
    session.embed
      .setColor("#888888")
      .spliceFields(4, 1, { name: "🎤 Lyrics", value: "⏹️ Đã dừng phát" });
    session.message.edit({ embeds: [session.embed] }).catch(() => {});
    activeSessions.delete(guildId);
  }
});

playerManager.on("disconnect", (player) => {
  console.log("🚪 Bot đã rời voice channel");
  resetIdleTimer(player.guildId);
});

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
client.login(TOKEN);
