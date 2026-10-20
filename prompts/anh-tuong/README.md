# Prompt ảnh tướng (54 tướng còn thiếu)

## Cấu trúc

```
prompts/anh-tuong/
├── README.md          (file này)
├── TAT-CA.md          tất cả prompt trong một file, để copy nhanh
├── nguy/   14 file   → ảnh lưu vào content/images/generals/nguy/
├── thuc/    9 file   → ảnh lưu vào content/images/generals/thuc/
├── ngo/     9 file   → ảnh lưu vào content/images/generals/ngo/
├── quan/   20 file   → ảnh lưu vào content/images/generals/quan/
└── datam/   2 file   → ảnh lưu vào content/images/generals/datam/
```

Mỗi file `<id>.txt` có: tên tướng, phe, **đường dẫn lưu ảnh**, prompt (tiếng Anh) và negative prompt.

## Cách làm

1. Mở file prompt của tướng, copy phần **PROMPT** dán vào công cụ tạo ảnh (Midjourney, ChatGPT, Gemini, Leonardo, Stable Diffusion...).
   Chọn tỉ lệ **3:4** (Midjourney: thêm `--ar 3:4`). Có ô negative prompt thì dán phần **NEGATIVE**.
2. Tạo vài lần, chọn ảnh ưng nhất. Nên giữ cùng một công cụ/model cho cả bộ để style đều nhau.
3. Lưu ảnh với **tên đúng id** (ví dụ `caoang.png`, chữ thường, không dấu) vào đúng thư mục phe trong `content/images/generals/<phe>/`.
   Nhận PNG / JPG / WEBP, tối đa 3 MB.
4. Push lên git:

```powershell
cd C:\duong-dan\tam-quoc-sat
git pull
git add content/images/generals
git commit -m "Thêm ảnh tướng"
git push
```

Game tự nhận ảnh trong các thư mục con theo phe, không cần sửa code. Có thể push dần từng đợt.

## Lưu ý
- Ảnh ở `content/images/generals/<id>.png` (ngoài thư mục phe) được ưu tiên nếu trùng tên.
- Tướng 2 thế lực (Mạnh Đạt, Trương Lỗ, Văn Khâm, Đường Tư, Sĩ Nhiếp) đã có màu của cả 2 phe trong prompt.
- Các prompt cố ý không nhắc tên game hay họa sĩ nào, để ảnh là của riêng bạn.
