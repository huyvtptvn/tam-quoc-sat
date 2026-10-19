# Hướng dẫn cấu hình kỹ năng, tướng và lá bài

Mọi nội dung trong thư mục `content/` được server nạp **không cần sửa code engine, không cần khởi động lại server**.
Bạn có thể sửa file trực tiếp (server tự phát hiện) hoặc dùng trang quản trị `http://<server>/admin.html`.

---

## 1. Ý tưởng: KHI – NẾU – THÌ

Mỗi kỹ năng kích hoạt được viết theo đúng câu tiếng Việt:

> **KHI** bạn chịu sát thương, **NẾU** bạn còn không quá 2 máu, **THÌ** bạn bốc 2 lá.

```json
{
  "id": "ten_ky_nang",
  "name": "Tên Kỹ Năng",
  "desc": "Sau khi bạn chịu sát thương, nếu bạn còn không quá 2 máu, bạn có thể bốc 2 lá.",
  "type": "trigger",
  "event": "damaged",          ← KHI: chịu sát thương
  "role": "target",            ← ... và người chịu là BẠN
  "if": "self.hp <= 2",        ← NẾU
  "actions": [                 ← THÌ
    { "do": "draw", "count": "2" }
  ]
}
```

## 2. Ba nhóm kỹ năng

| Nhóm | `"type"` | Khi nào chạy | Ví dụ |
|---|---|---|---|
| **Kích hoạt** | `"trigger"` | Tự xảy ra khi có sự kiện | Gian Hùng, Phản Quỹ, Cương Liệt, "mất máu thì bốc bài" |
| **Chủ động** | `"active"` | Người chơi bấm dùng trong giai đoạn ra bài | Khổ Nhục, Chế Hoành, Thanh Nang |
| **Bị động** | `"passive"` | Luôn có hiệu lực (sửa luật) | Mã Thuật, Bào Hao, Võ Thánh, Không Thành |

Mọi kỹ năng chỉ có hiệu lực khi tướng **đã lật**. Với kỹ năng kích hoạt/chủ động của tướng đang úp, engine tự hỏi người chơi có muốn lật tướng để dùng không (đúng luật Quốc Chiến).

---

## 3. Quy trình thêm một tướng mới (5 bước)

1. **Viết kỹ năng** vào `content/skills/<tên>.json`.
2. **Viết tướng** vào `content/generals/<tên>.json`, liệt kê id kỹ năng.
3. **Kiểm tra**: trang quản trị → nút *Kiểm tra*, hoặc chạy `npm run content:check`.
4. **Mô phỏng**: trang quản trị → *Thử tướng* = tướng mới → *Chạy mô phỏng*. Xem tỉ lệ thắng (khoảng 25–40% là hợp lý ở bàn 6 người) và có ván nào bị lỗi không.
5. **Lưu**: bấm *Lưu & áp dụng*. Ván mới sẽ có tướng này. Nếu đang có người chơi, nội dung được áp dụng khi các ván đó kết thúc.

> File có lỗi sẽ **không bao giờ** được áp dụng. Server giữ nguyên nội dung cũ và báo lỗi kèm vị trí.

### Cấu trúc thư mục

```
content/
├── skills/*.json      kỹ năng (mỗi file: 1 object hoặc một danh sách [ ... ])
├── generals/*.json    tướng mới, hoặc chỉnh tướng có sẵn
├── cards/*.json       lá bài mới: cẩm nang, cẩm nang trì hoãn, trang bị
├── deck.json          đưa lá bài mới vào bộ bài / bớt lá
├── scripts/*.mjs      (nâng cao) kỹ năng viết bằng JavaScript
└── HUONG-DAN-KY-NANG.md   file này
```

**Ghi chú trong JSON:** JSON không có comment, nên mọi trường bắt đầu bằng `_` (ví dụ `"_ghiChu": "..."`) đều bị bỏ qua. Hãy dùng chúng để ghi chú.

**Quy tắc đặt `id`:** chữ thường không dấu, số và `_`. Ví dụ `phan_hoi`, `tran_cung`. `id` là thứ engine dùng; `name` là tên hiển thị tiếng Việt.

---

## 4. Nhóm 1 – Kỹ năng kích hoạt (`"type": "trigger"`)

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `event` | ✓ | Sự kiện kích hoạt (xem mục 8) |
| `role` | | Bạn phải là ai trong sự kiện. Ví dụ `"target"` = bạn là người chịu sát thương. Thực chất là viết tắt của `"if": "target == self"` |
| `if` | | Điều kiện thêm (biểu thức, mục 7) |
| `optional` | | `true` (mặc định): hỏi người chơi có dùng không. `false`: **tỏa định**, tự chạy |
| `limit` | | `{ "perTurn": 1 }` mỗi lượt tối đa 1 lần; `{ "perGame": 1 }` cả ván 1 lần (kỹ năng hạn định) |
| `actions` | ✓ | Danh sách hành động (mục 9) |
| `position` | | `"main"`: chỉ khi là chủ tướng. `"deputy"`: chỉ khi là phó tướng |
| `bot` | | `{ "confirm": false }` để bot không bao giờ kích hoạt |

