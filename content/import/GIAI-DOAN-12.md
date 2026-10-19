# Giai đoạn 12 — tướng đã thêm, chỗ đơn giản hóa, số liệu ước lượng

Nguồn kỹ năng: `qsgs-viet.json` (từ file Việt hóa bạn gửi). Mỗi chỗ đơn giản hóa cũng được ghi "(đơn giản hóa: …)" cuối mô tả kỹ năng.

## Tướng theo file

| File | Tướng |
|---|---|
| `generals/goi-tuong-moi.json` + `scripts/goi-bo-sung.mjs` | Mã Lương, Đặng Chi, Bành Dạng, Ngô Cảnh, Chu Di, Viên Thuật, Tả Từ (mới), Nam Hoa Lão Tiên, Lữ Linh Khởi, Nễ Hành, Himiko |
| `generals/bat-than.json` + `scripts/goi-bat-than.mjs` | Mạnh Đạt, Đường Tư, Trương Lỗ, Sĩ Nhiếp, Chung Hội*, Đổng Chiêu, Nghiêm Bạch Hổ, Tư Mã Chiêu*, Tôn Sâm*, Văn Khâm, Công Tôn Uyên*, Lưu Ba, Chu Linh, Thôi Diễm & Mao Giới, Lý Phong, Dương Uyển, Tông Dự, Phùng Hy, Dương Hỗ |
| `generals/sp-1.json` + `scripts/goi-sp-1.mjs` | Liêu Hóa, Gia Cát Cẩn, Toàn Tông, Quách Hoài, Dương Tu, Tổ Mậu, Phục Hoàn, Trần Đáo, Điền Dự, Hoa Hùng, Lưu Phu Nhân, Y Tịch |
| `generals/sp-2.json` + `scripts/goi-sp-2.mjs` | Trương Dực, Trình Phổ, Trình Dục, Hạ Hầu Thượng, Cố Ung, Lý Nghiêm, Mã Hưu & Mã Thiết, Tào Ngang, Chu Hoàn, Trần Đăng, Thạch Thao, Tôn Hoàn |
| `generals/han.json` + `scripts/goi-han.mjs` | Lưu Hiệp, Lưu Biện, Trương Nhượng, Hà Tiến, Vương Doãn, Vương Vinh, Phục Hoàng Hậu, Đổng Thừa, Đường Cơ, Thái Ung, Hoàng Phủ Tung, Lưu Hoành; Lãng Khách: Ngô Định*, Triệu Thị Trinh* |
| `generals/quan-chu.json` (kỹ năng trong `src/hegemony/skills.ts`) | Quân chủ Lưu Bị, Trương Giác, Tào Tháo, Tôn Quyền |

`*` = Dã tâm gia (`ye`): chỉ làm chủ tướng; lật ra là thành dã tâm gia.

**Không thêm:** Tả Từ bản cũ (file không có mô tả kỹ năng), Phục Hoàn bản Hán (không có kỹ năng), 20 tướng Thủ Vệ Kiếm Các (chế độ chơi riêng).

## Giả định cần bạn xác nhận

- **Phe Hán** (12 tướng): engine chỉ có Ngụy/Thục/Ngô/Quần/Dã tâm gia, nên tạm xếp vào **Quần**.
- **Máu (âm dương ngư)** của tướng mới là ước lượng theo bản chính thức. Chắc nhất là không chắc: Trần Đăng, Thạch Thao, Điền Dự (để 3 cá cho mọi vị trí).
- **Sửa máu tướng gốc** theo file: Lữ Mông 5→4, Giả Hủ 4→3, Điêu Thuyền 4→3 (trước đây được tăng vì thiếu kỹ năng; nay đủ kỹ năng).
- **Từ Thứ** đổi sang Khiêm Sách + Cử Tiến theo file (bỏ Tru Hại/Phá Trận/Tiến Tài).
- **Lục Long Tham Giá** ♣13 và vị trí các lá để ngoài ván là ước lượng.
- **Thủy Yêm Thất Quân** làm theo bản gốc: mục tiêu phải **có** trang bị.

## Tướng gốc (31) đã sửa theo file

Ngụy: Phản Quỹ, thêm Quỷ Tài/Thiên Khiển, Di Kế, Lỏa Y, Cương Liệt, Tập Kích, Cường Kích, Lạc Thần, Khuynh Quốc.
Thục: Bào Hao, Long Đảm, Võ Thánh, thêm Quan Tinh, Không Thành, Nhân Đức, Mã Thuật, Thiết Kỵ, Liệt Cung, Khiêu Hấn, Khương Duy (Di Chí, Thiên Phúc).
Ngô: Khắc Kỷ, Mưu Đoạn, Khổ Nhục, Anh Tư, Phản Gián, Lục Tốn (Khiêm Tốn + Độ Thế), Hùng Dũng, Ưng Dương, Hồn Thương, Bất Khuất, Phấn Kích.
Quần: Vô Song, Hoa Đà (Trừ Lệ + Cấp Cứu), Kiện Xuất, Giả Hủ (Duy Mạc, Loạn Vũ), Ly Gián, Quỷ Đạo, Lôi Kích (sát thương Lôi), Công Tôn Toản.

73 tướng ở `goi-ngo/nguy/thuc/quan.mjs`: khoảng 75 kỹ năng sửa lại hành vi theo file, phần còn lại chỉ đổi chữ mô tả.

## Đơn giản hóa chính

- Nạp Man, Kháng Nhuệ, Hư Thực: chỉ tác dụng với Sát và cẩm nang chọn mục tiêu trực tiếp.
- Thao Loạn, Bác Thông: chỉ dùng chủ động trong giai đoạn ra bài (không dùng để đáp).
- Phong Dương, Vãn Nguy: chỉ chặn khi lấy bài qua cơ chế chung (Quá Hà, Thuận Thủ, Hàn Băng…).
- Các chồng bài [Hàm] [Mễ] [Quyền] [Dị] [Lương] [Kim] [Thưởng] [Ngự]: nằm trong vùng "trên tướng"; số đếm hiện trong nhật ký.
- Túc Trí: phần "cẩm nang không giới hạn khoảng cách" chưa làm.
- Kê Lặc: chỉ cấm khi bỏ bài bắt buộc (giai đoạn bỏ bài…), không cấm khi trả giá kỹ năng.
- Chế Hành (quân chủ Tôn Quyền): chỉ bỏ bài trên tay.
- Khiêm Tốn, Duy Mạc: hủy hiệu quả lá thay vì cấm chọn làm mục tiêu (lá vẫn mất).
- Bot không dùng: Hợp Tung, Thao Loạn, Quỷ Tài, Quỷ Đạo, Thân Trùng, Mễ Đạo, Chiêu Tâm, Phụng Nghênh.
