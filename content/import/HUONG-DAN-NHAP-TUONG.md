# Nhập tướng từ gói tham khảo

Gói tham khảo có 128 thư mục tướng, mỗi tướng nhiều bộ ảnh (`caocao/1/full.png`, `caocao/2/full.png`, …) và file âm thanh kỹ năng.
Ba file trong thư mục này:

| File | Dùng để |
|---|---|
| `DANH-SACH-TUONG.md` | Bảng đọc: tên Hán, tên tiếng Việt, thế lực, kỹ năng (dịch từ tên file âm thanh) |
| `danh-sach-tuong.json` | Bảng máy đọc: thư mục gói → id tướng trong game, chọn bộ ảnh (`skin`) |
| `HUONG-DAN-NHAP-TUONG.md` | File này |

Tướng chia 4 nhóm:

- **Đã có trong game (33)** — chỉ lấy ảnh, giữ nguyên kỹ năng hiện tại.
  Gồm cả 3 tướng mẫu `pang_tong`, `xu_huang`, `taishi_ci` (gói đặt tên `pangtong`, `xuhuang`, `taishici`).
- **Tướng mới (85)** — nằm trong `content/generals/goi-tuong-moi.json`. **73 tướng đã có kỹ năng và được bật**
  (kỹ năng viết bằng JavaScript trong `content/scripts/goi-nguy.mjs`, `goi-thuc.mjs`, `goi-ngo.mjs`, `goi-quan.mjs`).
  12 tướng còn tắt, lý do ghi ở dòng `_lyDo`. Danh sách kỹ năng tiếng Việt: `KY-NANG-TUONG-MOI.md`.
- **Chưa hỗ trợ (8)** — 4 quân chủ (`lord_*`), 3 dã tâm gia (Chung Hội, Tư Mã Chiêu, Công Tôn Uyên), 1 thư mục chưa rõ (`wuding`).
  Engine chưa có luật quân chủ và tướng thế lực "dã tâm gia" riêng; ảnh vẫn được nhập để dùng sau.
- **Ảnh tướng úp (2)** — `sujiang` (tố tướng nam) được dùng làm mặt tướng đang úp trên bàn chơi.

## Bước 1 — Nhập ảnh (1 ảnh mỗi tướng)

Kéo thư mục gói ảnh (thư mục chứa `caocao`, `liubei`, …, hoặc thư mục cha của nó) **thả vào `Nhap-Anh-Tuong.bat`**.
Hoặc bấm đúp file đó rồi dán đường dẫn.

Dòng lệnh: `node tools/nhap-anh-tuong.mjs "D:\goi-anh"`  (thêm `--ghi-de` để chép đè ảnh cũ, `--chi-co-san` để chỉ lấy ảnh tướng đã có).

Kết quả: `content/images/generals/<id>.png`. Server đang chạy thì chỉ cần F5 trang game.

**Đổi sang bộ ảnh khác** của một tướng: trong `danh-sach-tuong.json`, đổi `"skin": null` thành số bộ ảnh (ví dụ `"skin": 3`),
rồi chạy lại với `--ghi-de`. Hoặc tải ảnh lên thủ công ở trang quản trị → Hình ảnh → Tướng.

> Ảnh `full.png` thường lớn (1–3 MB). Chơi trên máy mình thì không sao; đưa lên mạng nên thu nhỏ còn khoảng 600×800.
> Ảnh trong gói là tranh của game thương mại — dùng chơi riêng thì được, đừng phát tán công khai.

## Bước 2 — Bật dần từng tướng mới (khi đã viết kỹ năng)

Ví dụ bật **Tào Hồng** (kỹ năng gốc: Hộ Viện 护援):

1. Viết kỹ năng vào `content/skills/tao-hong.json` theo `content/HUONG-DAN-KY-NANG.md`, ví dụ id `ho_vien`.
2. Mở `content/generals/goi-tuong-moi.json`, tìm `"id": "caohong"`:

   ```json
   { "id": "caohong", "name": "Tào Hồng", "kingdom": "wei", "halfHp": 4,
     "skills": ["ho_vien"],
     "_kyNangGoc": "Hộ Viện 护援 (huyuan)" }
   ```

   Điền id kỹ năng vào `"skills"` và **xóa dòng `"disabled": true`**.
3. Lưu → bấm **Kiểm tra** ở trang quản trị (hoặc `npm run content:check -- --focus caohong`) để chạy thử cân bằng.

Tướng đang tắt vẫn hiện trong trang quản trị (mục Hình ảnh ghi "đang tắt") nhưng không được chia vào ván.

## Lưu ý

- Số âm dương ngư (`halfHp`) và thế lực của tướng mới được điền theo trí nhớ về bản Quốc Chiến — kiểm tra lại trước khi bật.
- Tên kỹ năng lấy từ tên file âm thanh; vài tên có dấu `(?)` là chưa chắc chắn.
- Âm thanh chưa dùng tới; sau này có thể nối `death.ogg` và `<kỹ năng>1.ogg` vào game theo cùng danh sách này.