**Ví dụ – "mất máu thì bốc bài":**

```json
{
  "id": "phan_hoi",
  "name": "Phản Hồi",
  "desc": "Sau khi bạn chịu sát thương, bạn có thể bốc số lá bằng số sát thương.",
  "type": "trigger",
  "event": "damaged",
  "role": "target",
  "actions": [ { "do": "draw", "count": "amount" } ]
}
```

**Ví dụ – sửa sự kiện (giảm sát thương), tỏa định:**

```json
{
  "id": "kien_thu",
  "name": "Kiên Thủ",
  "desc": "Tỏa định. Khi bạn chịu sát thương lớn hơn 1 và còn không quá 2 máu, sát thương giảm 1.",
  "type": "trigger",
  "event": "beforeDamage",
  "role": "target",
  "optional": false,
  "if": "amount > 1 and self.hp <= 2",
  "actions": [ { "do": "modifyDamage", "add": "-1" } ]
}
```

> Chỉ những sự kiện có cột "Sửa được" trong mục 8 mới dùng được các hành động sửa sự kiện như `modifyDamage`, `cancel`, `noDodge`...

---

## 5. Nhóm 2 – Kỹ năng chủ động (`"type": "active"`)

| Trường | Ý nghĩa |
|---|---|
| `cards` | Số lá phải chọn: `{ "min": 1, "max": 1, "filter": "card.color == 'red'" }`. Bỏ trống nếu không cần chọn lá |
| `target` | Cần chọn 1 mục tiêu: `{ "filter": "t != self and inRange(self, t)" }`. Bỏ trống nếu không cần |
| `cost` | Làm gì với lá đã chọn: `"discard"` (bỏ, mặc định khi có chọn lá), `"give"` (đưa cho mục tiêu), `"none"` (giữ lại) |
| `if` | Điều kiện được dùng, ví dụ `"self.hp > 1"` |
| `limit` | `{ "perTurn": 1 }`: mỗi lượt 1 lần |
| `actions` | Hành động. Dùng được biến `target` (mục tiêu đã chọn) và `cards` (`cards.count` = số lá đã chọn) |
| `bot` | Cách bot dùng: `{ "use": "always" \| "never" \| "wounded" \| "healthy", "target": "enemy" \| "ally" \| "any" }`. Không ghi thì bot không dùng |

Trong `cards.filter` dùng biến `card`: `card.color` (`'red'`/`'black'`), `card.suit` (`'spade'`, `'heart'`, `'club'`, `'diamond'`), `card.rank` (1–13), `card.name` (`'sha'`, `'shan'`, `'tao'`...), `card.type` (`'basic'`, `'trick'`, `'delayed'`, `'equip'`).
Trong `target.filter` dùng biến `t` (người đang xét).

```json
{
  "id": "tran_tinh",
  "name": "Trần Tình",
  "desc": "Mỗi lượt một lần, bạn có thể bỏ 1 lá đỏ để gây 1 sát thương cho một người trong tầm đánh.",
  "type": "active",
  "cards": { "min": 1, "max": 1, "filter": "card.color == 'red'" },
  "target": { "filter": "t != self and inRange(self, t)" },
  "cost": "discard",
  "limit": { "perTurn": 1 },
  "bot": { "use": "always", "target": "enemy" },
  "actions": [ { "do": "damage", "who": "target", "count": "1" } ]
}
```

---

## 6. Nhóm 3 – Kỹ năng bị động (`"type": "passive"`)

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| `attackRange` | Cộng thêm tầm đánh (biểu thức) | `"1"`, `"self.hp > 2 ? 1 : 0"` |
| `distanceFromOthers` | Người khác tính khoảng cách đến bạn cộng thêm | `"1"` |
| `handLimit` | Cộng thêm giới hạn bài trên tay | `"self.lostHp"` |
| `slashLimit` | Số lần dùng Sát mỗi lượt (số ≥ 1 hoặc `"inf"`) | `2`, `"inf"` |
| `convert` | Dùng lá này như lá khác | `[{ "from": "card.color == 'red'", "as": "sha" }]` |
| `cannotBeTargetOfSha` | Không thể bị chọn làm mục tiêu của Sát / Quyết Đấu khi điều kiện đúng | `"self.hand == 0"` |
| `cannotTarget` | Bạn không thể chọn `t` làm mục tiêu khi điều kiện đúng | `"t.hp > self.hp"` |

`convert` có thể thêm `"if"` để chỉ chuyển hóa trong điều kiện nhất định, ví dụ chỉ ngoài lượt của bạn:

```json
{ "from": "card.color == 'red'", "as": "tao", "if": "turnOwner != self" }
```

Các giá trị `as` hay dùng: `sha` (Sát), `shan` (Thiểm), `tao` (Đào), `jiu` (Rượu), `wuxie` (Vô Giải Khả Kích).

---

## 7. Biểu thức

Dùng trong `if`, `count`, `who`, `filter`... Viết như công thức đơn giản:

