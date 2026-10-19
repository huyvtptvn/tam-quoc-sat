# Tam Quốc Sát Engine – Giai đoạn 1–14

Engine luật chơi Quốc Chiến viết bằng TypeScript + server WebSocket + nội dung cấu hình bằng JSON + giao diện bàn chơi.

## Chạy nhanh: bấm đúp

| Máy | File |
|---|---|
| Windows | **`Chay-Game.bat`** |
| macOS | `chay-game.command` (lần đầu: chuột phải → Open) |
| Linux | `./chay-game.sh` |

Cần cài Node.js 20+ (https://nodejs.org, bản LTS). File khởi động (`launcher/start.mjs`) sẽ:
lần đầu tự `npm install` → tìm cổng trống → tạo mã quản trị cố định (file `.admin-token`) → bật server →
mở trình duyệt vào **trang chính** có các nút: Vào chơi, Tạo phòng, Quản trị nội dung, Hình ảnh, Hướng dẫn kỹ năng,
kèm link mời bạn bè cùng wifi. Trang quản trị tự đăng nhập trên máy này. Đóng cửa sổ đen là tắt server.

Cách khác: `npm start` (giống bấm đúp) hoặc `npm run server` (chỉ bật server).

## Gói tướng mới (xem giai đoạn 12: nay đủ 177 tướng)

`content/scripts/goi-*.mjs` cài kỹ năng cho 73 tướng mới (dịch từ mô tả Quốc Chiến của QSanguosha Hegemony; phần không có nguồn
được ghi "phỏng theo"). Danh sách: `content/import/KY-NANG-TUONG-MOI.md`. Engine được mở rộng thêm: lật úp tướng, lượt thêm,
lá ảo, giáp ảo, cẩm nang trì hoãn chuyển hóa, cấm màu bài, trao kỹ năng, loại bỏ tướng, đấu điểm, quân lệnh, trận vây công.

## Nhập tướng từ gói ảnh tham khảo

Kéo thư mục gói ảnh thả vào **`Nhap-Anh-Tuong.bat`** → mỗi tướng lấy 1 ảnh vào `content/images/generals/`.
128 tướng đã được dịch tên và xếp nhóm trong `content/import/` (33 tướng có sẵn chỉ lấy ảnh, 85 tướng mới
đã thêm vào `content/generals/goi-tuong-moi.json` ở trạng thái tắt, chờ viết kỹ năng). Xem `content/import/HUONG-DAN-NHAP-TUONG.md`.

## Giai đoạn 6: Giao diện bàn chơi + hình ảnh

```bash
npm install
npm run server      # mở http://localhost:3000/game.html
```

- **`public/game.html`** + `public/ui/game.js`, `game.css` — bàn chơi: sảnh, phòng chờ (tự thêm bot), chọn tướng,
  ghế xếp hình chữ U theo chiều lượt, bài trên tay dạng quạt (lá dùng được sáng viền), chọn mục tiêu bằng cách bấm ghế,
  nhấp đúp để dùng nhanh, thanh thời gian, hiệu ứng mất/hồi máu, nhật ký + trò chuyện, màn kết quả; chạy được trên điện thoại
- **`public/ui/cards.js`** + `cards.css` — vẽ lá bài (giấy dó, triện son ghi chất/điểm, chữ thư pháp), mặt sau, chân dung tướng;
  dùng chung cho game và trang quản trị
- **Hình ảnh**: `content/images/cards/<id>.png`, `content/images/generals/<id>.png` (xem `content/images/README.md`),
  hoặc tải lên ở `/admin.html` → mục *Hình ảnh* (kéo-thả). Không có ảnh thì tự vẽ mặt mặc định
- Font đi kèm trong `public/fonts/` (Noto Serif có tiếng Việt, Ma Shan Zheng rút gọn còn 36 KB) — không cần Internet
- Bot có nhịp (`BOT_DELAY_MS`, mặc định 700 ms) để người chơi kịp theo dõi
- Lá bài trong `content/cards` nhận thêm `desc` (mô tả) và `glyph` (chữ giữa mặt bài)

---

## Giai đoạn 5: Server + nội dung sửa được trên server

```bash
npm install
npm run server            # mở http://localhost:3000 — mã quản trị in ra màn hình
npm run content:check     # kiểm tra nội dung + mô phỏng 100 ván
npm test
```

- **`content/`** — khu vực thêm kỹ năng / tướng / lá bài, không cần sửa code (xem `content/README.md`)
- **`content/HUONG-DAN-KY-NANG.md`** — hướng dẫn cấu hình kỹ năng theo mẫu KHI – NẾU – THÌ,
  3 nhóm: kích hoạt (`trigger`), chủ động (`active`), bị động (`passive`); bảng sự kiện, hành động, công thức mẫu
- `src/content/` — ngôn ngữ biểu thức an toàn (không `eval`), trình biên dịch JSON → kỹ năng engine, bộ nạp 2 bước
  (kiểm tra hết rồi mới áp dụng), bộ kiểm tra + mô phỏng cân bằng
- `src/server/` — HTTP + WebSocket, phòng chơi, bot thay người khi hết giờ / rời phòng, kết nối lại bằng token,
  API quản trị (ADMIN_TOKEN), tự nạp lại khi file nội dung đổi, chỉ áp dụng luật mới khi không còn ván đang chơi
- `public/` — `play.html` (client chơi thử), `admin.html` (trình sửa nội dung + mô phỏng)
- Chi tiết vận hành, API, giao thức, triển khai: **SERVER.md**

---

## Chế độ Thảo Phạt (đánh boss) và bảng xếp hạng riêng

- Tạo phòng → **Kiểu ván: Thảo Phạt** → chọn boss và độ khó (Thường / Khó / Ác mộng), 2–5 người chơi; boss ngồi thêm 1 ghế, do máy điều khiển.
- Mọi người lật tướng từ đầu, cùng phe **Liên quân**, ghép tướng tự do. Mỗi vòng: người chơi lần lượt đi, rồi tới boss.
- **Lữ Bố – Hổ Lao Quan**: máu = 4 + 4 × số người chơi (× 1.2 Khó, × 1.4 Ác mộng; Khó/Ác mộng boss bốc thêm 1 lá).
  Giai đoạn 1: Vô Song, Thần Kích (Sát là lá cuối cùng thì thêm 2 mục tiêu), Mã Thuật.
  Còn nửa máu → **Bạo Nộ**: hồi 3 máu, bỏ khu vực phán định, thêm Tu La và Thần Phẫn.
- Người chơi chết: sống lại sau 2 lượt boss (2 máu, 2 lá), mỗi lần tốn 1 **Quân lương** (3; Ác mộng 2).
  Thua khi tất cả người chơi cùng chết hoặc quá 15 vòng. Boss nhắm người có **thù hận** cao nhất; kỹ năng chung **Khiêu Chiến** kéo boss về mình.
- **Chiến công** = điểm trong ván + thưởng hạ boss (+30 / +50 / +80) + 2 điểm mỗi vòng sớm hơn giới hạn. Không tính Elo.
- **Bảng xếp hạng Thảo Phạt**: `/ranking.html#thao-phat` — đội hạ boss nhanh nhất và người chơi theo tổng Chiến công, lọc theo boss/độ khó.
- Thêm boss mới: khai báo trong `src/hegemony/boss.ts` (`BOSSES`, tướng `boss_*`, kỹ năng).

## Skin tướng và lồng tiếng (từ QSanguosha)

- Thư mục `content/images/hero-skin/<id tướng QSGS>/<số skin>/` (chép nguyên từ `hero-skin` của QSanguosha):
  `full.png` là ảnh tướng, `<kỹ năng><n>.ogg` là lồng tiếng kỹ năng, `death.ogg` là câu nói khi tử trận, `zh_CN.lua` chứa tên skin.
- Server tự đọc (`src/server/skins.ts`), đổi id tướng/kỹ năng QSGS sang id trong game qua `content/import/qsgs-viet.json`,
  phục vụ ở `/api/skins` và `/skins/...`. Hiện 125/179 tướng có skin (1050 skin).
- Trong game: ảnh tướng dùng skin; màn chọn tướng có nút ‹ › để đổi skin (lưu trên trình duyệt, chỉ đổi cách BẠN nhìn thấy).
  Khi ai đó dùng kỹ năng hoặc tử trận, game phát lồng tiếng của skin bạn chọn cho tướng đó. Nút "🔊 Tiếng" trên thanh trên cùng để tắt/bật.
- Ảnh tải lên ở `content/images/generals/<id>.png` (trang Hình ảnh) vẫn được dùng nếu bạn chưa chọn skin nào cho tướng đó.

## Giai đoạn 14: Theo đúng file lua, tướng 2 thế lực, tướng tím

- **Kỹ năng và tên tướng theo file lua bạn gửi** (`content/import/qsgs-viet.json`): làm lại Bàng Thống, Từ Hoảng, Thái Sử Từ
  (`content/scripts/goi-chuan.mjs`), đổi 13 tên tướng và 22 tên kỹ năng cho đúng chữ trong file, bỏ bản chỉnh 5 ngư của Hứa Chử.
  Trần Cung và Lưu Biểu không có trong file nên đã tắt (`content/generals/vi-du.json`, xóa dòng `disabled` để bật lại).
- **Tướng 2 thế lực** (`content/generals/tuong-2-the-luc.json`, trường `"kingdoms": ["wei", "shu"]`): chỉ làm phó tướng;
  chủ tướng phải thuộc 1 trong 2 thế lực và quyết định phe. Đổi phó tướng cũng nhận được tướng 2 thế lực hợp phe.
- **Tướng tím (Dã tâm gia)**: chỉ làm chủ tướng, phó tướng bất kỳ; khi chủ tướng tím còn úp thì tạm theo thế lực phó tướng.
  Lật chủ tướng tím = **bạo lộ dã tâm**: thành dã tâm gia, nhận **dấu Dã Tâm Gia** (dùng thay Âm Dương Ngư / Tiên Khu /
  Châu Liên Bích Hợp) và được dùng **Lạp Long Nhân Tâm**: mời lần lượt mọi người, người đầu tiên đồng ý gia nhập
  (bốc đến 4 lá, hồi 1 máu, thắng/thua cùng phe dã tâm gia). Phe "giả" sắp thắng mà tướng tím còn úp thì bị buộc lật.

## Giai đoạn 13: Tính điểm, tài khoản, Elo, bảng xếp hạng

- **Điểm trong ván** (`src/hegemony/scoring.ts`, bảng số ở `SCORE_RULES`): sát thương, hạ gục, hồi máu, hủy/lấy bài, làm mất máu,
  tù thành công, lật úp/Điệu Hổ, Vô Giải bảo vệ, đỡ Sát, giao bài cho đồng đội, và điểm kết thúc ván
  (phe thắng còn sống +20, đã chết +10, dã tâm gia thắng +40, sống sót +3, lật tướng đầu tiên +1).
  Điểm quy theo **phe thật lúc hết ván**; đánh địch còn úp +4, lỡ đánh đồng đội còn úp chỉ −1.
  Cuối ván hiện bảng điểm từng mục + danh hiệu (MVP, Sát Thần, Thần Y, Cai Ngục, Đạo Tặc, Kẻ Phản Bội).
- **Tài khoản**: đăng ký/đăng nhập ở màn hình vào game (tab "Tài khoản"). Mật khẩu lưu dạng băm scrypt.
  Khách vẫn chơi được nhưng không lưu điểm.
- **Lưu ván + Elo** (`src/server/accounts.ts`, `src/server/elo.ts`): dữ liệu ở thư mục `data/` (`accounts.json`, `matches.jsonl`;
  đổi chỗ bằng biến `DATA_DIR`). Elo khởi điểm 1200, so từng cặp người chơi: khác phe = 70% thắng/thua + 30% điểm cá nhân,
  cùng phe = chỉ so điểm cá nhân. 10 ván đầu K=40, sau đó K=24; ván chỉ có 1 tài khoản (còn lại bot/khách) đổi một nửa.
- **Bảng xếp hạng**: `/ranking.html` — xếp theo Elo, số trận thắng, điểm TB, MVP; trang người chơi (20 ván gần nhất) và chi tiết từng ván.
  Cấp bậc: Binh Sĩ → Ngũ Trưởng (1000) → Đô Úy (1100) → Hiệu Úy (1200) → Tướng Quân (1300) → Đại Tướng Quân (1450) → Đại Đô Đốc (1600) → Vương (1800).
- API: `POST /api/account/register|login|logout`, `GET /api/account/me` (header `x-account-token`), `GET /api/leaderboard?sort=`,
  `GET /api/profile?u=`, `GET /api/match?id=`.

## Giai đoạn 12: Đủ tướng, đủ bài, luật Quốc Chiến còn thiếu

- **177 tướng + 4 quân chủ** (Ngụy 40 · Thục 37 · Ngô 40 · Quần 54 · Dã tâm gia 6). Kỹ năng sửa theo file Việt hóa bạn gửi
  (`content/import/qsgs-viet.json`). Danh sách, chỗ đơn giản hóa và máu ước lượng: `content/import/GIAI-DOAN-12.md`.
- **Bộ bài Quốc Chiến đầy đủ 169 lá** (gốc 108 + Thế Bị + Quân Lệnh): Hỏa Thiêu Liên Doanh, Điệu Hổ Ly Sơn, Lục Lực Đồng Tâm,
  Liên Quân Thịnh Yến, Hiệp Thiên Tử, Sắc Lệnh, 4 cẩm nang thế lực + Chiếu Thư, Lục Kiếm, Tam Tiêm, Phi Long, Hộ Tâm Kính,
  Minh Quang Khải, Thái Bình Yêu Thuật, Kinh Phàm, Lục Long… Đã bỏ Hoan Lạc và Quân Lệnh Trạng. Mô tả lá theo file bạn gửi.
- **Luật mới:** đại/tiểu thế lực, Hợp Tung (lá có dấu 合 giao được cho người khác), chồng bài tướng + chồng tướng riêng
  ([Hồn] của Tả Từ, [Lục] của Tôn Sâm), quân chủ (ô "Quân chủ" khi tạo phòng), tướng Dã tâm gia (`ye`, chỉ làm chủ tướng),
  Điệu Hổ Ly Sơn (rời ván tạm thời), vùng "ngoài ván" cho lá bị loại.
- Chạy kiểm tra: `npm test` (405 test) và `npx tsx src/content/check.ts --games 200 --players 8 --deck quocchien --mode chaos`.

## Giai đoạn 11: Chế độ chọn tướng, đổi bài khởi đầu, xác nhận khi dùng lá

Khi tạo phòng có thêm:

| Tùy chọn | Ý nghĩa |
|---|---|
| Chế độ **Bình thường** | Chia ngẫu nhiên vài tướng, chọn 2 tướng cùng thế lực |
| Chế độ **Tự chọn tướng** | Xem toàn bộ danh sách (lọc theo thế lực, tìm theo tên), chọn 2 tướng cùng thế lực. Chọn lần lượt theo ghế, không trùng |
| Chế độ **Loạn tướng** | Chia 3 tướng ngẫu nhiên, chọn 2 tướng bất kỳ — không cần cùng thế lực. Phe theo **chủ tướng** |
| **Đổi bài khởi đầu** | Sau khi chia 4 lá, mọi người cùng lúc chọn "Đổi bài" (xào lại, bốc 4 lá mới, 1 lần) hoặc "Giữ bài" |

Dùng lá: bấm lá → lá được đẩy lên, thanh thao tác hỏi "Dùng Đào?" → **Có** / **Không**. Lá cần mục tiêu: bấm lá, bấm người,
rồi xác nhận "Dùng Sát vào …?". Khi bị đòi đánh (Thiểm, Đào cứu…) cũng vậy. Phím Enter = Có, Esc = Không.
Nhấp đúp vào lá vẫn dùng ngay (không hỏi) cho người chơi quen tay.

Engine: `new HegemonyGame(players, { mode: 'normal' | 'free' | 'chaos', mulligan: true })`.
Mô phỏng: `npm run content:check -- --mode chaos`.

---

## Giai đoạn 8: Chọn bộ bài khi tạo phòng

- Bộ **Quân Tranh 160 lá** (`QUANTRANH_DECK` trong `src/core/cards.ts`), nhập từ bảng chất/điểm trên wiki.
- Khi tạo phòng chọn **Bộ bài**: Quốc Chiến hoặc Quân Tranh. Danh sách lấy từ `DECKS`, server gửi qua `/api/catalog`.
- 6 lá mới: Thư Hùng Song Cổ Kiếm, Trượng Bát Xà Mâu, Chu Tước Vũ Phiến (vũ khí), Hoa Lưu (ngựa +1),
  Tá Đao Sát Nhân, Ngũ Cốc Phong Đăng (cẩm nang).
- Giới tính tướng: `FEMALE_GENERALS` trong `src/hegemony/generals.ts`, hoặc `"gender": "female"` trong JSON tướng.
- Mô phỏng thử: `npm run content:check -- --deck quantranh --players 8`.
- **Ô bảo vật** (ô trang bị thứ 5) với Ngọc Tỷ, Mộc Ngưu Lưu Mã, Định Lan Dạ Minh Châu (`src/hegemony/treasures.ts`),
  thêm Thủy Yêm Thất Quân. Bộ Quốc Chiến thành 119 lá.
- Bộ **Ứng Biến** (143 lá), **đổi phó tướng** (Kỳ Sách, Chế Man, Điển Tài), lật tướng bất cứ lúc nào trong lượt.
- Giao diện: bấm lá bài là dùng (lá cần mục tiêu: bấm tiếp vào người trên bàn), kỹ năng dùng được sáng nhấp nháy.
- Chi tiết: `content/BO-BAI.md`.

---

## Giai đoạn 4: Bộ bài đầy đủ

- Bộ bài 114 lá (`buildStandardDeck()` trong `src/core/cards.ts`, bảng `STANDARD_DECK` dễ sửa)
- Cơ bản: Sát / Hỏa Sát / Lôi Sát, Thiểm, Đào, Rượu
- Cẩm nang (`src/core/tricks.ts`): Vô Giải Khả Kích (+ bản Quốc), Quyết Đấu, Nam Man, Vạn Tiễn, Vô Trung Sinh Hữu,
  Quá Hà Sách Kiều, Thuận Thủ Khiên Dương, Đào Viên Kết Nghĩa, Hỏa Công, Thiết Tác Liên Hoàn
- Cẩm nang Quốc Chiến (`src/hegemony/cards.ts`): Tri Kỷ Tri Bỉ, Viễn Giao Cận Công, Dĩ Dật Đãi Lao
- Cẩm nang trì hoãn: Lạc Bất Tư Thục, Binh Lương Thốn Đoạn, Thiểm Điện
- Trang bị (`src/core/equipment.ts`): 8 vũ khí, 4 giáp, 6 ngựa
- Cơ chế: khu vực trang bị, khu vực phán định, sát thương thuộc tính, xích, chuỗi Vô Giải, trùng chú, ghi chú riêng tư
- Cân bằng lại bằng mô phỏng 900 ván / phương án (ghi chú "cân bằng" trong `generals.ts`)
- Các lá Quân Tranh (Trượng Bát, Chu Tước, Thư Hùng, Hoa Lưu, Tá Đao Sát Nhân, Ngũ Cốc Phong Đăng) đã có từ giai đoạn 8.

---

## Giai đoạn 3: Mở rộng tướng và cân bằng

- 32 tướng (8 mỗi thế lực): thêm Hạ Hầu Đôn, Trương Liêu, Điển Vi, Chân Cơ, Lưu Bị, Mã Siêu, Hoàng Trung,
  Khương Duy, Chu Du, Tôn Sách, Đinh Phụng, Chu Thái, Điêu Thuyền, Trương Giác, Công Tôn Toản, Lưu Biểu
- Cơ chế lõi mới: phán định (`judge` / `finishJudge`), chọn phương án (`choose`), chọn mục tiêu (`chooseTargets`),
  bắt bỏ bài (`forceDiscard`), dùng Sát ngoài lượt (`slashOutOfTurn`), khu vực riêng trên tướng (`special`),
  Sát không thể né (`noDodge`), sự kiện `damageDealt` và `judged`
- Kỹ năng sửa luật mới: `rangeBonus`, `defenseBonus`, `handLimitBonus`, `restrictTarget`
- Kỹ năng chủ tướng / phó tướng (`position: 'main' | 'deputy'`)
- Ký hiệu Châu Liên Bích Hợp (bốc 2 lá hoặc dùng như Đào, kể cả để cứu người khác)
- Chia ứng viên ngẫu nhiên như bốc bài thật (để dã tâm gia có thể xuất hiện)
- Cân bằng bằng mô phỏng: 6 tướng được chỉnh số âm dương ngư (ghi chú "cân bằng" trong `generals.ts`)
- Sửa lỗi: lá đáp lại có thể bị kẹt ở vùng xử lý nếu kỹ năng kết thúc ván giữa chừng (fuzz test phát hiện)

---

## Giai đoạn 1 + 2: Luật lõi và Quốc Chiến

Engine luật chơi viết bằng TypeScript, **không phụ thuộc mạng hay giao diện**.

## Giai đoạn 2: Quốc Chiến (thư mục `src/hegemony/`)

- Chọn 2 tướng cùng thế lực từ danh sách ứng viên, úp xuống; máu = tổng âm dương ngư / 2
- Lật tướng đầu lượt hoặc khi muốn dùng kỹ năng của tướng đang úp
- Thế lực tính từ tướng đã lật; người chưa lộ thì không cùng phe cũng không khác phe
- Dã tâm gia khi thế lực lộ diện vượt quá một nửa số người chơi
- Thưởng khi giết khác phe, phạt khi giết cùng phe; điều kiện thắng Quốc Chiến
- Ký hiệu Tiên Khu và Âm Dương Ngư
- Hệ thống kỹ năng khai báo: trigger theo sự kiện, kỹ năng chủ động, chuyển hóa bài, sửa luật
- 16 tướng mẫu (4 mỗi thế lực), bot Quốc Chiến, chơi thử trên terminal, mô phỏng
- 34 test mới, gồm fuzz 300 ván 3–8 người có kiểm tra rò rỉ tướng úp

```bash
npm run play:qc          # chơi Quốc Chiến: bạn + 4 bot
npm run sim:qc -- 300 6  # 300 ván, 6 người
```

`HegemonyGame` kế thừa `Game` và chỉ ghi đè các điểm móc (`cardCountsAs`, `slashLimit`,
`canBeSlashTarget`, `canSave`, `onCardUsedAs`, `beforeDeath`, `useSkillAction`, `checkWinner`, `makeView`).
Luật lõi giai đoạn 1 không bị sửa logic, chỉ thêm điểm móc, nên 25 test cũ vẫn qua.

---

## Giai đoạn 1: Luật lõi

Giai đoạn 1 gồm:

- Bộ bài cơ bản: Sát, Thiểm, Đào (bộ bài tạm 53 lá)
- Vòng lượt 6 giai đoạn: Bắt đầu → Phán định → Bốc bài → Ra bài → Bỏ bài → Kết thúc
- Sát / Thiểm, giới hạn 1 Sát mỗi lượt, khoảng cách và tầm đánh
- Đào hồi máu, hấp hối, cứu bằng Đào, tử trận, điều kiện thắng theo phe
- Event bus làm nền cho hệ thống kỹ năng ở giai đoạn 2
- Hệ thống hỏi–đáp có timeout (sẵn sàng cho server)
- Lọc thông tin ẩn theo từng người chơi
- Bot đơn giản, chơi thử trên terminal, mô phỏng hàng loạt
- 25 test tự động, bao gồm fuzz test 500 ván với bot cố tình gian lận

---

## Cài đặt và chạy

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm test            # chạy toàn bộ test
npm run typecheck   # kiểm tra kiểu TypeScript
npm run play        # chơi thử: bạn + 3 bot, phe Thục vs Ngụy
npm run play -- 7   # chơi với seed cố định (ván giống hệt nhau mỗi lần)
npm run sim -- 1000 # cho bot đánh 1000 ván, thống kê kết quả
```

---

## Cấu trúc thư mục

```
src/
├── core/
│   ├── types.ts    # Kiểu dữ liệu: Card, Player, GameState, Request, Response, Controller
│   ├── cards.ts    # Định nghĩa bộ bài, tên hiển thị
│   ├── rng.ts      # Sinh số ngẫu nhiên có seed
│   ├── events.ts   # Event bus + danh sách sự kiện
│   ├── game.ts     # Trái tim: vòng lượt, dùng bài, sát thương, hấp hối, tử vong
│   └── view.ts     # Lọc thông tin cho từng người chơi
├── agents/bot.ts   # Bot dựa trên luật
├── cli/play.ts     # Chơi trên terminal
├── cli/simulate.ts # Mô phỏng hàng loạt
└── index.ts        # Export công khai
tests/
├── helpers.ts      # Controller theo kịch bản, hàm tạo tình huống
├── rules.test.ts   # Test từng luật
└── fuzz.test.ts    # 500 ván ngẫu nhiên + kiểm tra bất biến
```

---

## Giải thích từng phần

### 1. Mô hình dữ liệu (`types.ts`)

**Mỗi lá bài chỉ được tham chiếu bằng `id`.** Thông tin lá bài (tên, chất, điểm) nằm trong `game.cards`, còn các vùng (tay, chồng bốc, chồng bỏ, vùng xử lý) chỉ chứa mảng `id`. Nhờ vậy, việc di chuyển bài chỉ là chuyển số giữa các mảng.

Có 4 loại vùng (`Zone`): `hand`, `draw`, `discard`, `processing`. Vùng **processing** (vùng xử lý) rất quan trọng: lá đang được dùng sẽ nằm ở đây cho đến khi xử lý xong. Kỹ năng như **Gian Hùng** của Tào Tháo ("nhận lá bài gây sát thương") sẽ lấy lá từ vùng này ở giai đoạn 2.

### 2. Controller: ai đang điều khiển ghế này?

```ts
interface Controller {
  decide(req: Request, view: PlayerView): Promise<Response>;
}
```

Engine không biết và không cần biết người chơi là bot, người gõ phím trên terminal, hay một kết nối WebSocket. Nó chỉ gọi `decide()` và chờ câu trả lời. Có 4 loại câu hỏi:

| Request | Khi nào | Trả lời hợp lệ |
|---|---|---|
| `play` | Giai đoạn ra bài | `useCard` hoặc `endPlay` |
| `respond` | Bị yêu cầu đánh lá (ví dụ Thiểm) | `card` hoặc `pass` |
| `save` | Có người hấp hối | `card` (Đào) hoặc `pass` |
| `discard` | Giai đoạn bỏ bài | `discard` với đúng số lá |

Ở giai đoạn 6, bạn chỉ cần viết thêm một `SocketController` gửi request xuống client qua WebSocket và trả về Promise khi client trả lời. Engine không cần sửa gì.

### 3. Không bao giờ tin người chơi

Mọi câu trả lời đều được **kiểm tra lại** trên engine:

- Dùng bài: `checkUse()` kiểm tra đúng lượt, đúng giai đoạn, lá có trên tay, mục tiêu hợp lệ, trong tầm, chưa hết lượt Sát…
- Đáp lại bằng lá sai loại thì bị coi như không đánh, và lá không bị lấy mất.
- Bỏ bài sai số lượng thì engine tự bỏ thay.
- Controller ném lỗi hoặc treo quá `timeoutMs` thì engine dùng câu trả lời mặc định (`fallback`).
- Gửi nước đi sai 3 lần liên tiếp trong giai đoạn ra bài thì giai đoạn kết thúc.

`fuzz.test.ts` có một `ChaosBot` cố tình gửi rác, ném lỗi, dùng lá không tồn tại… để chứng minh engine không bị phá.

### 4. Di chuyển bài và bất biến "không mất lá nào"

Mọi thay đổi vị trí bài **bắt buộc** đi qua một hàm duy nhất:

```ts
await game.moveCards(ids, from, to, reason);
```

Hàm này ném lỗi nếu lá không nằm ở vùng nguồn, và phát sự kiện `cardsMoved`. Nhờ vậy luôn đảm bảo:

```ts
game.totalCards() === game.cards.size   // tổng số lá không đổi
```

Fuzz test kiểm tra bất biến này **sau mỗi lần di chuyển bài**, qua 500 ván.

### 5. Hỏi–đáp bất đồng bộ: Sát và Thiểm

Một lá Sát không xử lý xong ngay mà phải dừng lại chờ mục tiêu quyết định. Với `async/await`, code đọc gần giống như mô tả luật:

```ts
private async resolveSlash(source, target, card) {
  const ctx = await this.bus.emit('slashTargeted', { source, target, card, cancelled: false });
  if (ctx.cancelled) return;

  const dodge = await this.requestResponse(target, ['shan'], '... dùng Sát vào bạn', source);
  if (dodge) { await this.bus.emit('slashDodged', ...); return; }

  await this.damage({ source, target, amount: 1, card, cancelled: false });
}
```

### 6. Thứ tự sát thương – hấp hối (chi tiết dễ sai)

Theo luật gốc, khi một người mất máu xuống 0, **hấp hối được xử lý trước** các kỹ năng "sau khi chịu sát thương". Ví dụ Tào Tháo còn 1 máu bị Sát: phải hỏi cứu Đào trước, nếu được cứu thì Gian Hùng mới kích hoạt, còn nếu chết thì Gian Hùng không kích hoạt.

```ts
async damage(ctx) {
  await this.bus.emit('beforeDamage', ctx);          // 1. giáp/kỹ năng giảm hoặc chặn
  if (ctx.cancelled || ctx.amount <= 0) return;
  tgt.hp -= ctx.amount;                              // 2. trừ máu
  if (tgt.hp <= 0) await this.enterDying(...);      // 3. hấp hối, có thể chết
  if (tgt.alive) await this.bus.emit('damaged', ctx); // 4. kỹ năng sau sát thương
}
```

Test `event damaged chạy SAU hấp hối và chỉ khi còn sống` khóa chặt thứ tự này.

### 7. Hấp hối

- Hỏi lần lượt từng người còn sống, **bắt đầu từ người đang trong lượt**, theo chiều chỗ ngồi.
- Một người được dùng **nhiều Đào liên tiếp** nếu máu đang âm (ví dụ -1 cần 2 Đào).
- Không ai cứu thì tử trận: toàn bộ bài trên tay vào chồng bỏ, sau đó kiểm tra điều kiện thắng.

### 8. Kết thúc ván bằng exception

Khi có người thắng, ván có thể đang nằm sâu trong chuỗi `useCard → resolveSlash → damage → enterDying → die`. Thay vì kiểm tra cờ ở mọi tầng, engine ném `GameOver` để thoát thẳng ra `run()`. Khối `finally` trong `doUse` vẫn đảm bảo lá đang ở vùng xử lý được đưa về chồng bỏ.

### 9. Lọc thông tin (`view.ts`)

`viewFor(game, seat)` tạo ra `PlayerView` chỉ chứa những gì người đó được thấy:

- Bài trên tay mình: đầy đủ. Bài người khác: **chỉ số lượng**.
- Chồng bốc: chỉ số lượng.
- Phe người khác: ẩn nếu `revealTeams: false` (dùng cho Quốc Chiến).
- `hints`: danh sách lá dùng được và mục tiêu hợp lệ, để UI làm sáng và bot không phải tự viết lại luật.

Bot cũng **chỉ** nhận `PlayerView`, nên bot không thể gian lận.

### 10. Điểm mở rộng cho các giai đoạn sau

Engine đã chừa sẵn chỗ để thêm luật mà không phải sửa lõi:

| Điểm mở rộng | Dùng cho |
|---|---|
| `attackRange(seat)` | Vũ khí (giai đoạn 4) |
| `distance(from, to)` | Ngựa +1/−1 (giai đoạn 4) |
| `slashLimit(seat)` | Bào Hao của Trương Phi, Gia Cát Liên Nỏ |
| `cardCountsAs(seat, card)` | Long Đảm của Triệu Vân (Sát ↔ Thiểm) |
| `checkWinner()` | Điều kiện thắng Quốc Chiến (giai đoạn 2) |
| Sự kiện `phaseBefore` (`skip`) | Lạc Bất Tư Thục, kỹ năng bỏ giai đoạn |
| Sự kiện `drawPhase` (`count`) | Kỹ năng bốc thêm/bớt bài |
| Sự kiện `beforeDamage` (`amount`, `cancelled`) | Giáp, kỹ năng giảm sát thương |
| Sự kiện `slashTargeted` (`cancelled`) | Nhân Vương Thuẫn, kỹ năng miễn Sát |
| Sự kiện `damaged` | Gian Hùng, Phản Quỹ, Cương Liệt |
| Sự kiện `death` | Thưởng/phạt khi giết theo luật Quốc Chiến |

---

## Viết test cho một tình huống luật

```ts
test('Thiểm né được Sát', async () => {
  const { game, ctrls } = makeGame(2);          // ván 2 người, tay trống
  const [sha] = await give(game, 0, 'sha');     // đưa lá Sát cho ghế 0
  const [shan] = await give(game, 1, 'shan');   // đưa lá Thiểm cho ghế 1
  ctrls[1].push({ kind: 'card', cardId: shan }); // kịch bản: ghế 1 sẽ đánh Thiểm
  enterPlay(game, 0);                            // vào giai đoạn ra bài của ghế 0
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).hp, 4);
});
```

Quy tắc: **mỗi khi phát hiện bug luật, viết một test tái hiện nó trước, rồi mới sửa.**

---

## Tiếp theo: Giai đoạn 2

1. Thêm `General` (tướng) với âm dương ngư, thế lực, kỹ năng.
2. Mỗi người chọn 2 tướng cùng thế lực, úp xuống.
3. Cơ chế lật tướng (minh trí), kỹ năng chỉ hiệu lực khi đã lật.
4. Thay `team` cố định bằng thế lực tính từ tướng đã lật, thêm dã tâm gia.
5. Ghi đè `checkWinner()` và thêm thưởng/phạt khi giết qua sự kiện `death`.
6. Bộ quản lý kỹ năng: thu thập trigger theo thứ tự chỗ ngồi, hỏi lật tướng nếu cần.
