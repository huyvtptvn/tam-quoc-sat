# Hướng dẫn cho người viết kỹ năng tướng (giai đoạn 12)

Dự án: `/home/claude/tqs-engine` — game Tam Quốc Sát Quốc Chiến viết bằng TypeScript (Node 20+, `tsx`).
Mọi chữ hiển thị cho người chơi (tên, mô tả, log `g.say`, câu hỏi) viết **tiếng Việt**.

## Nguồn dữ liệu

`content/import/qsgs-viet.json` — dữ liệu từ bản Việt hóa QSanguosha-Hegemony:
- `generals[]`: `{ id, name, title, pkg, skills: [{ id, name, desc }], status, ours? }`
  - `status`: `có, đang bật` / `có, đang tắt` / `chưa có` / `quân chủ (chưa hỗ trợ)` / `chế độ riêng` / `tướng trống`
  - `ours`: id tướng tương ứng trong game (nếu đã có)
- Mô tả kỹ năng `desc` là **chuẩn** cần làm theo. Thuật ngữ: "chồng tướng" = lật úp tướng (`g.turnOver(seat)`, `player.faceDown`);
  "mở tướng" = lật tướng (`g.reveal(seat, 'main'|'deputy')`); "úp tướng" = `g.hideGeneral`; "loại bỏ tướng" = `g.removeGeneral`;
  "đổi phó tướng" = `g.askTransform(seat, lyDo)` / `g.transformDeputy(seat)`; "Quân lệnh" = `g.drawOrder` + `g.askOrder`;
  "phán xét" = `g.judge` + `g.finishJudge`; "đấu điểm" = `g.pindian`; "thế lực xác định" = đã lật ít nhất 1 tướng;
  "đại/tiểu thế lực" = `g.isBig(seat)` / `g.isSmall(seat)`; "trận pháp/đội hình/vây công" = `g.formation`, `g.besiegers`;
  "Trùng Chú" = bỏ lá vào chồng bỏ rồi bốc 1; "Bỏ qua phòng cụ" = Thanh Công Kiếm (xem `armorOf`).

## Cách viết tướng mới

Tham khảo cách làm sẵn có (đọc trước khi viết):
- `content/scripts/goi-ngo.mjs`, `goi-nguy.mjs`, `goi-thuc.mjs`, `goi-quan.mjs` — kỹ năng viết bằng JavaScript (object `{ skills: [...] }`).
- `content/scripts/lib/tro-giup.mjs` — hàm trợ giúp (`on`, `observe`, `store`, `pickCard`, `takeFrom`, `discardOwn`, `give`, `putEquip`...).
  **KHÔNG sửa file này** (nhiều người dùng chung). Cần hàm riêng thì viết trong file script của bạn.
- `content/generals/goi-tuong-moi.json` — khai báo tướng: `{ "id", "name", "kingdom", "halfHp", "skills": [...], "gender": "female" }`.
  Thế lực: `wei | shu | wu | qun | ye` (`ye` = tướng Dã tâm gia: chỉ làm chủ tướng; lật là thành dã tâm gia).
  `halfHp` = số âm dương ngư (máu tối đa = (cá chủ + cá phó)/2). Ước lượng theo bản Quốc Chiến chính thức nếu không biết
  (ví dụ Max HP 1.5 trong game gốc = 3 cá, 2 = 4 cá).
- `src/hegemony/skills.ts` — kiểu `Skill` (triggers / active / convert / passive fields...). `src/hegemony/game.ts` — `HegemonyGame`.
- `src/core/events.ts` — các sự kiện (`slashTargeted`, `beforeDamage`, `damaged`, `cardUsed`, `phaseStart`, `phaseEnd`, `trickTargeted`,
  `beforeRespond`, `dying`, `death`, `cardsMoved`, `turnStart`, `turnEnd`, `drawPhase`, `slashEnd`, `transferDraw`, `deputyTransformed`...).

Id kỹ năng: dùng id trong `qsgs-viet.json` nếu **chưa bị dùng** trong `SKILLS` (kiểm tra bằng grep trong `src/` và `content/`); trùng thì thêm hậu tố.
Kỹ năng đã có sẵn trong game (ví dụ `guanxing`, `kanpo`, `wushuang`...) thì dùng lại id đó.