| Loại | Cú pháp |
|---|---|
| Số học | `+ - * / %` (chia lấy phần nguyên) |
| So sánh | `== != > < >= <=` |
| Logic | `and or not` (hoặc `&& \|\| !`) |
| Chọn giá trị | `điều_kiện ? a : b` |
| Chuỗi | trong nháy đơn: `'red'`, `'sha'` |
| Hàm | `min(a,b)` `max(a,b)` `abs(x)` `floor(x)` `distance(a,b)` `inRange(a,b)` `sameFaction(a,b)` `differentFaction(a,b)` `random(n)` |

**Biến luôn có:** `self` (bạn), `turnOwner` (người đang trong lượt), `aliveCount`, `turn`, `revealedFactions`.

**Thuộc tính người chơi** (viết sau tên biến chỉ người, ví dụ `target.hp`, `self.hand`):

| Thuộc tính | Ý nghĩa |
|---|---|
| `hp`, `maxHp`, `lostHp` | Máu hiện tại / tối đa / đã mất |
| `hand` | Số bài trên tay |
| `cards` | Số bài trên tay + trang bị |
| `equips`, `judges` | Số trang bị / số lá trong khu vực phán định |
| `alive`, `chained`, `revealed`, `isTurnOwner` | Đúng/sai |
| `kingdom` | `'wei'` `'shu'` `'wu'` `'qun'` `'careerist'` `'unknown'` |
| `weapon`, `armor` | Tên trang bị (ví dụ `'zhuge'`), `''` nếu không có |
| `range` | Tầm đánh |
| `flags.ten` | Cờ do kỹ năng đặt (hành động `setFlag`), tự xóa đầu lượt người đó |
| `name`, `seat` | Tên, số ghế |

**Ví dụ:**

```
target == self and self.hp <= 2
amount * 2
min(3, self.lostHp + 1)
byCard == 'sha' and target.alive
card.color == 'red' and turnOwner != self
self.flags.daDung < 1
inRange(self, t) and t.hand > self.hand
```

---

## 8. Danh mục sự kiện (`"event"`)

| Sự kiện | Khi nào | Biến | Sửa được |
|---|---|---|---|
| `damaged` | Sau khi chịu sát thương (còn sống) | `source` `target` `amount` `nature` `card` `byCard` | |
| `beforeDamage` | Ngay trước khi tính sát thương | như trên | `modifyDamage` `setDamage` `cancel` |
| `hpLost` | Sau khi mất máu (không phải sát thương) | `who` `amount` | |
| `recovered` | Sau khi hồi máu | `who` `amount` `source` | |
| `cardUsed` | Khi dùng một lá bài | `user` `card` `target` `targetCount` | |
| `cardResponded` | Khi đánh ra lá đáp lại (Thiểm, Sát khi bị Nam Man...) | `responder` `card` | |
| `slashTargeted` | Khi Sát chọn mục tiêu | `source` `target` `card` | `noDodge` `needShan` `cancel` |
| `slashDodged` | Khi Sát bị né | `source` `target` `card` | |
| `turnStart` / `turnEnd` | Đầu / cuối lượt | `current` | |
| `phaseBefore` | Trước một giai đoạn | `current` `phase` | `skipPhase` |
| `phaseStart` / `phaseEnd` | Khi giai đoạn bắt đầu / kết thúc | `current` `phase` | |
| `drawPhase` | Giai đoạn bốc bài | `current` `count` | `drawCount` |
| `dying` | Khi rơi vào hấp hối | `dying` `source` | |
| `death` | Khi tử trận | `victim` `killer` | |
| `handEmptied` | Khi mất lá cuối cùng trên tay | `owner` | |
| `cardsLeftHand` | Khi bài rời khỏi tay | `owner` `count` `reason` | |
| `duelStarted` | Khi Quyết Đấu bắt đầu | `user` `target` | `needSha` |
| `judged` | Khi lật lá phán định | `who` `judge` `reason` | |
| `generalRevealed` | Khi lật tướng | `who` `first` | |

`phase` nhận: `'start'` (bắt đầu), `'judge'` (phán định), `'draw'` (bốc bài), `'play'` (ra bài), `'discard'` (bỏ bài), `'end'` (kết thúc).
`byCard` (ở sự kiện sát thương) là loại lá gây ra sát thương: `'sha'`, `'juedou'`, `'nanman'`, `'wanjian'`, `'huogong'`... hoặc `''`.

> Danh sách đầy đủ, luôn đúng với phiên bản server đang chạy, có ở tab **Tra cứu → Sự kiện** trên trang quản trị.

---

## 9. Danh mục hành động (`"actions"`)

Mỗi hành động có dạng `{ "do": "tên", ...tham số }`. Hành động nào cũng nhận thêm `"if"` để chỉ chạy khi điều kiện đúng.
Tham số chỉ người (`who`, `from`, `to`, `by`) là biểu thức: `"self"`, `"target"`, `"source"`, `"chosen"`...

