# Thư mục nội dung — "khu vực thêm bài"

Mọi thứ bạn muốn thêm/sửa mà **không đụng code** đều nằm ở đây:

```
content/
├── skills/*.json      kỹ năng (KHI … NẾU … THÌ …)
├── generals/*.json    tướng mới, chỉnh/tắt tướng có sẵn, cặp tướng
├── cards/*.json       lá bài mới: cẩm nang, cẩm nang trì hoãn, trang bị
├── deck.json          thêm/bớt lá trong bộ bài
├── scripts/*.mjs      (nâng cao) kỹ năng viết bằng JavaScript
└── HUONG-DAN-KY-NANG.md   hướng dẫn chi tiết + công thức mẫu
```

## 5 bước thêm một tướng mới

1. Viết kỹ năng vào `skills/<ten-file>.json` (mẫu: `skills/vi-du.json`).
2. Viết tướng vào `generals/<ten-file>.json`, liệt kê id kỹ năng (mẫu: `generals/vi-du.json`).
3. Kiểm tra: `npm run content:check` (hoặc nút **Kiểm tra** trên `/admin.html`).
4. Thử cân bằng: `npm run content:check -- --games 300 --focus <id_tuong>`.
5. Nếu server đang chạy: lưu file là xong, server tự nạp lại.

## Ví dụ nhanh: "mất máu thì bốc bài"

```json
{
  "id": "tri_luc",
  "name": "Trí Lực",
  "desc": "Sau khi bạn chịu sát thương, bạn có thể bốc số lá bằng sát thương.",
  "type": "trigger",
  "event": "damaged",
  "role": "target",
  "actions": [ { "do": "draw", "count": "amount" } ]
}
```

Đọc tiếp: **HUONG-DAN-KY-NANG.md** (bảng sự kiện, hành động, biến, công thức mẫu, cách đọc lỗi).
