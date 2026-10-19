# Bộ bài

Khi tạo phòng, chọn ô **Bộ bài**:

| id | Tên | Số lá | Ghi chú |
|---|---|---|---|
| `quocchien` | Quốc Chiến đầy đủ | 169 (5 lá để ngoài ván: Chiếu Thư + 4 cẩm nang thế lực) | Mặc định. Gốc 108 + Thế Bị + Quân Lệnh. 13 lá có dấu Hợp |
| `quocchien_coban` | Quốc Chiến cơ bản | 108 | Chỉ bộ gốc |
| `quantranh` | Quân Tranh | 160 | Theo bảng chất/điểm trên wiki. Không có cẩm nang riêng của Quốc Chiến |
| `ungbien` | Ứng Biến | 143 | Bảng 161 lá, bỏ 18 lá chưa dùng (xem dưới). Không có hiệu ứng "ứng biến" |

## Bộ Ứng Biến

Theo bảng chất/điểm bạn gửi. Đã bỏ 18 lá: Thái Công Âm Phù, Tùy Cơ Ứng Biến, Trục Cận Khí Viễn ×4, Xuất Kỳ Bất Ý ×2,
Động Chúc Tiên Cơ ×4, Hộ Tâm Kính, Hắc Quang Khải, Thiên Cơ Đồ, Đồng Tước, Ngũ Hành Hạc Linh Phiến, Ô Thiết Tỏa Liên.

- Các dòng "Phú Giáp / Không Sào / Tàn Khu / Trợ Chiến => …" (hiệu ứng ứng biến) không áp dụng.
- Băng Sát ×5 tính là Sát thường. Bát Quái Đồ = Bát Quái Trận.
- Có Thủy Yêm Thất Quân ×2 (♠3, ♠4) và Mộc Ngưu Lưu Mã (♦5).

`content/deck.json` chỉ sửa bộ **Quốc Chiến**. Bộ Quân Tranh sửa trực tiếp trong `src/core/cards.ts` (`QUANTRANH_DECK`).

## Các lá mới của bộ Quân Tranh

| Lá | Loại | Hiệu ứng trong game |
|---|---|---|
| Thư Hùng Song Cổ Kiếm `cixiong` | Vũ khí, tầm 2 | Sát nhắm vào người khác giới: có thể bắt họ chọn bỏ 1 lá trên tay, hoặc để bạn bốc 1 lá |
| Trượng Bát Xà Mâu `zhangba` | Vũ khí, tầm 3 | Dùng hoặc đánh 2 lá trên tay như 1 Sát. Lúc ra bài: nút kỹ năng "Trượng Bát Xà Mâu". Lúc bị đòi Sát (Nam Man, Quyết Đấu): bỏ qua lá Sát thì game hỏi có ghép 2 lá không |
| Chu Tước Vũ Phiến `zhuque` | Vũ khí, tầm 4 | Sát thường có thể đổi thành Hỏa Sát |
| Hoa Lưu `hualiu` | Ngựa +1 | Người khác tính khoảng cách đến bạn +1 |
| Tá Đao Sát Nhân `jiedao` | Cẩm nang | Chọn người có vũ khí, rồi chọn người trong tầm đánh của họ: họ phải dùng Sát vào người đó, nếu không thì giao vũ khí cho bạn |
| Ngũ Cốc Phong Đăng `wugu` | Cẩm nang | Lật số lá bằng số người còn sống, mỗi người (bắt đầu từ bạn) lấy 1 lá |

Hai điểm đơn giản hóa:

- Tá Đao Sát Nhân: người thứ hai được chọn **sau** khi không ai Vô Giải (luật gốc chọn ngay lúc dùng).
- Trượng Bát Xà Mâu ghép 2 lá khác màu: luật gốc là "không màu"; game coi như đỏ (Nhân Vương Thuẫn không chặn).

## Ô bảo vật và các lá thêm vào bộ Quốc Chiến