| Hành động | Tham số | Ý nghĩa |
|---|---|---|
| `draw` | `who`, `count` | Bốc bài |
| `discard` | `who`, `count` | Bắt người đó tự chọn bỏ bài trên tay |
| `discardRandom` | `from`, `count` | Bỏ ngẫu nhiên bài trên tay của người đó |
| `takeRandom` | `from`, `to`, `count` | Lấy ngẫu nhiên bài trên tay |
| `takeCard` | `from`, `to` | Chọn 1 lá (trang bị chọn đích danh, bài tay ngẫu nhiên) lấy về |
| `discardCard` | `from`, `by` | Chọn 1 lá (kể cả phán định) để bỏ |
| `give` | `from`, `to`, `count` | Người `from` chọn bài đưa cho `to` |
| `recover` | `who`, `count` | Hồi máu |
| `loseHp` | `who`, `count` | Mất máu (không phải sát thương) |
| `damage` | `who`*, `count`, `source`, `nature` | Gây sát thương. `source: "null"` = không nguồn; `nature`: `normal`/`fire`/`thunder` |
| `chain` | `who`, `value` | Xích / gỡ xích |
| `judge` | `who`, `success`*, `then`, `else` | Phán định |
| `choose` | `who`, `prompt`, `options`* | Chọn 1 trong các phương án |
| `chooseTarget` | `who`, `prompt`, `filter`, `min`, `max`, `as`, `then`* | Chọn mục tiêu rồi làm gì đó với từng người |
| `if` | `cond`*, `then`, `else` | Rẽ nhánh |
| `setFlag` / `addFlag` | `who`, `name`*, `value` | Đặt / cộng cờ |
| `say` | `text`* | Ghi nhật ký, chèn biểu thức trong `{ }` |
| `stop` | | Dừng, bỏ các hành động phía sau |
| **Sửa sự kiện** | | |
| `modifyDamage` | `add`* | Cộng (hoặc trừ) sát thương |
| `setDamage` | `value`* | Đặt sát thương |
| `cancel` | | Chặn sự kiện |
| `noDodge` | | Sát không thể né |
| `needShan` | `count` | Phải đánh nhiều Thiểm |
| `skipPhase` | | Bỏ qua giai đoạn |
| `drawCount` | `add`* | Đổi số lá bốc |
| `needSha` | `who`*, `count` | Quyết Đấu: phải đánh nhiều Sát |

(`*` = bắt buộc. `count` mặc định 1, `who` mặc định `self`.)

### Phán định

```json
{
  "do": "judge",
  "success": "judge.color == 'red'",
  "then": [ { "do": "draw", "count": "2" } ],
  "else": [ { "do": "say", "text": "Phán định thất bại." } ]
}
```

Trong `success`/`then`/`else` dùng biến `judge`: `judge.color`, `judge.suit`, `judge.rank`, `judge.name`.

### Lựa chọn

```json
{
  "do": "choose",
  "who": "source",
  "prompt": "Bạn chọn",
  "options": [
    { "label": "Bỏ 2 lá", "if": "source.hand >= 2", "actions": [ { "do": "discard", "who": "source", "count": "2" } ] },
    { "label": "Chịu 1 sát thương", "actions": [ { "do": "damage", "who": "source", "source": "self" } ] }
  ]
}
```

Phương án có `"if"` sai sẽ bị ẩn. Nếu chỉ còn 1 phương án, engine tự chọn luôn.

### Chọn mục tiêu

```json
{
  "do": "chooseTarget",
  "prompt": "Chọn tối đa 2 người để mỗi người bốc 1 lá",
  "filter": "t != self and t.hand < 3",
  "min": "0",
  "max": "2",
  "as": "ban",
  "then": [ { "do": "draw", "who": "ban", "count": "1" } ]
}
```

---

## 10. Công thức thường gặp

**Mất máu thì bốc bài** (sát thương hoặc mất máu đều tính):

```json
[
  { "id": "a1", "name": "A", "type": "trigger", "event": "damaged", "role": "target", "actions": [ { "do": "draw", "count": "amount" } ] },
  { "id": "a2", "name": "A", "type": "trigger", "event": "hpLost", "role": "who", "actions": [ { "do": "draw", "count": "amount" } ] }
]
```

**Gây sát thương thì hồi máu (hút máu):**

```json
{ "id": "hut_mau", "name": "Hút Máu", "type": "trigger", "event": "damaged", "role": "source", "optional": false,
  "if": "self.lostHp > 0", "actions": [ { "do": "recover", "count": "1" } ] }
```

**Đầu lượt, ít bài thì bốc thêm:**

```json
{ "id": "chuan_bi", "name": "Chuẩn Bị", "type": "trigger", "event": "phaseStart", "role": "current",
  "if": "phase == 'start' and self.hand < 2", "actions": [ { "do": "draw", "count": "2 - self.hand" } ] }
```

**Bốc thêm 1 lá ở giai đoạn bốc bài:**

```json
{ "id": "anh_tu2", "name": "Anh Tư", "type": "trigger", "event": "drawPhase", "role": "current",
  "actions": [ { "do": "drawCount", "add": "1" } ] }
```

