/**
 * Chủ bot.
 *
 * Khai bằng MỘT biến dạng danh sách chứ không phải nhiều dòng `BOT_OWNER_ID=`:
 * dotenv ghi đè khi trùng key nên khai lặp sẽ âm thầm mất hết trừ dòng cuối.
 */
export function ownerIds(): string[] {
  return (process.env.BOT_OWNER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOwner(userId: string): boolean {
  return ownerIds().includes(userId);
}

/**
 * Được phép thao tác trên playlist này không.
 *
 * Chủ playlist thì đương nhiên; chủ bot được thêm vào để còn dọn dẹp khi cần.
 */
export function canManagePlaylist(userId: string, playlistOwnerId: string): boolean {
  return userId === playlistOwnerId || isOwner(userId);
}
