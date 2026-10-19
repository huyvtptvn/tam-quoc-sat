// ============================================================
// Vẽ lá bài, mặt sau, chân dung tướng — dùng chung cho game.html và admin.html.
//
// Ảnh lấy từ catalog.images (thư mục content/images). Không có ảnh -> mặt bài mặc định:
// giấy dó, chữ thư pháp lớn ở giữa, triện son góc trên ghi chất + điểm.
// ============================================================
(function () {
  const SUIT = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
  const SUIT_NAME = { spade: 'Bích', heart: 'Cơ', club: 'Chuồn', diamond: 'Rô' };
  const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const TYPE_LABEL = { basic: 'Cơ bản', trick: 'Cẩm nang', delayed: 'Cẩm nang trì hoãn', equip: 'Trang bị' };
  const SLOT_LABEL = { weapon: 'Vũ khí', armor: 'Giáp', defHorse: 'Ngựa +1', offHorse: 'Ngựa −1', treasure: 'Bảo vật' };
  const KINGDOM = {
    wei: { label: 'Ngụy', glyph: '魏' },
    shu: { label: 'Thục', glyph: '蜀' },
    wu: { label: 'Ngô', glyph: '吴' },
    qun: { label: 'Quần', glyph: '群' },
    careerist: { label: 'Dã tâm gia', glyph: '野' },
    ye: { label: 'Dã tâm gia', glyph: '野' },
  };

  /** Chữ in giữa mặt bài mặc định. */
  const GLYPH = {
    sha: '杀', shan: '闪', tao: '桃', jiu: '酒',
    wuxie: '无懈', wuxie_guo: '无懈', juedou: '决斗', nanman: '南蛮', wanjian: '万箭', wuzhong: '无中',
    guohe: '过河', shunshou: '顺手', taoyuan: '桃园', huogong: '火攻', tiesuo: '铁索',
    zhiji: '知己', yuanjiao: '远交', yiyi: '以逸', jiedao: '借刀', wugu: '五谷', shuiyan: '水淹',
    lebu: '乐', bingliang: '兵粮', shandian: '闪电',
    zhuge: '连弩', qinggang: '青钢', hanbing: '寒冰', guding: '古锭', qinglong: '青龙', guanshi: '贯石',
    fangtian: '方天', qilin: '麒麟', cixiong: '雌雄', zhangba: '丈八', zhuque: '朱雀',
    bagua: '八卦', renwang: '仁王', tengjia: '藤甲', baiyin: '白银',
    jueying: '绝影', dilu: '的卢', zhuahuang: '爪黄', hualiu: '骅骝', chitu: '赤兔', dayuan: '大宛', zixing: '紫骏',
    yuxi: '玉玺', muniu: '木牛', mingzhu: '明珠',
  };

  const TYPE_GLYPH = { basic: '基本', trick: '锦囊', delayed: '锦囊', equip: '装备' };

  /** Mô tả ngắn hiện khi rê chuột / nhấn giữ lá bài. Lá thêm từ content/ dùng "desc" trong JSON. */
  const DESC = {
    sha: 'Dùng với một người trong tầm đánh: người đó phải đánh Thiểm, nếu không chịu 1 sát thương. Mỗi lượt 1 lần.',
    shan: 'Đánh ra để né một lá Sát.',
    tao: 'Trong lượt của bạn: hồi 1 máu. Hoặc dùng để cứu một người đang hấp hối.',
    jiu: 'Lá Sát tiếp theo trong lượt gây thêm 1 sát thương. Khi bạn hấp hối: hồi 1 máu.',
    wuxie: 'Hủy hiệu lực của một lá cẩm nang đối với một mục tiêu.',
    wuxie_guo: 'Như Vô Giải Khả Kích; hoặc hủy hiệu lực với mọi người cùng thế lực với mục tiêu.',
    juedou: 'Bạn và mục tiêu lần lượt đánh Sát, mục tiêu đánh trước. Ai không đánh được chịu 1 sát thương từ người kia.',
    nanman: 'Mọi người khác phải đánh Sát, nếu không chịu 1 sát thương.',
    wanjian: 'Mọi người khác phải đánh Thiểm, nếu không chịu 1 sát thương.',
    wuzhong: 'Bốc 2 lá.',
    guohe: 'Bỏ 1 lá bất kỳ trong khu vực của một người khác.',
    shunshou: 'Lấy 1 lá trong khu vực của một người khác ở khoảng cách 1.',
    taoyuan: 'Mọi người hồi 1 máu.',
    huogong: 'Mục tiêu lộ 1 lá trên tay; bạn bỏ 1 lá cùng chất để gây 1 sát thương lửa.',
    tiesuo: 'Xích hoặc gỡ xích 1–2 người. Hoặc trùng chú: bỏ lá này để bốc 1 lá.',
    zhiji: 'Xem bài trên tay hoặc một tướng đang úp của một người. Hoặc trùng chú.',
    yuanjiao: 'Dùng với một người đã lộ thế lực khác bạn: người đó bốc 1 lá, bạn bốc 3 lá.',
    yiyi: 'Bạn và những người cùng thế lực mỗi người bốc 2 lá rồi bỏ 2 lá.',
    jiedao: 'Chọn một người có vũ khí và một người trong tầm đánh của họ: họ phải dùng Sát vào người đó, nếu không thì giao vũ khí cho bạn.',
    wugu: 'Lật số lá bằng số người còn sống; bắt đầu từ bạn, mỗi người lấy 1 lá.',
    shuiyan: 'Dùng với một người khác đang có trang bị: họ chọn bỏ hết trang bị, hoặc chịu 1 sát thương lôi.',
    yuxi: 'Bảo vật. Khi đã lật tướng: bốc thêm 1 lá ở giai đoạn bốc bài; đầu giai đoạn ra bài coi như dùng Tri Kỷ Tri Bỉ.',
    muniu: 'Bảo vật. Mỗi lượt cất 1 lá trên tay xuống dưới (tối đa 5), có thể chuyển cho người khác. Lá bên dưới dùng như bài trên tay.',
    mingzhu: 'Bảo vật. Bạn có Chế Hoành; nếu tướng đã có Chế Hoành thì không giới hạn số lá.',
    lebu: 'Đặt lên một người khác. Phán định: không phải Cơ thì người đó bỏ qua giai đoạn ra bài.',
    bingliang: 'Đặt lên người ở khoảng cách 1. Phán định: không phải Chuồn thì bỏ qua giai đoạn bốc bài.',
    shandian: 'Đặt lên chính bạn. Phán định: Bích 2–9 thì chịu 3 sát thương sét; nếu không, chuyển sang người kế tiếp.',
    zhuge: 'Dùng Sát không giới hạn số lần.',
    qinggang: 'Sát của bạn bỏ qua giáp của mục tiêu.',
    hanbing: 'Khi Sát của bạn gây sát thương, có thể thay bằng bỏ 2 lá của mục tiêu.',
    guding: 'Sát của bạn gây thêm 1 sát thương nếu mục tiêu không còn bài trên tay.',
    qinglong: 'Khi Sát của bạn bị né, có thể dùng thêm 1 Sát với cùng mục tiêu.',
    guanshi: 'Khi Sát của bạn bị né, có thể bỏ 2 lá để Sát vẫn gây sát thương.',
    fangtian: 'Nếu Sát là lá cuối cùng trên tay, có thể chọn tới 3 mục tiêu.',
    qilin: 'Khi Sát của bạn gây sát thương, có thể bỏ 1 ngựa của mục tiêu.',
    cixiong: 'Khi Sát của bạn nhắm vào người khác giới, có thể bắt họ chọn: bỏ 1 lá trên tay, hoặc để bạn bốc 1 lá.',
    zhangba: 'Có thể dùng hoặc đánh 2 lá trên tay như 1 lá Sát.',
    zhuque: 'Có thể đổi Sát thường của bạn thành Hỏa Sát.',
    bagua: 'Khi cần đánh Thiểm, có thể phán định: lá đỏ thì coi như đã đánh Thiểm.',
    renwang: 'Sát màu đen không có hiệu lực với bạn.',
    tengjia: 'Miễn Sát thường, Nam Man, Vạn Tiễn. Sát thương lửa gây cho bạn +1.',
    baiyin: 'Mỗi lần chịu sát thương nhiều nhất 1. Khi bị tháo ra, hồi 1 máu.',
    defHorse: 'Người khác tính khoảng cách đến bạn +1.',
    offHorse: 'Bạn tính khoảng cách đến người khác −1.',
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isRed = (c) => c.suit === 'heart' || c.suit === 'diamond';

  let catalog = { cards: {}, generals: [], skills: {}, images: { cards: {}, generals: {} } };
  let generalById = new Map();

  function setCatalog(c) {
    catalog = c;
    catalog.images = catalog.images || { cards: {}, generals: {} };
    generalById = new Map([...(c.disabledGenerals || []).map((g) => [g.id, { ...g, disabled: true }]), ...(c.generals || []).map((g) => [g.id, g])]);
  }

  // ---------- Skin tướng (ảnh + lồng tiếng, từ /api/skins) ----------
  // Mỗi người tự chọn skin cho từng tướng; lựa chọn lưu trên trình duyệt (chỉ đổi cách BẠN nhìn thấy tướng đó).
  let skins = {};
  const skinStore = {
    get(id) { try { return localStorage.getItem(`tqs_skin_${id}`); } catch { return null; } },
    set(id, v) { try { localStorage.setItem(`tqs_skin_${id}`, v); } catch { /* trình duyệt chặn lưu trữ */ } },
  };
  function setSkins(index) { skins = index || {}; }
  const skinsOf = (id) => skins[id] || [];
  /** Skin đang dùng cho tướng `id` (null nếu tướng không có skin). */
  function currentSkin(id) {
    const list = skinsOf(id);
    if (!list.length) return null;
    const pref = skinStore.get(id);
    return list.find((x) => x.key === pref) || list[0];
  }
  /** Đổi skin của tướng `id` sang skin trước/sau. Trả về skin mới. */
  function cycleSkin(id, dir) {
    const list = skinsOf(id);
    if (!list.length) return null;
    const cur = list.indexOf(currentSkin(id));
    const next = list[(cur + dir + list.length) % list.length];
    skinStore.set(id, next.key);
    return next;
  }
  /** Ảnh của tướng: skin đã chọn > ảnh tải lên trong content/images/generals > skin đầu tiên. */
  function generalImage(id) {
    const chosen = skinStore.get(id) && currentSkin(id);
    return (chosen && chosen.image) || catalog.images.generals[id] || currentSkin(id)?.image || null;
  }

  const info = (name) => catalog.cards[name] || { label: name, type: 'basic' };

  function cardLabel(c) {
    const pre = c.nature === 'fire' ? 'Hỏa ' : c.nature === 'thunder' ? 'Lôi ' : '';
    return pre + info(c.name).label.replace(/\s*\([+\-]1\)$/, '');
  }

  function cardDesc(name) {
    const i = info(name);
    return i.desc || DESC[name] || (i.slot === 'defHorse' || i.slot === 'offHorse' ? DESC[i.slot] : '') || '';
  }

  function cardImage(c) {
    const img = catalog.images.cards;
    return (c.nature && img[`${c.name}_${c.nature}`]) || img[c.name] || null;
  }

  function glyphOf(c) {
    const i = info(c.name);
    if (c.name === 'sha' && c.nature === 'fire') return '火杀';
    if (c.name === 'sha' && c.nature === 'thunder') return '雷杀';
    // Lá thêm từ content/ không khai báo "glyph": dùng chữ theo loại bài (锦囊 = cẩm nang, 装备 = trang bị).
    return i.glyph || GLYPH[c.name] || TYPE_GLYPH[i.type] || (i.label || c.name).trim().charAt(0).toUpperCase();
  }

  /** Dòng phụ dưới tên: loại bài, ô trang bị, tầm đánh. */
  function kindLine(name) {
    const i = info(name);
    if (i.type !== 'equip') return TYPE_LABEL[i.type] || '';
    return `${SLOT_LABEL[i.slot] || 'Trang bị'}${i.range ? ` · tầm ${i.range}` : ''}`;
  }

  /**
   * HTML một lá bài ngửa.
   * opts: { as: 'sha' (đang dùng như loại khác), cls: 'lớp thêm', attrs: 'thuộc tính thêm', mini: true }
   */
  function cardHTML(c, opts = {}) {
    if (!c) return '';
    const i = info(c.name);
    const img = cardImage(c);
    const glyph = glyphOf(c);
    const nature = c.nature ? ` n-${c.nature}` : '';
    const art = img
      ? `<img class="art-img" src="${esc(img)}" alt="" loading="lazy" draggable="false">`
      : `<span class="glyph g${[...glyph].length}">${esc(glyph)}</span>`;
    const asTag = opts.as && opts.as !== c.name ? `<span class="as">như ${esc(info(opts.as).label)}</span>` : '';
    const title = `${cardLabel(c)} ${SUIT_NAME[c.suit]} ${RANK[c.rank]} — ${kindLine(c.name)}\n${cardDesc(c.name)}`;
    return `<div class="card t-${i.type}${nature} ${isRed(c) ? 'red' : 'black'}${img ? ' has-img' : ''}${opts.mini ? ' mini' : ''} ${opts.cls || ''}" data-card="${c.id}" title="${esc(title)}" ${opts.attrs || ''}>
      <div class="art">${art}</div>
      <div class="seal"><span class="r">${RANK[c.rank]}</span><span class="s">${SUIT[c.suit]}</span></div>
      <div class="plate"><span class="nm">${esc(cardLabel(c))}</span><span class="kd">${esc(kindLine(c.name))}</span></div>
      ${asTag}
      ${c.transferable ? '<span class="hop" title="Hợp Tung: có thể giao cho người khác">合</span>' : ''}
    </div>`;
  }

  /** Mặt sau lá bài (bài úp, chồng bài). */
  function backHTML(cls = '') {
    const img = catalog.images.cards.back;
    return `<div class="card back ${cls}">${img ? `<img class="art-img" src="${esc(img)}" alt="" draggable="false">` : '<span class="back-seal">三国</span>'}</div>`;
  }

  /** Chân dung tướng. id = null nghĩa là tướng đang úp mà bạn không được biết. */
  function portraitHTML(id, opts = {}) {
    if (!id) {
      // Ảnh "tố tướng" (content/images/generals/sujiang.png) nếu có, dùng cho tướng đang úp.
      const back = catalog.images.generals.sujiang || currentSkin('sujiang')?.image;
      return back
        ? `<div class="portrait hidden-gen has-img ${opts.cls || ''}"><img class="art-img" src="${esc(back)}" alt="" draggable="false"></div>`
        : `<div class="portrait hidden-gen ${opts.cls || ''}"><span class="q">?</span></div>`;
    }
    const g = generalById.get(id) || { name: id, kingdom: 'qun', halfHp: 0 };
    const k = KINGDOM[g.kingdom] || KINGDOM.qun;
    const img = generalImage(id);
    const face = img
      ? `<img class="art-img" src="${esc(img)}" alt="" loading="lazy" draggable="false">`
      : `<span class="wm">${k.glyph}</span><span class="vname">${esc(g.name)}</span>`;
    return `<div class="portrait k-${g.kingdom}${img ? ' has-img' : ''}${opts.down ? ' face-down' : ''}${opts.removed ? ' removed' : ''} ${opts.cls || ''}" title="${esc(generalTitle(g))}" data-gen="${esc(id)}">
      ${face}
      <span class="kbadge">${(g.kingdoms && g.kingdoms.length > 1 ? g.kingdoms : [g.kingdom]).map((x) => (KINGDOM[x] || k).glyph).join('')}</span>
      ${img || opts.nameTag ? `<span class="ntag">${esc(g.name)}</span>` : ''}
      ${opts.down ? '<span class="down-tag">úp</span>' : ''}
      ${opts.removed ? '<span class="removed-tag">đã loại</span>' : ''}
    </div>`;
  }

  function generalTitle(g) {
    const sk = (g.skills || []).map((s) => `【${catalog.skills[s]?.name ?? s}】${catalog.skills[s]?.desc ?? ''}`).join('\n');
    const ks = (g.kingdoms && g.kingdoms.length > 1 ? g.kingdoms : [g.kingdom]).map((x) => (KINGDOM[x] || {}).label ?? x).join('/');
    const note = g.kingdoms && g.kingdoms.length > 1 ? ' · tướng 2 thế lực (chỉ làm phó tướng)' : g.kingdom === 'ye' ? ' · tướng tím (chỉ làm chủ tướng)' : '';
    return `${g.name} · ${ks} · ${g.halfHp} âm dương ngư${note}\n${sk}`;
  }

  window.TQSCards = {
    SUIT, SUIT_NAME, RANK, TYPE_LABEL, SLOT_LABEL, KINGDOM, esc, isRed,
    setCatalog, info, cardLabel, cardDesc, kindLine, glyphOf, cardHTML, backHTML, portraitHTML, generalTitle,
    general: (id) => generalById.get(id),
    setSkins, skinsOf, currentSkin, cycleSkin, generalImage,
    get catalog() { return catalog; },
  };
})();