**Sát của bạn không thể né khi mục tiêu ít bài:**

```json
{ "id": "xuyen_giap", "name": "Xuyên Giáp", "type": "trigger", "event": "slashTargeted", "role": "source",
  "if": "target.hand <= 1", "actions": [ { "do": "noDodge" } ] }
```

**Sát của bạn gây thêm sát thương khi mục tiêu đã mất máu:**

```json
{ "id": "truy_kich", "name": "Truy Kích", "type": "trigger", "event": "beforeDamage", "role": "source", "optional": false,
  "if": "byCard == 'sha' and target.lostHp > 0", "actions": [ { "do": "modifyDamage", "add": "1" } ] }
```

**Không bỏ bài nếu không dùng Sát trong lượt** (dùng cờ):

```json
[
  { "id": "nhan_nai_dau", "name": "Nhẫn Nại", "type": "trigger", "event": "cardUsed", "role": "user", "optional": false,
    "if": "card.name == 'sha'", "actions": [ { "do": "setFlag", "name": "daSat" } ] },
  { "id": "nhan_nai", "name": "Nhẫn Nại", "type": "trigger", "event": "phaseBefore", "role": "current",
    "if": "phase == 'discard' and self.flags.daSat != 1", "actions": [ { "do": "skipPhase" } ] }
]
```

**Mỗi lượt 1 lần: khi bị Sát, có thể bỏ 1 lá để Sát vô hiệu:**

```json
{ "id": "ne_tranh", "name": "Né Tránh", "type": "trigger", "event": "slashTargeted", "role": "target",
  "if": "self.hand > 0", "limit": { "perTurn": 1 },
  "actions": [ { "do": "discard", "count": "1" }, { "do": "cancel" } ] }
```

**Khi chết, kẻ giết bạn mất 2 máu:**

```json
{ "id": "bao_thu", "name": "Báo Thù", "type": "trigger", "event": "death", "role": "victim", "optional": false,
  "if": "killer != null", "actions": [ { "do": "loseHp", "who": "killer", "count": "2" } ] }
```

> Sự kiện `death` xảy ra khi bạn đã chết, nên kỹ năng dạng này cần thêm hỗ trợ từ engine. Hiện tại engine chỉ chạy kỹ năng của người còn sống. Xem mục 14.

**Hết bài thì bốc 1 lá (Liên Doanh):**

```json
{ "id": "lien_doanh2", "name": "Liên Doanh", "type": "trigger", "event": "handEmptied", "role": "owner",
  "actions": [ { "do": "draw" } ] }
```

**Lá đỏ dùng như Đào ngoài lượt của bạn (Cấp Cứu):**

```json
{ "id": "cap_cuu2", "name": "Cấp Cứu", "type": "passive",
  "convert": [ { "from": "card.color == 'red'", "as": "tao", "if": "turnOwner != self" } ] }
```

**Hết bài thì không thể bị Sát (Không Thành):**

```json
{ "id": "khong_thanh2", "name": "Không Thành", "type": "passive", "cannotBeTargetOfSha": "self.hand == 0" }
```

**Kỹ năng hạn định (cả ván dùng 1 lần):**

```json
{ "id": "hoi_sinh", "name": "Hồi Sinh", "type": "trigger", "event": "dying", "role": "dying", "limit": { "perGame": 1 },
  "actions": [ { "do": "recover", "count": "1 - self.hp + 1" } ] }
```

---

## 11. Tướng (`content/generals/*.json`)

```json
{ "id": "chen_gong", "name": "Trần Cung", "kingdom": "qun", "halfHp": 3, "skills": ["doc_ke", "tran_tinh"], "pairs": ["lvbu"] }
```

| Trường | Ý nghĩa |
|---|---|
| `kingdom` | `wei` (Ngụy), `shu` (Thục), `wu` (Ngô), `qun` (Quần) |
| `halfHp` | Số âm dương ngư. Máu = (cá chủ tướng + cá phó tướng) / 2, làm tròn xuống |
| `skills` | id kỹ năng: kỹ năng có sẵn (ví dụ `"gianhung"`) hoặc kỹ năng trong `content/skills` |
| `pairs` | Các tướng tạo cặp Châu Liên Bích Hợp |

**Chỉnh tướng có sẵn:** chỉ cần ghi `id` và trường muốn đổi:

```json
{ "id": "xuchu", "halfHp": 5 }
```

**Tạm tắt một tướng** (không xuất hiện trong ván): `{ "id": "lvbu", "disabled": true }`.

**Đổi kỹ năng có sẵn:** viết một kỹ năng trong `content/skills` **trùng id** với kỹ năng có sẵn (ví dụ `"khonhuc"`). Engine sẽ dùng phiên bản mới cho mọi tướng có kỹ năng đó và hiện cảnh báo "ghi đè kỹ năng có sẵn".

Các id tướng và kỹ năng có sẵn xem ở tab **Tra cứu → Tướng & kỹ năng** trên trang quản trị.

---

## 12. Lá bài (`content/cards/*.json`) và bộ bài (`content/deck.json`)

### Cẩm nang

