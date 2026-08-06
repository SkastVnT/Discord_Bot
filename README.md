# 🎵 Discord Music Bot

Bot phát nhạc Discord (TypeScript + [ziplayer](https://www.npmjs.com/package/ziplayer)). Phát từ YouTube, Spotify và nhạc local. Có panel điều khiển bằng nút bấm, lyrics chạy theo nhạc, và playlist lưu trong MongoDB.

## Chạy

```bash
npm install
cp .env.example .env    # điền TOKEN, CLIENT_ID, GUILD_IDS
npm run load            # đăng ký slash commands
npm start
```

`npm run dev` để chạy watch mode, `npm test` để chạy test.

Tùy chọn trong `.env`: `MUSIC_FOLDER` cho nhạc local, `MONGODB_URI` cho `/playlist`, nhóm `R2_*` cho `/playlist upload`. Thiếu MongoDB hay R2 thì bot vẫn chạy bình thường, chỉ phần tương ứng bị tắt.

## Lệnh (33)

**Phát nhạc** — `/play` `/pause` `/resume` `/skip` `/back` `/replay` `/restart` `/stop` `/quit` `/leave`

**Hàng chờ** — `/queue` `/skipto` `/move` `/swap` `/remove` `/removedupes` `/shuffle` `/clear` `/loop` `/autoplay`

**Lyrics** — `/livelyrics` `/lyrics`

**Nhạc local** — `/listlocal` `/playlocal`

**Playlist** — `/playlist import` `/playlist upload` `/playlist manage` `/playlist play`

**Khác** — `/info` `/history` `/playtime` `/sleep` `/help` `/about` `/stats` `/ping`

Gõ `/help` trong Discord để xem mô tả từng lệnh.

## Playlist

`/playlist import url:<link>` nhận link YouTube — video đơn, playlist, hoặc Mix (`list=RD...`) — rồi hiện danh sách bài thật để tick chọn:

```text
┌─ 📀 YouTube Mix — 20 bài ──────────────────────┐
│ Tìm thấy 20 bài • đang chọn 3                  │
│ ▾ Chọn bài — trang 1/1                         │
│ [Chọn trang này] [Chọn tất cả] [Bỏ chọn hết]   │
│ [Hủy]                          [Thêm 3 bài]    │
└────────────────────────────────────────────────┘
```

25 bài mỗi trang, lựa chọn được giữ khi lật trang. Chọn xong thì chọn playlist đích (hoặc tạo mới), bot lưu vào MongoDB và phát lại bằng `/playlist play`.

`/playlist upload file:<đính kèm> playlist:<tên>` để tải file nhạc của bạn lên. File lưu trên Cloudflare R2, bot phát lại qua URL công khai — không dùng link Discord vì link đó hết hạn sau khoảng một ngày.

`/playlist manage` mở panel quản lý: xem playlist có phân trang, chọn từng bài để phát ngay hoặc xóa, phát cả playlist, xóa playlist. Xóa bài hoặc xóa playlist thì file trên R2 cũng được dọn theo.

Toàn bộ thao tác nằm trong Discord — không có web UI, không cần OAuth.

## Spotify

`/play` và `/playlist import` nhận link Spotify:

| Loại | Trạng thái |
| --- | --- |
| `open.spotify.com/track/…` | ✅ |
| `open.spotify.com/album/…` | ✅ |
| `spotify:track:…` (URI) | ✅ |
| `open.spotify.com/playlist/…` | ❌ Spotify chặn |

Spotify không cho stream audio, nên bot lấy metadata (tên bài, ca sĩ, thời lượng, ảnh bìa) từ Web API rồi khớp sang YouTube để phát. Tên bài giữ theo Spotify vì sạch hơn tiêu đề YouTube.

**Playlist không đọc được** — kiểm chứng 06/08/2026: với Client Credentials, `/playlists/{id}` không còn trả trường `tracks` và `/playlists/{id}/tracks` trả 403 cho *mọi* playlist, kể cả playlist người dùng tự tạo. Muốn đọc phải dùng Authorization Code flow (người dùng đăng nhập Spotify + redirect URI). Dùng link album thay thế.

Cần `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_MARKET` trong `.env`.

## Chặn bài

Xóa một bài khỏi playlist là nó vào danh sách chặn — lần import Mix sau sẽ tự lọc ra, không phải bỏ lại lần nữa. So sánh bằng URL chuẩn hoá nên `youtu.be/ID` và `watch?v=ID&list=…` đều nhận ra là cùng một bài.

Xem: `/playlist blocked`. Gỡ: `/playlist unblock url:<link video đơn>` — cố ý **không** nhận link playlist/Mix, vì một thao tác như vậy sẽ gỡ cả rổ bài đã bỏ công loại.

## Ghi chú

- Âm lượng đổi bằng nút 🔉🔊 trên panel, không có lệnh `/volume`.
- Bot tự rời voice sau 30 phút không phát nhạc.
- Sửa file trong `src/slash/` thì bot tự reload lệnh, không cần restart (chạy `tsc --watch` song song).
- Playlist chỉ lưu URL video chuẩn, không lưu URL stream — stream có chữ ký và hết hạn, nên mỗi lần phát đều resolve lại.
- Video tổng hợp (playlist 1 tiếng, full album, "TOP 20"…) bị lọc khỏi kết quả import.

## Web UI dev (tùy chọn)

Công cụ nội bộ trong [web/](web/) để xem và quản lý playlist ngoài Discord: tạo/đổi tên/xóa playlist, thêm bài từ link YouTube, upload file lên R2, sắp xếp và xóa bài, và trang **Storage** đối chiếu bucket R2 với database để tìm file mồ côi.

```bash
cd web
npm install
npm run dev     # http://127.0.0.1:3100
```

Mở `http://127.0.0.1:3100/?key=<DEV_UI_TOKEN>` một lần để đặt cookie (token nằm trong `web/.env.local`).

Chỉ nghe `127.0.0.1` và có token chặn — **đừng deploy app này**, nó nối thẳng vào database và bucket thật.
