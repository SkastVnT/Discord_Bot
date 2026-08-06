import { randomBytes } from "crypto";
import { extname } from "path";
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PlaylistError } from "../types/playlist.js";
import { removeVietnameseTones } from "../utils/viFont.js";

/**
 * Lưu file nhạc người dùng upload lên Cloudflare R2.
 *
 * R2 nói giao thức S3 nên dùng thẳng @aws-sdk/client-s3, chỉ khác ở chỗ phải trỏ
 * `endpoint` về tài khoản R2 và region đặt "auto".
 *
 * VÌ SAO KHÔNG LƯU FILE TRONG MONGODB: document Mongo trần 16MB, còn một bài mp3
 * đã 5–15MB. R2 giữ file, Mongo chỉ giữ URL — và URL công khai của R2 không hết
 * hạn nên ZiPlayer stream lại được bất cứ lúc nào qua AttachmentsPlugin.
 */

// Định dạng khớp với những gì AttachmentsPlugin phát được.
export const ALLOWED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".flac",
  ".opus",
  ".webm",
  ".aac",
] as const;

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".opus": "audio/opus",
  ".webm": "audio/webm",
  ".aac": "audio/aac",
};

let client: S3Client | null = null;

interface R2Config {
  bucket: string;
  publicBaseUrl: string;
}

function readConfig(): R2Config | null {
  const {
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    S3_API_ENDPOINT,
    R2_PUBLIC_BASE_URL,
  } = process.env;

  if (
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME ||
    !S3_API_ENDPOINT ||
    !R2_PUBLIC_BASE_URL
  ) {
    return null;
  }

  return {
    bucket: R2_BUCKET_NAME,
    publicBaseUrl: R2_PUBLIC_BASE_URL.replace(/\/+$/, ""),
  };
}

export function isR2Configured(): boolean {
  return readConfig() !== null;
}

function getClient(): { client: S3Client; config: R2Config } {
  const config = readConfig();
  if (!config) throw new PlaylistError("R2_NOT_CONFIGURED");

  if (!client) {
    client = new S3Client({
      // R2 không có khái niệm region; SDK vẫn bắt buộc phải khai nên dùng "auto".
      region: "auto",
      endpoint: process.env.S3_API_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  return { client, config };
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.R2_MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

export function isAllowedAudio(fileName: string): boolean {
  return (ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(
    extname(fileName).toLowerCase(),
  );
}

/**
 * Tên object trong bucket.
 *
 * Bỏ dấu và mọi ký tự lạ vì tên file gốc đi thẳng vào URL công khai; giữ nguyên
 * tiếng Việt có dấu sẽ tạo URL phải encode, dễ hỏng khi ZiPlayer đọc lại.
 * Chèn chuỗi ngẫu nhiên để hai người upload trùng tên không đè lên nhau.
 */
function buildKey(userId: string, fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  const base = removeVietnameseTones(fileName.slice(0, -ext.length || undefined))
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const unique = randomBytes(4).toString("hex");
  return `uploads/${userId}/${base || "track"}-${unique}${ext}`;
}

export interface UploadResult {
  key: string;
  url: string;
  bytes: number;
}

/**
 * Tải file từ URL Discord CDN rồi đẩy lên R2.
 *
 * VÌ SAO PHẢI CHÉP LẠI thay vì lưu thẳng link Discord: URL attachment của Discord
 * bây giờ có chữ ký và hết hạn sau khoảng 24 giờ, nên playlist lưu link đó sẽ chết
 * sau một ngày.
 */
export async function uploadFromUrl(
  sourceUrl: string,
  fileName: string,
  userId: string,
  expectedBytes?: number,
): Promise<UploadResult> {
  const { client: s3, config } = getClient();

  if (!isAllowedAudio(fileName)) throw new PlaylistError("UNSUPPORTED_FILE_TYPE");

  const limit = maxUploadBytes();
  if (expectedBytes != null && expectedBytes > limit) throw new PlaylistError("FILE_TOO_LARGE");

  const res = await fetch(sourceUrl);
  if (!res.ok) throw new PlaylistError("UPLOAD_FAILED", `tải file thất bại: HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  // Kiểm tra lại sau khi tải: Content-Length có thể thiếu hoặc nói dối.
  if (buffer.byteLength > limit) throw new PlaylistError("FILE_TOO_LARGE");
  if (buffer.byteLength === 0) throw new PlaylistError("UPLOAD_FAILED", "file rỗng");

  const key = buildKey(userId, fileName);
  const ext = extname(fileName).toLowerCase();

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
      // Ép trình phát stream thay vì tải xuống.
      ContentDisposition: "inline",
    }),
  );

  const url = `${config.publicBaseUrl}/${key}`;
  console.log(`[r2] đã upload ${key} (${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB)`);
  return { key, url, bytes: buffer.byteLength };
}

/** Xóa object. Không ném lỗi — xóa hụt chỉ tốn dung lượng, không được chặn luồng. */
export async function deleteObject(key: string): Promise<boolean> {
  try {
    const { client: s3, config } = getClient();
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    console.log(`[r2] đã xóa ${key}`);
    return true;
  } catch (err) {
    console.warn(`[r2] không xóa được ${key}: ${(err as Error).message}`);
    return false;
  }
}

/** Kiểm tra bucket truy cập được. Gọi lúc bot khởi động để báo lỗi sớm. */
export async function checkR2(): Promise<boolean> {
  if (!isR2Configured()) {
    console.log("[r2] chưa cấu hình — lệnh /playlist upload sẽ bị tắt.");
    return false;
  }
  try {
    const { client: s3, config } = getClient();
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
    console.log(`✅ Cloudflare R2 sẵn sàng → bucket "${config.bucket}"`);
    return true;
  } catch (err) {
    console.error(`❌ R2 không truy cập được: ${(err as Error).message}`);
    return false;
  }
}
