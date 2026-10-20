# Hình ảnh lá bài và tướng

Đặt ảnh vào đây (hoặc tải lên ở trang quản trị → mục **Hình ảnh**). Tên file = id lá bài / id tướng.

```
images/
├── cards/
│   ├── sha.png            Sát
│   ├── sha_fire.png       (tùy chọn) Hỏa Sát — không có thì dùng sha.png
│   ├── sha_thunder.png    (tùy chọn) Lôi Sát
│   ├── tao.webp           Đào
│   ├── binh_phap.jpg      lá bài thêm trong content/cards
│   └── back.png           (tùy chọn) mặt sau lá bài
└── generals/
    ├── caocao.jpg         id tướng (xem danh sách ở trang quản trị)
    ├── chen_gong.png
    └── nguy/ thuc/ ngo/ quan/ datam/   (tùy chọn) chia thư mục con theo phe, ví dụ nguy/caoang.png
```

- Định dạng: PNG, JPG, WEBP, GIF. Tối đa 3 MB. Không nhận SVG.
- Tỉ lệ đẹp nhất: lá bài **5:7** (ví dụ 500×700), tướng **3:4** (ví dụ 600×800). Ảnh được cắt vừa khung (phần giữa).
- Ảnh lá bài chỉ là phần **tranh minh họa**: khung, chất/điểm, tên bài, mô tả do game tự vẽ lên trên.
- Không có ảnh thì game tự vẽ mặt bài / chân dung mặc định.
- Đổi ảnh không cần khởi động lại server; người chơi tải lại trang là thấy.
- Chỉ dùng ảnh bạn có quyền sử dụng.