Mỗi người có thêm ô trang bị thứ 5: **Bảo vật**. Lắp bảo vật mới thì bảo vật cũ vào chồng bỏ (như vũ khí).

| Lá | Chất/điểm | Hiệu ứng trong game |
|---|---|---|
| Ngọc Tỷ `yuxi` | ♣A | Khi đã lật ít nhất một tướng: bốc thêm 1 lá ở giai đoạn bốc bài; đầu giai đoạn ra bài coi như dùng Tri Kỷ Tri Bỉ |
| Mộc Ngưu Lưu Mã `muniu` | ♦5 | Mỗi giai đoạn ra bài 1 lần: cất 1 lá trên tay xuống dưới (tối đa 5), rồi có thể chuyển Mộc Ngưu sang ô bảo vật trống của người khác (lá đi theo). Lá bên dưới dùng/đánh như bài trên tay |
| Định Lan Dạ Minh Châu `mingzhu` | ♦6 (chưa chắc) | Coi như có Chế Hoành; nếu tướng đã có Chế Hoành thì Chế Hoành không giới hạn số lá |
| Thủy Yêm Thất Quân `shuiyan` | ♥K, ♣Q | Dùng với người khác **đang có trang bị**: họ chọn bỏ hết trang bị, hoặc chịu 1 sát thương lôi |

Chất/điểm lấy theo bộ Thế Bị của Quốc Chiến (mã nguồn QSanguosha-For-Hegemony). Định Lan Dạ Minh Châu vốn là lá riêng của Tôn Quyền (quân chủ), không có trong bộ đó, nên ♦6 là tạm đặt.

Chỗ đơn giản hóa:

- **Ngọc Tỷ:** game chưa có luật "thế lực lớn" nên phần "thế lực của bạn là thế lực lớn duy nhất" chưa áp dụng.
- **Mộc Ngưu:** lá bên dưới được lấy lên tay ngay trước khi dùng. Lúc ra bài bấm nút "Mộc Ngưu: lấy bài"; khi bị đòi đánh lá (Thiểm, Sát...) hoặc có người hấp hối, game hỏi có lấy lá phù hợp không.
- **Chế Hoành** (Tôn Quyền) nay theo đúng luật Quốc Chiến: bỏ tối đa số lá bằng máu tối đa.

Tướng có kỹ năng đụng tới ô trang bị đều tính cả ô bảo vật: Phan Phụng (Cuồng Phủ lấy được bảo vật), Lã Phạm (Điều Độ),
Lăng Thống (Toàn Lược, Dũng Tiến), Ngô Quốc Thái (Cam Lộ), Nhị Trương (Trực Gián), Tôn Thượng Hương (Kiêu Cơ), Tôn Quyền (Chế Hoành + Minh Châu).
Lá Quá Hà / Thuận Thủ / Hàn Băng Kiếm cũng chọn được bảo vật.

## Tên trên wiki → id trong game

Phá Thạch Phủ = Quán Thạch Phủ `guanshi` · Bát Quái Đồ = Bát Quái Trận `bagua` · Đích Lô = `dilu` · Tử Tuynh = Tử Tinh `zixing` · Cổ Đỉnh Đao = `guding` ·
Gia Cát Liên Nỏ = `zhuge` · Thiểm Điện = `shandian` · Hỏa Sát / Lôi Sát = `sha` có `fire` / `thunder`.

## Thêm một bộ bài mới

Trong `src/core/cards.ts`:

```ts
export const BO_CUA_TOI: DeckEntry[] = [
  ['sha', 'S7 S8 C2'],          // chất + điểm: S H C D, A = 1, J/Q/K = 11/12/13
  ['sha', 'H4 D4', 'fire'],     // Hỏa Sát
  ['shan', 'H2 D2'],
];
export const DECKS = {
  ...
  cuatoi: { id: 'cuatoi', label: 'Bộ của tôi', desc: 'Mô tả ngắn', entries: BO_CUA_TOI },
};
```

Khởi động lại server là ô chọn bộ bài tự có thêm dòng mới.
