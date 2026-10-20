# Đưa game lên web và chơi trên điện thoại

## 1. Chơi trên điện thoại ngay (cùng wifi, không cần làm gì thêm)

1. Bấm đúp `Chay-Game.bat` trên máy tính. Trang chính hiện địa chỉ dạng `http://192.168.x.x:3000`.
2. Điện thoại vào **cùng wifi**, mở trình duyệt, gõ địa chỉ đó → vào chơi.
3. Thêm ra màn hình chính để mở như ứng dụng:
   - **Android (Chrome):** menu ⋮ → *Thêm vào màn hình chính* / *Cài đặt ứng dụng*.
   - **iPhone (Safari):** nút Chia sẻ → *Thêm vào MH chính*.
   Game mở toàn màn hình, có biểu tượng 三国 riêng (file `public/manifest.webmanifest`).

Lưu ý: qua wifi nội bộ (http) Android có thể chỉ tạo lối tắt chứ không "cài" hẳn; khi đưa lên web có https (mục 2) thì cài được như app thật.

## 2. Đưa lên web (chơi ở bất cứ đâu)

Server là Node.js + WebSocket, giữ ván đang chơi trong bộ nhớ, lưu tài khoản/bảng xếp hạng trong thư mục `DATA_DIR`.
Nơi chạy cần: **chạy liên tục 1 tiến trình**, **hỗ trợ WebSocket**, **ổ đĩa lưu lâu dài** cho `DATA_DIR`.
(Vercel/Netlify dạng serverless **không** hợp vì không giữ được WebSocket và ván chơi.)

Biến môi trường:

| Biến | Ý nghĩa |
|---|---|
| `PORT` | cổng (nền tảng thường tự đặt) |
| `ADMIN_TOKEN` | mã vào trang quản trị — **bắt buộc đặt** chuỗi dài, bí mật |
| `SESSION_GRACE_MS` | (tùy chọn) mất kết nối bao lâu thì coi như đã tắt trang: tự đăng xuất, rời phòng. Mặc định `30000` (30 giây) |
| `SESSION_GRACE_PLAYING_MS` | (tùy chọn) như trên nhưng khi đang trong ván (sau đó bot chơi thay). Mặc định `120000` |
| `DATA_DIR` | thư mục lưu tài khoản, lịch sử ván (gắn ổ đĩa) |
| `BOT_DELAY_MS` | bot "suy nghĩ" bao lâu (mặc định 700) |
| `CONTENT_DIR` | (tùy chọn) thư mục nội dung; mặc định `content/` trong code |

### Cách A0 — Railway (khuyên dùng, gói Hobby 5 USD/tháng)
Repo đã có `railway.json` (build bằng `Dockerfile`, kiểm tra sống qua `/api/status`, tự khởi động lại khi lỗi).
1. Đăng ký railway.com bằng GitHub → nâng gói **Hobby**.
2. **New Project → Deploy from GitHub repo →** `huyvtptvn/tam-quoc-sat` (cho phép Railway đọc repo nếu được hỏi).
3. Trong service: **Variables → New Variable** `ADMIN_TOKEN` = chuỗi bí mật dài.
4. Chuột phải vào service (hoặc ⌘K / Ctrl+K) → **Volume** → Mount path: `/data`.
5. **Settings → Networking → Generate Domain** (cổng: để Railway tự nhận, server đọc biến `PORT`).
6. Mỗi lần push lên `main` Railway tự build lại (~vài phút; repo có ~420 MB ảnh/âm thanh skin).
Trang quản trị: `https://<tên-miền>/admin.html`, nhập `ADMIN_TOKEN`.

### Cách A — Render / Railway / Fly.io (dễ nhất, có https sẵn)
1. Đăng nhập bằng GitHub, chọn repo `huyvtptvn/tam-quoc-sat` (repo private vẫn được).
2. Chọn kiểu **Docker** (dùng `Dockerfile` có sẵn).
3. Thêm biến `ADMIN_TOKEN`; gắn **Disk/Volume** vào đường dẫn `/data`.
4. Deploy → được địa chỉ `https://...` để gửi bạn bè. Mỗi lần push lên `main`, nền tảng tự build lại.
Chi phí: gói miễn phí thường "ngủ" khi không ai vào và không có ổ đĩa; nên dùng gói rẻ nhất có Disk (khoảng 5–7 USD/tháng).

### Cách B — VPS (DigitalOcean, Vultr, VPS Việt Nam…)
```bash
# trên VPS (Ubuntu), đã cài Docker
git clone https://github.com/huyvtptvn/tam-quoc-sat.git && cd tam-quoc-sat
docker build -t tam-quoc-sat .
docker run -d --restart unless-stopped --name tqs -p 3000:3000 \
  -e ADMIN_TOKEN='chuoi-bi-mat-dai' -v tqs-data:/data tam-quoc-sat
```
Rồi đặt **Caddy** phía trước để có https tự động (Caddy tự chuyển tiếp WebSocket):
```
# /etc/caddy/Caddyfile
tamquocsat.ten-mien-cua-ban.com {
    reverse_proxy 127.0.0.1:3000
}
```
Cập nhật bản mới: `git pull && docker build -t tam-quoc-sat . && docker rm -f tqs && docker run ...` (lệnh như trên).

### Cách C — Chạy trên máy nhà, mở ra Internet bằng Cloudflare Tunnel (miễn phí)
1. Bấm `Chay-Game.bat` như bình thường.
2. Cài `cloudflared`, chạy: `cloudflared tunnel --url http://localhost:3000`
3. Được địa chỉ `https://xxxx.trycloudflare.com` — gửi bạn bè. Máy tính phải bật thì mới chơi được.

### Lưu ý khi đưa lên web
- **Bản quyền:** ảnh skin, lồng tiếng trong `content/images/hero-skin` là của game gốc. Chỉ nên mở cho nhóm bạn bè;
  nếu mở công khai, hãy bỏ thư mục này khỏi bản deploy (game tự dùng chân dung vẽ sẵn).
- **Sao lưu** thư mục `/data` (tài khoản, bảng xếp hạng) định kỳ.
- Khởi động lại server sẽ **mất các ván đang chơi** (tài khoản, lịch sử vẫn còn).
- Sửa nội dung bằng trang quản trị trên server chỉ lưu trong container; muốn giữ lâu dài thì sửa trong repo rồi push,
  hoặc đặt `CONTENT_DIR` trỏ vào ổ đĩa.

## 3. Làm app thật trên kho ứng dụng (khi cần)

Game đã chạy tốt trên trình duyệt điện thoại, nên cách rẻ nhất là bọc trang web thành app:
- **Android:** dùng **PWABuilder** (pwabuilder.com) nhập địa chỉ https của game → tải gói **TWA** → đưa lên Google Play
  (phí tài khoản nhà phát triển 25 USD, một lần).
- **iOS:** dùng **Capacitor** bọc web thành app, cần máy Mac + Xcode và tài khoản Apple Developer 99 USD/năm.
  Apple hay từ chối app chỉ là "trang web bọc lại", nên nên có thêm chức năng riêng (thông báo, lưu ngoại tuyến…).
- Đưa lên kho ứng dụng **bắt buộc** bỏ ảnh/lồng tiếng có bản quyền và đổi tên/biểu tượng không trùng thương hiệu gốc.
