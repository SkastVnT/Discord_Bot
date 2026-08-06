import { MongoClient, type Db, type MongoClientOptions } from "mongodb";
import { existsSync } from "fs";
import { PlaylistError } from "../types/playlist.js";

/**
 * Kết nối MongoDB dùng chung cho cả bot.
 *
 * NGUYÊN TẮC: MongoDB hỏng KHÔNG được làm bot chết. Phát nhạc là chức năng chính
 * và không cần database; chỉ nhóm lệnh /playlist mới cần. Vì vậy connectMongo()
 * nuốt lỗi và chỉ ghi log, còn getDb() ném DATABASE_UNAVAILABLE để chỗ gọi trả
 * một câu thông báo tử tế thay vì stack trace.
 */

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<void> | null = null;

const SERVER_SELECTION_TIMEOUT_MS = 8_000;

function baseOptions(): MongoClientOptions {
  return {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    // Một pool nhỏ là đủ: playlist là thao tác thưa, không phải đường nóng.
    maxPoolSize: 10,
    retryWrites: true,
    tlsAllowInvalidCertificates:
      process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES === "true",
  };
}

/**
 * Chọn cách xác thực.
 *
 * Ưu tiên X.509 khi được bật VÀ đọc được file cert — cert nằm ở máy khác hoặc bị
 * xoá là chuyện thường, khi đó quay về user/password thay vì chết cứng.
 */
function resolveConnection(): { uri: string; options: MongoClientOptions; mode: string } | null {
  const passwordUri = process.env.MONGODB_URI;
  const x509Enabled = process.env.MONGODB_X509_ENABLED === "true";
  const x509Uri = process.env.MONGODB_X509_URI;
  const certPath = process.env.MONGODB_X509_CERT_PATH;

  if (x509Enabled && x509Uri && certPath) {
    if (existsSync(certPath)) {
      return {
        uri: x509Uri,
        options: { ...baseOptions(), tlsCertificateKeyFile: certPath },
        mode: "X.509",
      };
    }
    console.warn(`[mongo] Bật X.509 nhưng không thấy cert tại ${certPath} — dùng user/password.`);
  }

  if (passwordUri) return { uri: passwordUri, options: baseOptions(), mode: "user/password" };
  return null;
}

/** Che credential trước khi log. */
function safeUri(uri: string): string {
  return uri.replace(/\/\/[^@]+@/, "//***@");
}

async function tryConnect(uri: string, options: MongoClientOptions, mode: string): Promise<Db> {
  const candidate = new MongoClient(uri, options);
  await candidate.connect();
  await candidate.db().command({ ping: 1 });
  client = candidate;
  const dbName = process.env.MONGODB_DB_NAME ?? "discord_bot";
  console.log(`✅ MongoDB đã kết nối (${mode}) → ${dbName} @ ${safeUri(uri)}`);
  return candidate.db(dbName);
}

/**
 * Kết nối và tạo index. Gọi một lần lúc bot sẵn sàng.
 * Không bao giờ ném — thất bại thì chỉ log và để isMongoReady() trả false.
 */
export async function connectMongo(): Promise<void> {
  if (db) return;
  if (connecting) return connecting;

  connecting = (async () => {
    const primary = resolveConnection();
    if (!primary) {
      console.warn("[mongo] Chưa cấu hình MONGODB_URI — nhóm lệnh /playlist sẽ không dùng được.");
      return;
    }

    try {
      db = await tryConnect(primary.uri, primary.options, primary.mode);
    } catch (err) {
      console.error(`❌ MongoDB (${primary.mode}) lỗi: ${(err as Error).message}`);

      // X.509 hỏng (cert hết hạn, user chưa map) vẫn còn đường user/password.
      const fallbackUri = process.env.MONGODB_URI;
      if (primary.mode === "X.509" && fallbackUri) {
        try {
          console.warn("[mongo] Thử lại bằng user/password...");
          db = await tryConnect(fallbackUri, baseOptions(), "user/password");
        } catch (err2) {
          console.error(`❌ MongoDB user/password cũng lỗi: ${(err2 as Error).message}`);
        }
      }
    }

    if (db) {
      try {
        await ensureIndexes(db);
      } catch (err) {
        console.error(`❌ Không tạo được index MongoDB: ${(err as Error).message}`);
      }
    } else {
      console.warn("⚠️ Bot vẫn chạy bình thường, chỉ nhóm lệnh /playlist là không dùng được.");
    }
  })();

  await connecting;
  connecting = null;
}

/**
 * Index cần cho playlist.
 *
 * - unique (ownerId, guildId, normalizedName): mỗi người một tên playlist trong một server.
 * - TTL trên expiresAt: MongoDB tự dọn import session hết hạn, không cần cron.
 */
async function ensureIndexes(database: Db): Promise<void> {
  await database
    .collection("playlists")
    .createIndex({ ownerId: 1, guildId: 1, normalizedName: 1 }, { unique: true });
  await database.collection("playlists").createIndex({ guildId: 1, isPublic: 1 });
  await database
    .collection("playlist_import_sessions")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  // Unique để chặn cùng một bài hai lần không sinh document rác; cũng là index
  // dùng cho truy vấn lọc lúc import.
  await database
    .collection("playlist_blocklist")
    .createIndex({ ownerId: 1, guildId: 1, key: 1 }, { unique: true });
  console.log("✅ MongoDB indexes đã sẵn sàng");
}

export function isMongoReady(): boolean {
  return db !== null;
}

/** Lấy Db, ném DATABASE_UNAVAILABLE nếu chưa kết nối được. */
export function getDb(): Db {
  if (!db) throw new PlaylistError("DATABASE_UNAVAILABLE");
  return db;
}

export async function closeMongo(): Promise<void> {
  await client?.close().catch(() => {});
  client = null;
  db = null;
}
