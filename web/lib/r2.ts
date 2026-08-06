import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import { extname } from "path";
import { allUsedR2Keys } from "./db";
import type { StorageObject } from "./types";

/**
 * Nói chuyện trực tiếp với Cloudflare R2 qua S3 API — không đi qua bot.
 *
 * Cùng bucket và cùng cặp key mà bot dùng, nên xóa ở đây là xóa thật; mọi thao
 * tác xóa trong UI đều phải hỏi lại người dùng trước.
 */

const globalForR2 = globalThis as unknown as { _r2?: S3Client };

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

export const ALLOWED_EXTENSIONS = Object.keys(CONTENT_TYPES);

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.S3_API_ENDPOINT &&
      process.env.R2_PUBLIC_BASE_URL,
  );
}

function client(): S3Client {
  if (!globalForR2._r2) {
    globalForR2._r2 = new S3Client({
      region: "auto",
      endpoint: process.env.S3_API_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return globalForR2._r2;
}

const bucket = () => process.env.R2_BUCKET_NAME!;
const publicBase = () => (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

export function publicUrl(key: string): string {
  return `${publicBase()}/${key}`;
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.R2_MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

/**
 * Liệt kê toàn bộ object trong bucket, đánh dấu cái nào mồ côi.
 *
 * Mồ côi = có trên R2 nhưng không playlist nào trỏ tới. Xảy ra khi xóa playlist
 * lúc R2 đang lỗi, hoặc khi upload xong mà ghi Mongo hỏng giữa chừng.
 */
export async function listObjects(): Promise<StorageObject[]> {
  const used = await allUsedR2Keys();
  const out: StorageObject[] = [];
  let token: string | undefined;

  // Mỗi lần ListObjectsV2 trả tối đa 1000 key, phải lặp cho hết.
  do {
    const res = await client().send(
      new ListObjectsV2Command({ Bucket: bucket(), ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      const usedBy = used.get(obj.Key);
      out.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified,
        url: publicUrl(obj.Key),
        orphan: !usedBy,
        ...(usedBy ? { usedBy } : {}),
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out.sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0));
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Bỏ dấu và ký tự lạ vì key đi thẳng vào URL công khai. */
function buildKey(ownerId: string, fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  const base = fileName
    .slice(0, -ext.length || undefined)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `uploads/${ownerId}/${base || "track"}-${randomBytes(4).toString("hex")}${ext}`;
}

export async function uploadBuffer(
  buffer: Buffer,
  fileName: string,
  ownerId: string,
): Promise<{ key: string; url: string; bytes: number }> {
  const ext = extname(fileName).toLowerCase();
  if (!CONTENT_TYPES[ext]) throw new Error(`Định dạng ${ext || "(không rõ)"} không phát được`);
  if (buffer.byteLength > maxUploadBytes()) {
    throw new Error(`File vượt trần ${(maxUploadBytes() / 1024 / 1024).toFixed(0)}MB`);
  }
  if (buffer.byteLength === 0) throw new Error("File rỗng");

  const key = buildKey(ownerId, fileName);
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: CONTENT_TYPES[ext],
      ContentDisposition: "inline",
    }),
  );

  return { key, url: publicUrl(key), bytes: buffer.byteLength };
}
