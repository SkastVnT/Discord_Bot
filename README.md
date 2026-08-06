# 🎵 Discord Music Bot

Bot phát nhạc Discord (TypeScript + [ziplayer](https://www.npmjs.com/package/ziplayer)). Phát từ YouTube, Spotify và nhạc local. Có panel điều khiển bằng nút bấm và lyrics chạy theo nhạc.

## Chạy

```bash
npm install
cp .env.example .env    # điền TOKEN, CLIENT_ID, GUILD_IDS
npm run load            # đăng ký slash commands
npm start
```

`npm run dev` để chạy watch mode. `MUSIC_FOLDER` trong `.env` là tùy chọn, dùng cho nhạc local.

## Lệnh (32)

**Phát nhạc** — `/play` `/pause` `/resume` `/skip` `/back` `/replay` `/restart` `/stop` `/quit` `/leave`

**Hàng chờ** — `/queue` `/skipto` `/move` `/swap` `/remove` `/removedupes` `/shuffle` `/clear` `/loop` `/autoplay`

**Lyrics** — `/livelyrics` `/lyrics`

**Nhạc local** — `/listlocal` `/playlocal`

**Khác** — `/info` `/history` `/playtime` `/sleep` `/help` `/about` `/stats` `/ping`

Gõ `/help` trong Discord để xem mô tả từng lệnh.

## Ghi chú

- Âm lượng đổi bằng nút 🔉🔊 trên panel, không có lệnh `/volume`.
- Bot tự rời voice sau 30 phút không phát nhạc.
- Sửa file trong `src/slash/` thì bot tự reload lệnh, không cần restart (chạy `tsc --watch` song song).
