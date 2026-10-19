# Server Tam Quốc Sát (Giai đoạn 5)

## Chạy

Cách dễ nhất: bấm đúp **`Chay-Game.bat`** (Windows) / `chay-game.command` (macOS) / `./chay-game.sh` (Linux), hoặc `npm start`.
Trình khởi động tự cài thư viện lần đầu, giữ mã quản trị cố định trong file `.admin-token`, và mở trang chính.

Hoặc chạy thủ công:

```bash
npm install
npm run server          # http://localhost:3000
```

Khi khởi động, server in ra **ADMIN_TOKEN** (mã quản trị). Dùng mã này để đăng nhập trang `/admin.html`.

| Trang | Dùng để |
|---|---|
| `/` | **Trang chính**: các nút vào game, tạo phòng, quản trị, hình ảnh, hướng dẫn; link mời bạn cùng wifi |
| `/docs.html` | Hướng dẫn cấu hình kỹ năng (hiển thị đẹp, có mục lục) |
| `/game.html` | **Bàn chơi chính**: sảnh, phòng chờ, chọn tướng, chơi với người và bot |
| `/play.html` | Client kiểm thử dạng bảng (soi dữ liệu từng câu hỏi của engine) |
| `/admin.html` | Quản trị nội dung: kỹ năng, tướng, lá bài, **hình ảnh**; kiểm tra; mô phỏng |
| `/docs/ky-nang` | Hướng dẫn cấu hình kỹ năng (`content/HUONG-DAN-KY-NANG.md`) |

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng HTTP + WebSocket |
| `ADMIN_TOKEN` | ngẫu nhiên mỗi lần chạy | Mã quản trị. **Đặt cố định khi chạy thật.** |
| `CONTENT_DIR` | `./content` | Thư mục nội dung (kỹ năng, tướng, bài, hình ảnh) |
| `BOT_DELAY_MS` | `700` | Bot chờ bao lâu trước khi đánh để người chơi kịp nhìn. Bot bỏ qua (không đánh) thì trả lời ngay. |

Windows (cmd): `set ADMIN_TOKEN=matkhau-dai && npm run server`
Windows (PowerShell): `$env:ADMIN_TOKEN="matkhau-dai"; npm run server`
Linux/macOS: `ADMIN_TOKEN=matkhau-dai npm run server`

## Sửa nội dung trên server

Có 3 cách, đều dẫn tới cùng một quy trình **kiểm tra → áp dụng**:

1. **Trang quản trị** `/admin.html`: sửa file, bấm *Kiểm tra*, rồi *Lưu & áp dụng*.
2. **Sửa trực tiếp file** trong `content/`: server theo dõi thư mục và tự nạp lại sau ~0,4 giây.
3. **API** (xem bên dưới) cho công cụ riêng.

Quy tắc an toàn:
- Nội dung lỗi **không bao giờ** được áp dụng; luật cũ giữ nguyên, lỗi được báo kèm đường dẫn (`skills/x.json > ky_nang > actions[0]`).
- Đang có ván chơi thì thay đổi được **xếp hàng**, áp dụng khi mọi ván kết thúc (không đổi luật giữa ván).
- Trang quản trị chỉ ghi được `.json` / `.md`. Script `.mjs` chỉ người có quyền vào máy chủ mới thêm được.

## API

Công khai:
- `GET /api/status` — phiên bản nội dung, số phòng, số ván đang chơi
- `GET /api/catalog` — danh sách tướng, cặp, kỹ năng, lá bài, và từ điển DSL (sự kiện, hành động, biến, hàm)
- `GET /api/rooms`

Quản trị (header `x-admin-token: <mã>` hoặc `?token=<mã>`):
- `GET /api/admin/files` — liệt kê file nội dung
- `GET /api/admin/file?path=skills/a.json` — đọc
- `PUT /api/admin/file?path=skills/a.json` (body = nội dung) — kiểm tra rồi lưu + áp dụng
- `DELETE /api/admin/file?path=...` — xóa (bị chặn nếu làm nội dung khác hỏng)
- `POST /api/admin/validate` `{ path, text }` — chỉ kiểm tra, không lưu
- `POST /api/admin/reload` — nạp lại từ đĩa
- `POST /api/admin/simulate` `{ games, players, focus }` — mô phỏng cân bằng
- `GET /api/admin/images` — danh sách ảnh đang có
- `PUT /api/admin/image?kind=cards|generals&key=<id>` (body = file ảnh) — lưu ảnh; server kiểm tra chữ ký file,
  chỉ nhận PNG/JPG/WEBP/GIF ≤ 3 MB, **không nhận SVG**
- `DELETE /api/admin/image?kind=...&key=...` — xóa ảnh

Ảnh được phục vụ tại `/images/<kind>/<file>`; `GET /api/catalog` trả về trường `images` để client biết lá/tướng nào có ảnh.

## Giao thức WebSocket (`/ws`)

Mọi tin nhắn là JSON `{ "t": "<loại>", ... }` (định nghĩa đầy đủ: `src/server/protocol.ts`).

Client → server: `hello {name, token?}`, `listRooms`, `createRoom {name, seats, timeoutSec}`, `joinRoom {roomId}`,
`leaveRoom`, `addBot`, `removeBot {seat}`, `start`, `answer {reqId, response}`, `chat {text}`.

Server → client: `welcome {token}`, `rooms`, `room {room, yourSeat}`, `request {reqId, request, view, timeoutMs}`,
`requestClosed`, `state {view, log}`, `gameOver`, `chat`, `notice`, `error`.

- Server là trọng tài: client chỉ nhận **góc nhìn của mình** (`PlayerView`), không thấy bài người khác.
- Hết giờ trả lời → bot trả lời thay. Rời phòng giữa ván → bot chơi tiếp ghế đó.
- Mất kết nối: gửi lại `hello` với `token` cũ để vào lại đúng ghế, yêu cầu đang chờ được gửi lại.

## Triển khai sau reverse proxy (nginx)

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;     # bắt buộc cho WebSocket
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 3600s;
}
```

Dùng HTTPS (client tự chuyển sang `wss://`). Chạy nền bằng `pm2 start "npm run server" --name tqs` hoặc systemd.

## Giới hạn hiện tại

- Phòng và ván chơi nằm trong bộ nhớ, **một tiến trình**: khởi động lại server là mất ván đang chơi.
- Chưa có tài khoản / đăng nhập người chơi (chỉ token phiên).
- Chưa có âm thanh, chưa có hiệu ứng mũi tên chỉ mục tiêu giữa các ghế.
