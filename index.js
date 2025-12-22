// MAKE BY SKAST
// ===========================================
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ===========================================
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import ffmpeg from "ffmpeg-static";

import { PlayerManager } from "ziplayer";
import {
  YouTubePlugin,
  SoundCloudPlugin,
  SpotifyPlugin,
  YTSRPlugin,
} from "@ziplayer/plugin";

import { lyricsExt } from "@ziplayer/extension";
// ===========================================
// 🧩 Dependency Check
function check(pkg) {
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
console.log("\nEncryption Libraries");
console.log("\nFFmpeg");
console.log("--------------------------------------------------");
console.log("✅ Audio dependencies loaded successfully!");
console.log("--------------------------------------------------");

if (ffmpeg) process.env.FFMPEG_PATH = ffmpeg;

// ===========================================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1046784301615812649";
const GUILD_ID = "912280384471982091";
const LOAD_SLASH = process.argv[2] === "load";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.slashcommands = new Collection();

// ===========================================
// 🎧 PLAYER CONFIG
const playerManager = new PlayerManager({
  plugins: [new YTSRPlugin(),new YouTubePlugin(), new SoundCloudPlugin(), new SpotifyPlugin()],
  extensions: [new lyricsExt()],
});

// ===========================================
// 🔄 Load Slash Commands
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commands = [];
const slashFolder = path.join(__dirname, "slash");

// Hàm load một command từ file
async function loadCommand(file) {
  try {
    const filePath = path.join(slashFolder, file);
    const fileURL = `file://${filePath}?update=${Date.now()}`;
    const { default: slashcmd } = await import(fileURL);
    client.slashcommands.set(slashcmd.data.name, slashcmd);
    console.log(`✅ Đã load: ${slashcmd.data.name}`);
    return slashcmd;
  } catch (error) {
    console.error(`❌ Lỗi khi load ${file}:`, error.message);
    return null;
  }
}

// Load tất cả commands lần đầu
const slashFiles = fs.readdirSync(slashFolder).filter((f) => f.endsWith(".js"));
for (const file of slashFiles) {
  const slashcmd = await loadCommand(file);
  if (slashcmd) commands.push(slashcmd.data.toJSON());
}

// 🔥 HOT RELOAD - Theo dõi thay đổi trong folder slash
console.log("🔥 Hot reload đã được bật! Thay đổi code sẽ tự động cập nhật.");
fs.watch(slashFolder, { recursive: false }, async (eventType, filename) => {
  if (!filename || !filename.endsWith(".js")) return;
  
  if (eventType === "change") {
    console.log(`🔄 Phát hiện thay đổi: ${filename} - Đang reload...`);
    
    // Xóa cache của module cũ
    const filePath = path.join(slashFolder, filename);
    delete require.cache[require.resolve(filePath)];
    
    // Load lại command
    const slashcmd = await loadCommand(filename);
    if (slashcmd) {
      console.log(`✨ Hot reload thành công: ${slashcmd.data.name}`);
    }
  }
});

// ===========================================
// 🧩 Register Commands
async function registerCommands() {
  const rest = new REST({ version: "9" }).setToken(TOKEN);
  try {
    console.log(`🔄 Reloading ${commands.length} slash command(s)...`);
    // await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    //   body: commands,
    // });
    await rest.put(Routes.applicationCommands(client.user.id ?? CLIENT_ID), {
      body: commands,
    });
    console.log("✅ Reload slash commands thành công!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi khi load slash commands:", error);
    process.exit(1);
  }
}

// ===========================================
client.once(Events.ClientReady, async () => {
  console.log(`✅ Đăng nhập thành công: ${client.user.tag}`);
  if (LOAD_SLASH) await registerCommands(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const slashcmd = client.slashcommands.get(interaction.commandName);
  if (!slashcmd)
    return interaction.reply({
      content: "Không tìm thấy lệnh này!",
      ephemeral: true,
    });
  try {
    await slashcmd.run({ client, interaction });
  } catch (err) {
    console.error("❌ Lỗi khi chạy lệnh:", err);
    await interaction.reply({
      content: "Đã xảy ra lỗi khi chạy lệnh!",
      ephemeral: true,
    });
  }
});

// ===========================================
// 🎶 Player Events
playerManager.on("audioTrackAdd", (player, track) => {
  console.log(`🎵 Đã thêm: ${track.title} vào queue`);
});
playerManager.on("trackStart", (player, track) => {
  console.log(`▶️ Bắt đầu phát: ${track.title}`);
  player.userdata.channel?.send(`🎶 Đang phát: **${track.title}**`);
});
playerManager.on("trackEnd", (player, track) => {
  console.log(`🏁 Kết thúc: ${track.title}`);
});
playerManager.on("queueEnd", (player) => {
  console.log("📝 Queue trống, rời sau 30s");
  player.userdata.channel?.send("✅ Đã phát hết nhạc trong queue!");
});
playerManager.on("disconnect", (player) => {
  console.log("🚪 Bot đã rời voice channel");
  player.userdata.channel?.send("👋 Đã rời voice channel!");
});
playerManager.on("playerDestroy", (player) => {
  console.log("🚪 Bot đã rời voice channel");
  player.userdata.channel?.send("👋 Đã rời voice channel!");
});

playerManager.on("debug", console.log);

// ===========================================
playerManager.on("debug",console.log);
client.login(TOKEN);