```json
{ "id": "binh_phap", "label": "Binh Pháp", "type": "trick", "targeting": "one", "filter": "t != self and t.cards > 0",
  "harmful": true, "actions": [ { "do": "discardCard", "from": "target" }, { "do": "draw" } ] }
```

- `targeting`: `one` (chọn mục tiêu, dùng `min`/`max`/`filter`), `allOthers` (mọi người khác), `all` (mọi người), `self` (bản thân).
- Biến dùng được: `self`/`user` (người dùng), `target` (mục tiêu đang xử lý), `card`.
- `harmful`: có hại cho mục tiêu không. Bot dùng trường này để quyết định có Vô Giải hay không.
- `recast: true`: cho phép trùng chú (dùng với 0 mục tiêu để bỏ lá này, bốc 1 lá).
- Vô Giải Khả Kích tự động áp dụng cho mọi cẩm nang mới, không cần làm gì thêm.

### Cẩm nang trì hoãn

```json
{ "id": "hoa_hoan", "label": "Hỏa Hoạn", "type": "delayed", "filter": "t != self",
  "success": "judge.suit == 'heart'",
  "actions": [ { "do": "damage", "who": "target", "source": "null", "nature": "fire" } ] }
```

Ở giai đoạn phán định của người bị đặt: nếu `success` đúng thì chạy `actions` (`target` = người đó).

### Trang bị

```json
{ "id": "luu_tinh", "label": "Lưu Tinh Tiễn", "type": "equip", "slot": "weapon", "range": 3,
  "skill": { "desc": "Khi Sát của bạn bị né, bạn có thể bỏ ngẫu nhiên 1 lá trên tay mục tiêu.",
             "type": "trigger", "event": "slashDodged", "role": "source", "if": "target.hand > 0",
             "actions": [ { "do": "discardRandom", "from": "target" } ] } }
```

- `slot`: `weapon` (vũ khí, có `range`), `armor` (giáp), `defHorse` (ngựa +1), `offHorse` (ngựa -1), `treasure` (bảo vật).
- `skill`: kỹ năng có hiệu lực **khi đang lắp** (viết như mục 4–6, không cần `id`/`name`).

### Hiển thị: mô tả, chữ giữa mặt bài, hình ảnh

Mọi loại lá bài đều nhận thêm 2 trường (không bắt buộc) để hiển thị trong game:

```json
{ "id": "hoa_hoan", "label": "Hỏa Hoạn", "desc": "Đặt lên một người khác. Phán định: Cơ thì chịu 1 sát thương lửa.",
  "glyph": "火", "type": "delayed", ... }
```

- `desc`: mô tả hiện khi rê chuột / nhấn giữ lá bài.
- `glyph`: 1–2 chữ in lớn giữa mặt bài khi lá chưa có ảnh. Bỏ trống thì game in chữ theo loại bài
  (锦囊 cho cẩm nang, 装备 cho trang bị). Font thư pháp đi kèm chỉ có sẵn một số chữ; chữ khác sẽ dùng font của máy.
- **Hình ảnh**: đặt `content/images/cards/<id>.png` (hoặc .jpg/.webp), hoặc tải lên ở trang quản trị → **Hình ảnh**.
  Ảnh tướng: `content/images/generals/<id tướng>.png`. Xem `content/images/README.md`.

### Bộ bài

Lá bài mới chỉ xuất hiện trong ván khi được đưa vào `deck.json`:

```json
{
  "mode": "add",
  "cards": [
    ["binh_phap", "S9 C9"],
    ["luu_tinh", "D11"],
    ["sha", "H9 D9", "fire"]
  ],
  "remove": ["shandian"]
}
```

- `mode`: `add` (thêm vào bộ 114 lá gốc) hoặc `replace` (thay toàn bộ).
- Mỗi lá: `S` = Bích ♠, `H` = Cơ ♥, `C` = Chuồn ♣, `D` = Rô ♦, kèm điểm 1–13 (1 = A, 11 = J, 12 = Q, 13 = K).
- `remove`: bỏ hẳn các loại bài này khỏi bộ bài.

---

## 13. Kiểm tra và đọc lỗi

```bash
npm run content:check                                # kiểm tra + 100 ván 6 người
npm run content:check -- --games 300 --players 8
npm run content:check -- --focus pang_tong           # ghế 0 luôn cầm Bàng Thống
```

Thông báo lỗi luôn có dạng `file > id > vị trí: nội dung`, ví dụ:

```
skills/x.json > a2 > if: biến "amout" không dùng được ở đây. Các biến có: amount, byCard, card, nature, self, source, target, ...
skills/x.json > a5 > actions[0].count: Biểu thức không hợp lệ
      self.hp +
               ^
```

Mũi tên `^` chỉ đúng chỗ sai trong biểu thức.

**Cách đọc kết quả mô phỏng:**
- **Ván bị lỗi (crash)**: kỹ năng làm engine gặp lỗi. Kết quả mô phỏng có seed của ván lỗi để tái hiện.
- **Tỉ lệ thắng của tướng**: ở bàn 6 người, trung bình khoảng 25–35%. Trên 45% là quá mạnh, dưới 15% là quá yếu.
- Bot chơi ở mức cơ bản. Kỹ năng cần chơi khéo có thể bị đánh giá thấp hơn thực tế.

