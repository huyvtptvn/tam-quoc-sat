# ============================================================
# Chạy server Tam Quốc Sát trong Docker (để đưa lên web).
#   docker build -t tam-quoc-sat .
#   docker run -p 3000:3000 -e ADMIN_TOKEN=doi-ma-nay -v tqs-data:/data tam-quoc-sat
# ============================================================
FROM node:22-alpine
WORKDIR /app

# Cài thư viện trước (tận dụng cache khi chỉ sửa code)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    BOT_DELAY_MS=700
# Tài khoản, lịch sử ván, bảng xếp hạng nằm ở /data: gắn ổ đĩa (volume) để không mất khi cập nhật
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:${PORT}/api/status >/dev/null || exit 1

CMD ["npx", "tsx", "src/server/server.ts"]