Bot: kỹ năng chủ động thêm `bot: { use: 'always'|'never'|'wounded'|'healthy', target: 'enemy'|'ally'|'any' }`;
kỹ năng kích hoạt có thể thêm `bot: { confirm: false }` hoặc hàm. Bot phải chơi được, không treo ván.

## Cơ chế mới đã có trong engine (giai đoạn 12)

- Đại/tiểu thế lực: `g.bigFactions()`, `g.isBig(seat)`, `g.isSmall(seat)`, `g.factionSize(kingdom)`;
  trường kỹ năng `factionSizeBonus(g, owner, kingdom)` để cộng thêm người cho thế lực (Hoằng Pháp).
- Hợp Tung: lá có `card.transferable`; `g.isTransferable(seat, id)`; cờ `player.flags['turn_transfer_<id>'] = 1` gắn dấu Hợp tạm thời;
  sự kiện `transferDraw { seat, drawer, target }` (đổi `ctx.drawer` để người khác bốc thay — Hoằng Viện).
- Chồng bài tướng: `g.generalDeck()`, `g.takeGeneralsFromDeck(n)`, `g.returnGeneralsToDeck(ids)`;
  chồng tướng riêng trên tướng: `g.addGeneralPile(seat, 'Hồn', ids, open?)`, `g.generalPile(seat, 'Hồn')`,
  `g.removeFromGeneralPile(seat, 'Hồn', ids, backToDeck?)`. Giao diện tự hiện.
- Quân chủ: `g.isLord(seat)`, `g.lordOf(kingdom)`. Tướng quân chủ khai báo `"lord": true`, id `lord_<id tướng thường>`.
- Điệu Hổ Ly Sơn: `g.isLured(seat)` (cờ `turn_lured`).
- Vùng `removed` (ngoài ván): `{ kind: 'removed' }`, mảng `g.state.removedPile`.
- Đổi phó tướng: `g.transformCandidates(seat)`, `g.transformDeputy(seat)`, `g.askTransform(seat, lyDo)`.
- `g.grantSkill(seat, id, turnOnly)` / `g.revokeSkill` — trao kỹ năng (Tung Hoành: tự thu hồi bằng listener `turnEnd`).
- `GLOBAL_SKILLS` (trong `src/hegemony/skills.ts`): kỹ năng mọi người đều có.
- Ô bảo vật `treasure`; lá mới: xem `src/core/cards.ts` (`CARD_INFO`).

## Quy tắc làm việc (nhiều người làm song song)

1. Chỉ tạo/sửa **file của nhóm mình** (ghi trong đề bài). Không sửa file của nhóm khác.
2. Nếu thật sự cần thêm điểm móc (hook) vào engine (`src/core/*.ts`, `src/hegemony/game.ts`): thêm **ngắn, chỉ thêm (additive)**,
   không đổi hành vi cũ; đọc lại file ngay trước khi sửa (người khác có thể vừa sửa). Ghi lại thay đổi trong báo cáo.
3. Viết test trong `tests/<nhom>.test.ts` (dùng `tests/hg-helpers.ts`: `makeHG`, `revealAll`, `stackTop`, `YES`, `onlySkill`;
   tests/helpers.ts: `give`). Test nạp nội dung: `before(async () => { await loadContent('content') })` (xem `tests/goi-tuong.test.ts`).
4. Kiểm tra: `npx tsc --noEmit -p .`, `npx tsx --test tests/<nhom>.test.ts`,
   và mô phỏng: `npx tsx src/content/check.ts --games 60 --players 6 --focus <id tướng>` cho vài tướng (không lỗi, không vi phạm bất biến).
   Lỗi typecheck/test ở file của nhóm KHÁC thì bỏ qua (họ đang sửa), chỉ cần phần của bạn đúng.
5. Kỹ năng quá phức tạp thì làm bản đơn giản hóa hợp lý và ghi chú "(đơn giản hóa: ...)" ở cuối `desc`.
   Chỉ khi hoàn toàn không làm được mới để tướng `"disabled": true` kèm `"_lyDo"`.
6. Báo cáo cuối: danh sách tướng đã bật, chỗ đơn giản hóa, tướng còn tắt và lý do, thay đổi engine (nếu có).