---

## 14. Nâng cao: kỹ năng viết bằng JavaScript

Khi ngôn ngữ JSON không đủ (ví dụ cần đọc lá đang ở vùng xử lý như Gian Hùng), bạn có thể viết kỹ năng bằng JavaScript trong `content/scripts/*.mjs`. File xuất ra `{ skills: [...] }` theo đúng giao diện `Skill` của engine (`src/hegemony/skills.ts`). Xem ví dụ `content/scripts/vi-du.mjs`.

> ⚠ Script chạy với toàn quyền trên server. Chỉ người quản trị máy chủ mới thêm được (trang quản trị **không** cho tải script lên).

### Những gì JSON chưa làm được

- Kỹ năng của người đã chết (ví dụ "khi chết, kẻ giết mất máu"): cần thêm hỗ trợ từ engine.
- Lấy lá bài đang được dùng / lá phán định về tay (Gian Hùng, Lạc Thần).
- Thêm bài cơ bản mới (như một loại Sát mới).
- Kỹ năng chủ động chọn nhiều hơn 1 mục tiêu.

Các trường hợp này hãy dùng script JavaScript, hoặc nhờ lập trình viên thêm sự kiện / hành động mới vào `src/content/events.ts` và `src/content/runtime.ts`. Mỗi sự kiện hay hành động mới thêm vào đó sẽ tự xuất hiện trong trang quản trị.


### Hàm engine dùng được trong script (gói tướng mới dùng nhiều)

Ngoài `g.draw`, `g.damage`, `g.recover`, `g.loseHp`, `g.judge`/`g.finishJudge`, `g.moveCards`, `g.choose`, `g.chooseTargets`, `g.chooseCards`:

| Hàm | Dùng để |
|---|---|
| `g.useCardAs(seat, 'sha', [t], cardIds?, { from, label })` | "Coi như dùng" một lá (Thần Tốc, Kỳ Sách, Loạn Kích) |
| `g.targetsAs(seat, name, ignoreRange?)` | Mục tiêu hợp lệ nếu coi như dùng lá đó |
| `g.turnOver(seat)` / `player.faceDown` | Lật úp tướng — bỏ qua lượt kế tiếp (Cứ Thủ) |
| `g.grantExtraTurn(seat)` | Thêm một lượt (Phóng Quyền) |
| `g.grantSkill(seat, id, turnOnly?)` / `g.revokeSkill` | Trao kỹ năng cho người khác (Tồn Tự, Huyễn Hoặc) |
| `g.removeGeneral(seat, 'main'|'deputy')` / `g.hideGeneral` | Loại bỏ / úp lại một tướng |
| `g.askTransform(seat, lyDo)` / `g.transformDeputy(seat)` | Đổi phó tướng (hỏi trước / đổi luôn) — Kỳ Sách, Chế Man, Điển Tài |
| `g.isFemale(seat)` | Tướng nữ (theo chủ tướng) |
| `g.chooseCards(seat, prompt, ids, min, max, true)` | Chọn bài không nằm trên tay — gửi kèm mặt bài cho người chọn |
| `g.chooseTargets(..., 'ally')` | Gợi ý cho bot: kỹ năng có lợi, chọn đồng minh |
| cờ `turn_banRed`, `turn_banBlack`, `turn_banHand` | Cấm dùng/đánh bài trong lượt (Tiềm Tập, Phá Trận) |
| cờ `turn_handLimitDelta`, `turn_handLimitFixed`, `turn_extraSlash` | Sửa giới hạn bài / số lần Sát trong lượt |
| sự kiện `trickTargeted` (đặt `cancelled`) | Cẩm nang nhắm vào ai đó, trước Vô Giải (Vãn Nguy, Họa Thủ) |
| sự kiện `beforeRespond` | Sắp phải đánh một lá (Ngạo Tài) |
| sự kiện `generalRemoved`, `death` có `cards` | Tướng bị loại; bài của người chết (Hành Thương) |
| trường kỹ năng `virtualArmor`, `offenseBonus`, `slashBonus`, `blockReveal` | Giáp ảo, giảm khoảng cách, thêm Sát, cấm lật tướng |

Thư viện trợ giúp: `content/scripts/lib/tro-giup.mjs` (đấu điểm, quân lệnh, vây công, lấy/bỏ bài của người khác...).

---

## 15. Cơ chế mở rộng (dùng được ngay bằng JSON)

Ví dụ chạy được cho từng cơ chế: `content/skills/vi-du-co-che.json` (13 kỹ năng mẫu `mau_...`, chưa gắn cho tướng nào).

### Hành động mới

