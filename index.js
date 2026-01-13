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
// 🎤 Live Lyrics Hook - Must be set BEFORE PlayerManager
const originalConsoleLog = console.log;
console.log = (...args) => {
  originalConsoleLog(...args);
  
  // Check for lyricsExt emit line
  const msg = args[0];
  if (typeof msg === 'string' && msg.includes('[lyricsExt] emit line')) {
    // Parse: [lyricsExt] emit line idx=0 t=1000 "lyrics text here"
    const match = msg.match(/\[lyricsExt\] emit line idx=\d+ t=\d+ "(.+)"/);
    if (match && match[1]) {
      const lyricLine = match[1];
      originalConsoleLog(`📝 Caught lyric: ${lyricLine}`);
      // Update all active sessions using global
      if (global.liveLyricsSessions) {
        for (const [guildId, session] of global.liveLyricsSessions) {
          if (session && session.active) {
            // Inline update logic
            session.lines = session.lines || [];
            session.lines.push(lyricLine);
            if (session.lines.length > 4) session.lines.shift();
            
            let display = "";
            for (let i = 0; i < session.lines.length - 1; i++) {
              display += `┃ *${session.lines[i]}*\n`;
            }
            if (session.lines.length > 0) {
              display += `┃ **➤ ${session.lines[session.lines.length - 1]}**`;
            }
            
            // Update lyrics field (index 4) instead of description
            try {
              session.embed.spliceFields(4, 1, { name: "🎤 Lyrics", value: display || "⏳ Đang chờ lyrics..." });
              session.message.edit({ embeds: [session.embed] }).catch(() => {});
              originalConsoleLog(`📤 Updated lyrics for guild: ${guildId}`);
            } catch (e) {
              originalConsoleLog(`❌ Error updating lyrics: ${e.message}`);
            }
          }
        }
      }
    }
  }
};

// ===========================================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1046784301615812649";
const GUILD_IDS = [
  "912280384471982091",
  "815576037236277268",
  "747365069129777172"
];
const LOAD_SLASH = process.argv[2] === "load";

// Debug token
console.log("Token loaded:", TOKEN ? `${TOKEN.substring(0, 20)}...` : "UNDEFINED");

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
  plugins: [new YTSRPlugin(), new YouTubePlugin(), new SpotifyPlugin()], // Removed SoundCloudPlugin due to client_id issues
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
    console.log(`🔄 Reloading ${commands.length} slash command(s) cho ${GUILD_IDS.length} guild(s)...`);
    
    // Load commands cho từng guild
    for (const guildId of GUILD_IDS) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
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

playerManager.on("trackStart", async (player, track) => {
  console.log(`▶️ Bắt đầu phát: ${track.title}`);
  
  // Cập nhật Live Info+Lyrics embed khi chuyển bài
  const guildId = player.guildId;
  const channel = player.userdata.channel;
  
  if (global.liveLyricsSessions && global.liveLyricsSessions.has(guildId)) {
    const session = global.liveLyricsSessions.get(guildId);
    if (session && session.active && channel) {
      // Xóa embed cũ
      await session.message.delete().catch(() => {});
      if (session.progressInterval) clearInterval(session.progressInterval);
      
      // Reset lyrics cho bài mới
      session.lines = [];
      session.track = track;
      
      // Tạo embed mới với thông tin bài mới
      const progress = player.getProgressBar?.({ timecodes: true, length: 15 }) || "0:00  advancement 0:00";
      const { EmbedBuilder } = await import("discord.js");
      
      const newEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(`🎶 ${track.title}`)
        .setURL(track.url)
        .setThumbnail(track.thumbnail)
        .addFields(
          { name: "👤 Ca sĩ", value: track.author || "Không rõ", inline: true },
          { name: "⏱️ Thời lượng", value: String(track.duration || "N/A"), inline: true },
          { name: "📡 Nguồn", value: track.source || "youtube", inline: true },
          { name: "▶️ Tiến trình", value: `\`${progress}\`` },
          { name: "🎤 Lyrics", value: "⏳ Đang tải lyrics..." }
        )
        .setFooter({ text: `🎵 /livelyrics off để tắt` })
        .setTimestamp();
      
      // Gửi embed mới xuống dưới cùng
      const newMessage = await channel.send({ embeds: [newEmbed] });
      
      session.embed = newEmbed;
      session.message = newMessage;
      
      // Tạo lại interval cập nhật progress
      session.progressInterval = setInterval(async () => {
        try {
          const currentPlayer = (await import("ziplayer")).getPlayer(guildId);
          if (!currentPlayer || !currentPlayer.isPlaying) {
            clearInterval(session.progressInterval);
            return;
          }
          const newProgress = currentPlayer.getProgressBar?.({ timecodes: true, length: 15 }) || "";
          if (newProgress) {
            session.embed.spliceFields(3, 1, { name: "▶️ Tiến trình", value: `\`${newProgress}\`` });
            await session.message.edit({ embeds: [session.embed] }).catch(() => {});
          }
        } catch (e) {}
      }, 5000);
      
      console.log(`🔄 Created new embed for: ${track.title}`);
    }
  } else {
    // Không có session, chỉ gửi thông báo đơn giản
    channel?.send(`🎶 Đang phát: **${track.title}**`);
  }
});

playerManager.on("trackEnd", (player, track) => {
  console.log(`🏁 Kết thúc: ${track.title}`);
});

playerManager.on("queueEnd", (player) => {
  console.log("📝 Queue trống, rời sau 30s");
  player.userdata.channel?.send("✅ Đã phát hết nhạc trong queue!");
  
  // Cleanup session khi hết queue
  const guildId = player.guildId;
  if (global.liveLyricsSessions && global.liveLyricsSessions.has(guildId)) {
    const session = global.liveLyricsSessions.get(guildId);
    if (session) {
      if (session.progressInterval) clearInterval(session.progressInterval);
      session.active = false;
      session.embed
        .setColor("#888888")
        .spliceFields(4, 1, { name: "🎤 Lyrics", value: "⏹️ Đã dừng phát" });
      session.message.edit({ embeds: [session.embed] }).catch(() => {});
      global.liveLyricsSessions.delete(guildId);
    }
  }
});

playerManager.on("disconnect", (player) => {
  console.log("🚪 Bot đã rời voice channel");
  player.userdata.channel?.send("👋 Đã rời voice channel!");
});

playerManager.on("playerDestroy", (player) => {
  console.log("🚪 Bot đã rời voice channel");
  player.userdata.channel?.send("👋 Đã rời voice channel!");
  
  // Cleanup session
  const guildId = player.guildId;
  if (global.liveLyricsSessions && global.liveLyricsSessions.has(guildId)) {
    const session = global.liveLyricsSessions.get(guildId);
    if (session && session.progressInterval) clearInterval(session.progressInterval);
    global.liveLyricsSessions.delete(guildId);
  }
});

// Debug output đi qua hooked console.log để bắt lyrics
playerManager.on("debug", (...args) => console.log(...args));

// ===========================================
client.login(TOKEN);