| Hành động | Tham số | Ví dụ |
|---|---|---|
| `turnOver` | `who` | `{ "do": "turnOver", "who": "self" }` — lật úp, bỏ qua lượt kế tiếp |
| `extraTurn` | `who` | `{ "do": "extraTurn", "who": "target" }` — thêm một lượt ngay sau lượt này |
| `useAs` | `card`, `target`, `by` | `{ "do": "useAs", "card": "sha", "target": "target" }` — coi như dùng một lá (không cần lá thật) |
| `banCards` | `who`, `color`: `red` / `black` / `all` | `{ "do": "banCards", "who": "chosen", "color": "red" }` — cấm dùng/đánh bài trong lượt |
| `turnBonus` | `who`, `handLimit`, `slash` | `{ "do": "turnBonus", "who": "turnOwner", "slash": "1" }` — +1 lần Sát trong lượt |
| `grantSkill` | `who`, `skill`, `turnOnly` | `{ "do": "grantSkill", "who": "target", "skill": "baohao", "turnOnly": "true" }` |
| `removeGeneral` | `who`, `which`: `main` / `deputy` / `ask` | `{ "do": "removeGeneral", "who": "killer", "which": "deputy" }` |
| `hideGeneral` | `who`, `which`, `by` | `{ "do": "hideGeneral", "who": "target", "which": "ask" }` — úp lại tướng đã lật |
| `transformDeputy` | `who`, `ask`, `done` | `{ "do": "transformDeputy", "who": "self" }` — đổi phó tướng (mặc định hỏi trước; `"ask": "false"` để đổi luôn) |
| `pindian` | `who`, `with`, `win`, `lose` | xem dưới |
| `order` | `to`, `by`, `done`, `refused` | xem dưới |

**Đấu điểm** — trong `win` / `lose` dùng được `pindian.mine` và `pindian.theirs` (lá bài: `.rank`, `.suit`, `.color`, `.name`):

```json
{ "do": "pindian", "with": "target",
  "win":  [ { "do": "damage", "who": "target" } ],
  "lose": [ { "do": "loseHp", "who": "self" } ] }
```

**Quân lệnh** — người ra lệnh rút ngẫu nhiên 2 trong 6 quân lệnh, chọn 1; người nhận quyết định thực hiện hay không:

```json
{ "do": "order", "to": "target", "refused": [ { "do": "draw", "count": "2" } ] }
```

Sáu quân lệnh: gây 1 sát thương cho người do người ra lệnh chọn · bốc 1 lá rồi giao 2 lá · mất 1 máu ·
lượt này không dùng được bài trên tay · bị lật úp · giữ 1 lá trên tay + 1 trang bị, bỏ hết phần còn lại.

### Biến, hàm, sự kiện mới

- Thuộc tính người chơi: `x.faceDown` — đang bị lật úp.
- Hàm vây công: `besieged(x)` — `x` có đang bị vây; `besieging(a, x)` — `a` có đang vây `x` không.
  (Vây công: `x` ngồi giữa hai người cùng thế lực đã lộ và khác thế lực với `x`.)
- Sự kiện `trickTargeted` (biến `user`, `target`, `card`; cho phép `cancel`): cẩm nang nhắm vào ai đó, trước Vô Giải.
- Sự kiện `generalRemoved` (biến `who`, `general`): một tướng bị loại.
- Sự kiện `death` với `"role": "victim"`: kỹ năng **khi bạn chết** — vẫn kích hoạt dù chủ kỹ năng vừa chết.

### Trường bị động mới

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| `virtualArmor` | Không lắp giáp thì coi như có giáp này | `"virtualArmor": "bagua"` |
| `reach` | Khoảng cách từ bạn đến người khác trừ đi | `"reach": "self.lostHp"` |
| `extraSlash` | Số lần Sát thêm mỗi lượt | `"extraSlash": "self.equips > 2 ? 1 : 0"` |

Ngoài ra `convert` giờ đổi được sang **cẩm nang trì hoãn**: `{ "from": "card.suit == 'diamond'", "as": "lebu" }`
đặt lá đó vào khu vực phán định và xử lý đúng như Lạc Bất Tư Thục.

### Đổi phó tướng (变更副将)

Lật phó tướng đang úp (nếu có), bỏ nó ra khỏi ván, rồi nhận **ngẫu nhiên** một tướng cùng thế lực với chủ tướng
(chưa ai cầm, chưa từng bị đổi ra) làm phó tướng mới ở trạng thái **úp**. Máu và giới hạn máu không đổi.
Phó tướng đã bị loại thì không đổi được.

```json
{ "id": "mau_doi_tuong", "name": "Đổi Tướng (mẫu)", "desc": "Sau khi bạn chịu sát thương, bạn có thể đổi phó tướng.",
  "type": "trigger", "event": "damaged", "role": "target",
  "actions": [ { "do": "transformDeputy", "who": "self", "ask": "false" } ] }
```

### Lật tướng trong lượt

Trong giai đoạn ra bài của mình, người chơi lật tướng úp bất cứ lúc nào (nút "Lật chủ tướng …" / "Lật phó tướng …",
hoặc bấm vào kỹ năng của tướng đang úp). Kỹ năng tỏa định, bị động của tướng đó có hiệu lực ngay sau khi lật.
