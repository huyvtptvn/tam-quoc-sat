// ============================================================
// Client chơi game: sảnh, phòng chờ, bàn chơi.
// Server là trọng tài; client chỉ hiển thị PlayerView và gửi câu trả lời cho từng câu hỏi.
// ============================================================
(function () {
  const C = window.TQSCards;
  const { esc } = C;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* trình duyệt chặn lưu trữ */ } },
  };
  // Phiên đăng nhập và phiên chơi chỉ sống trong tab này: tắt trang là tự đăng xuất
  // (tải lại trang vẫn giữ). Server cũng tự đăng xuất phiên mất kết nối quá 30 giây.
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* bỏ qua */ } },
  };
  // Bản cũ lưu mã đăng nhập lâu dài trong localStorage: thu hồi rồi xóa
  try {
    const old = localStorage.getItem('tqs_auth');
    if (old) fetch('/api/account/logout', { method: 'POST', headers: { 'x-account-token': old } }).catch(() => {});
    localStorage.removeItem('tqs_auth');
    localStorage.removeItem('tqs_token');
  } catch { /* bỏ qua */ }

  const PHASES = [['start', 'Bắt đầu'], ['judge', 'Phán định'], ['draw', 'Bốc bài'], ['play', 'Ra bài'], ['discard', 'Bỏ bài'], ['end', 'Kết thúc']];
  const PHASE_LABEL = Object.fromEntries(PHASES);
  const SLOTS = [['weapon', 'Vũ khí'], ['armor', 'Phòng cụ'], ['defHorse', 'Ngựa +1'], ['offHorse', 'Ngựa −1'], ['treasure', 'Bảo vật']];

  // ---------- Trạng thái ----------
  let ws = null;
  let token = sess.get('tqs_token');
  let myName = store.get('tqs_name') || '';
  let authToken = sess.get('tqs_auth') || '';
  let account = null;       // hồ sơ công khai khi đã đăng nhập
  let room = null;          // RoomInfo
  let mySeat = null;
  let spectating = false;   // đang vào phòng với tư cách người xem
  let view = null;          // PlayerView mới nhất
  let pending = null;       // { reqId, request, view, timeoutMs, at }
  let sel = emptySel();     // lựa chọn đang làm dở
  let autoFillWanted = 0;   // số bot cần thêm sau khi tạo phòng
  let narration = [];
  let gameOverShown = false;
  const prev = { hand: new Set(), played: new Set(), hp: new Map(), first: true };

  function emptySel() { return { hint: null, skill: null, cards: [], targets: [] }; }

  // ---------- Bộ bài (lấy từ /api/catalog để bộ mới thêm vào server tự hiện ra) ----------
  function fillDecks() {
    const decks = C.catalog.decks || [];
    const sel = $('roomDeck');
    if (!sel || !decks.length) return;
    const cur = sel.value;
    sel.innerHTML = decks.map((d) => `<option value="${esc(d.id)}">${esc(d.label)}</option>`).join('');
    if (decks.some((d) => d.id === cur)) sel.value = cur;
    const desc = () => { $('roomDeckDesc').textContent = decks.find((d) => d.id === sel.value)?.desc ?? ''; };
    sel.onchange = desc;
    desc();
  }

  // ---------- Thảo Phạt (đánh boss) ----------
  function fillBosses() {
    const list = C.catalog.bosses?.list || [];
    const sel = $('roomBoss');
    if (!sel) return;
    sel.innerHTML = list.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    const desc = () => {
      const b = list.find((x) => x.id === sel.value);
      $('roomBossDesc').textContent = b ? `${b.desc} Giới hạn ${b.roundLimit} vòng. Không tính Elo — có bảng xếp hạng Thảo Phạt riêng.` : '';
    };
    sel.onchange = desc;
    desc();
  }
  if ($('roomKind')) {
    const kind = () => {
      const boss = $('roomKind').value === 'boss';
      $('bossOpts').classList.toggle('hidden', !boss);
      $('roomSeatsLabel').textContent = boss ? 'Số người chơi (chưa tính boss, 2–5)' : 'Số người';
      for (const o of $('roomSeats').options) o.disabled = boss && Number(o.value) > 5;
      if (boss && Number($('roomSeats').value) > 5) $('roomSeats').value = '4';
      $('roomMode').closest('label').classList.toggle('hidden', boss);
      $('roomLord').closest('label').classList.toggle('hidden', boss);
    };
    $('roomKind').onchange = kind;
    kind();
  }

  function renderBossBar() {
    const bar = $('bossBar');
    const b = view?.boss;
    if (!bar) return;
    bar.classList.toggle('hidden', !b);
    if (!b) return;
    const bp = view.players[b.seat];
    const pct = bp.maxHp ? Math.max(0, bp.hp) / bp.maxHp * 100 : 0;
    const top = b.threat.map((t, s) => [t, s]).filter(([, s]) => s !== b.seat && view.players[s].alive).sort((x, y) => y[0] - x[0])[0];
    const rev = Object.entries(b.reviving).map(([s, n]) => `${esc(pname(Number(s)))} (${n})`).join(', ');
    bar.innerHTML = `<div class="boss-top"><b>${esc(b.name)}</b> <span class="pill">${esc(b.difficultyLabel)}</span>
        <span class="muted">Giai đoạn ${b.phase + 1}/${b.phases.length}: ${esc(b.phases[b.phase])}</span></div>
      <div class="boss-hp"><i style="width:${pct.toFixed(1)}%"></i><span>${Math.max(0, bp.hp)}/${bp.maxHp}</span></div>
      <div class="boss-meta muted">${b.lives ? `Đã bắt <b>${b.captures}/${b.lives}</b> · ` : ''}${b.tokenName ? `${esc(b.tokenName)}: <b>${b.tokens}</b> · ` : ''}Vòng ${b.round}/${b.roundLimit} · Quân lương ${b.food}/${b.foodMax}${top && top[0] > 0 ? ` · Boss đang nhắm: <b>${esc(pname(top[1]))}</b>` : ''}${rev ? ` · Chờ hồi sinh: ${rev}` : ''}</div>`;
  }

  // ---------- Chế độ chọn tướng ----------
  const MODE_DESC = {
    normal: 'Chia ngẫu nhiên vài tướng, chọn 2 tướng cùng thế lực (luật thường).',
    free: 'Xem toàn bộ danh sách tướng, tự chọn 2 tướng cùng thế lực. Chọn lần lượt theo ghế, không trùng người khác.',
    chaos: 'Chia 3 tướng ngẫu nhiên, chọn 2 tướng bất kỳ — không cần cùng thế lực. Phe của bạn theo chủ tướng.',
  };
  if ($('roomMode')) {
    const md = () => { $('roomModeDesc').textContent = MODE_DESC[$('roomMode').value] ?? ''; };
    $('roomMode').onchange = md;
    md();
  }

  // ---------- Kết nối ----------
  async function connect() {
    if (!C.catalog.generals.length) {
      C.setCatalog(await (await fetch('/api/catalog')).json()); fillDecks(); fillBosses();
      try { C.setSkins((await (await fetch('/api/skins')).json()).skins); } catch { /* không có skin: dùng chân dung vẽ sẵn */ }
    }
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => sendHello();
    ws.onclose = () => {
      setConn('Mất kết nối, đang nối lại…');
      setTimeout(connect, 2000);
    };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  }
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  /** auth: mã tài khoản; null = báo server đăng xuất; bỏ trống = khách. */
  let pendingLogout = false;
  function sendHello() {
    const msg = { t: 'hello', name: myName, token };
    if (authToken) msg.auth = authToken;
    else if (pendingLogout) msg.auth = null;
    send(msg);
  }
  const setConn = (t) => { $('connState').textContent = t; };

  function onMessage(m) {
    switch (m.t) {
      case 'welcome':
        token = m.token; sess.set('tqs_token', token);
        pendingLogout = false;
        if (authToken && !m.account && !room) { authToken = ''; sess.set('tqs_auth', ''); toast('Phiên đăng nhập đã hết hạn, bạn đang chơi như khách.'); }
        account = m.account || (authToken ? account : null);
        renderAccount();
        setConn(account ? '' : m.name);
        if (!room) {
          show('lobby');
          if (location.hash === '#tao-phong') { $('roomName').focus(); $('createForm').scrollIntoView({ block: 'center' }); }
        }
        break;
      case 'rooms': renderRooms(m.rooms); break;
      case 'room': onRoom(m.room, m.yourSeat, !!m.spectating); break;
      case 'state':
        // Đang có câu hỏi: giữ các gợi ý của câu hỏi (lá dùng được, kỹ năng dùng được...) nếu view mới thiếu
        view = pending && view ? {
          ...m.view,
          hints: m.view.hints?.length ? m.view.hints : view.hints,
          responseOptions: m.view.responseOptions?.length ? m.view.responseOptions : view.responseOptions,
          skillHints: m.view.skillHints ?? view.skillHints,
          specialSaves: m.view.specialSaves ?? view.specialSaves,
        } : m.view;
        for (const line of m.log) addLog(line);
        if (!$('game').classList.contains('hidden')) checkReveals();
        if (!pending) renderGame();
        break;
      case 'request':
        pending = { ...m, at: Date.now() };
        view = m.view;
        sel = emptySel();
        renderGame();
        if (m.request.type === 'chooseGenerals') openGeneralPicker(m.request);
        else if (m.request.type === 'chooseCards' && !m.request.cardIds.every((id) => view.myHand.some((c) => c.id === id))) openCardPicker(m.request);
        break;
      case 'requestClosed':
        if (pending?.reqId === m.reqId) {
          pending = null; sel = emptySel(); closeModal(); renderGame();
          if (m.reason === 'timeout') toast('Hết giờ — máy đã trả lời thay bạn.');
        }
        break;
      case 'gameOver': pending = null; renderGame(); showGameOver(m.result, m.scores, m.match); refreshAccount(); break;
      case 'chat': addChat(m.from, m.text); break;
      case 'sfx': playSfx(m); break;
      case 'notice': toast(m.text); addLog(`ℹ ${m.text}`); break;
      case 'error': toast(m.message); break;
    }
  }

  // ---------- Màn hình ----------
  function show(name) {
    for (const id of ['login', 'lobby', 'room', 'game']) $(id).classList.toggle('hidden', id !== name);
    $('btnLeave').classList.toggle('hidden', name !== 'room' && name !== 'game');
    updateTopButtons(name);
    $('sideToggle').classList.toggle('hidden', name !== 'game');
    if (name === 'game') requestAnimationFrame(layoutSeats);
  }

  function renderRooms(rooms) {
    const el = $('rooms');
    if (!rooms.length) { el.innerHTML = '<div class="empty">Chưa có phòng nào. Tạo một phòng ở bên cạnh, bot sẽ ngồi cho đủ chỗ.</div>'; return; }
    el.innerHTML = rooms.map((r) => {
      const full = r.seats.length >= r.maxSeats;
      const live = r.status !== 'waiting';
      return `<div class="room-row">
        <span class="nm">${esc(r.name)}</span>
        <span class="pill">${r.seats.length}/${r.maxSeats} người</span>
        ${r.deckLabel ? `<span class="pill">${esc(r.deckLabel.replace(/ \(.*\)$/, ''))}</span>` : ''}
        ${r.modeLabel && r.mode !== 'normal' ? `<span class="pill">${esc(r.modeLabel)}</span>` : ''}
        <span class="pill ${live ? 'live' : ''}">${live ? 'Đang chơi' : 'Đang chờ'}</span>
        ${r.spectators?.length ? `<span class="pill" title="${esc(r.spectators.join(', '))}">👁 ${r.spectators.length}</span>` : ''}
        <button class="btn small" data-join="${esc(r.id)}" ${full || live ? 'disabled' : ''}>Vào phòng</button>
        <button class="btn small ghost" data-watch="${esc(r.id)}" title="Vào xem ván đấu, không tham gia">Xem</button>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-join]').forEach((b) => { b.onclick = () => send({ t: 'joinRoom', roomId: b.dataset.join }); });
    el.querySelectorAll('[data-watch]').forEach((b) => { b.onclick = () => send({ t: 'spectate', roomId: b.dataset.watch }); });
  }

  /** Nút trên thanh trên cùng: đầu hàng (đang chơi, còn sống), giải tán (chủ phòng), rời/thoát xem. */
  function updateTopButtons(name) {
    const screen = name ?? (['room', 'game'].find((id) => !$(id).classList.contains('hidden')) || 'lobby');
    const inRoom = !!room && (screen === 'room' || screen === 'game');
    const isHost = inRoom && !spectating && mySeat !== null && room.hostSeat === mySeat;
    const alive = view && !view.spectator && view.players?.[view.me]?.alive;
    $('btnSurrender').classList.toggle('hidden', !(inRoom && screen === 'game' && room.status === 'playing' && !spectating && mySeat !== null && alive && !view?.finished));
    $('btnDissolve').classList.toggle('hidden', !(isHost && screen === 'game'));
    $('btnDissolveRoom').classList.toggle('hidden', !isHost);
    $('btnLeave').textContent = spectating ? 'Thoát xem' : 'Rời phòng';
  }

  function onRoom(r, seat, watching = false) {
    // Ván mới bắt đầu: xóa nội dung trò chuyện của ván trước
    if (r && r.status === 'playing' && room?.status !== 'playing') { $('chatLog').innerHTML = ''; revealSeen = 0; revealQueue.length = 0; }
    room = r; mySeat = seat; spectating = !!r && watching;
    document.body.classList.toggle('spectating', spectating);
    if (!r) { view = null; pending = null; closeModal(); show('lobby'); return; }
    if (autoFillWanted > 0 && r.status === 'waiting') {
      const n = Math.min(autoFillWanted, r.maxSeats - r.seats.length);
      autoFillWanted = 0;
      for (let i = 0; i < n; i++) send({ t: 'addBot' });
    }
    if (r.status === 'playing') {
      gameOverShown = false;
      show('game');
      renderGame();
      return;
    }
    if (!$('modal').classList.contains('hidden') && gameOverShown) return; // đang xem kết quả, chưa về phòng
    show('room');
    renderRoom();
  }

  function renderRoom() {
    const r = room;
    $('roomTitle').textContent = r.name;
    $('roomSub').textContent = `${r.seats.length}/${r.maxSeats} người · ${r.timeoutSec} giây mỗi lần trả lời${r.deckLabel ? ` · Bộ bài ${r.deckLabel}` : ''}${r.modeLabel ? ` · Chế độ ${r.modeLabel}` : ''}${r.mulligan ? ' · được đổi bài khởi đầu' : ''}${r.lord && !r.boss ? ' · có quân chủ' : ''}${r.boss ? ` · Boss: ${r.boss.name} (${r.boss.difficultyLabel})` : ''}`;
    const tiles = r.seats.map((s) => `<div class="seat-tile ${s.index === mySeat ? 'me' : ''}">
      <span class="no">${s.index + 1}</span>
      <div><b>${esc(s.name)}</b><small>${s.kind === 'bot' ? 'Máy' : s.index === mySeat ? 'Bạn' : s.connected ? 'Người chơi' : 'Mất kết nối'}${s.kind === 'human' ? (s.username ? ` · <a class="muted" href="/ranking.html#nguoi-${encodeURIComponent(s.username)}" target="_blank" rel="noopener">@${esc(s.username)}</a>` : ' · khách') : ''}</small></div></div>`);
    for (let i = r.seats.length; i < r.maxSeats; i++) tiles.push(`<div class="seat-tile empty-seat"><span class="no">${i + 1}</span><div>Ghế trống</div></div>`);
    $('seatGrid').innerHTML = tiles.join('');
    const host = !spectating && mySeat !== null && r.hostSeat === mySeat;
    $('specLine').classList.toggle('hidden', !spectating && !r.spectators?.length);
    $('specLine').textContent = spectating ? `👁 Bạn đang xem phòng này. Ván bắt đầu thì bạn sẽ thấy bàn chơi (không thấy bài trên tay ai).${r.spectators?.length > 1 ? ` Người xem: ${r.spectators.join(', ')}.` : ''}`
      : `👁 Người xem: ${(r.spectators || []).join(', ')}`;
    for (const id of ['btnStart', 'btnAddBot', 'btnRemoveBot']) $(id).classList.toggle('hidden', spectating);
    $('btnStart').disabled = r.seats.length < 2 || !host;
    $('btnAddBot').disabled = r.seats.length >= r.maxSeats;
    $('btnRemoveBot').disabled = !r.seats.some((s) => s.kind === 'bot');
  }

  // ---------- Bàn chơi ----------
  // ---------- Bảng xem bài / xem tướng (Tri Kỷ Tri Bỉ, Thượng Nghĩa...) ----------
  let revealSeen = null;      // id lớn nhất đã xem; null = chưa nhận view nào (mở lại trang: không bật lại cái cũ)
  const revealQueue = [];
  function checkReveals() {
    const list = view?.reveals || [];
    const maxId = list.reduce((m, r) => Math.max(m, r.id), 0);
    if (revealSeen === null) { revealSeen = maxId; return; }
    for (const r of list) if (r.id > revealSeen) revealQueue.push(r);
    revealSeen = Math.max(revealSeen, maxId);
    if (revealQueue.length && $('infoPop').classList.contains('hidden')) showRevealPop();
  }
  function showRevealPop() {
    const r = revealQueue.shift();
    if (!r) { $('infoPop').classList.add('hidden'); return; }
    const cards = r.cards ? (r.cards.length ? `<div class="ip-cards">${r.cards.map((c) => C.cardHTML(c)).join('')}</div>` : '<p class="muted">Không có lá bài nào.</p>') : '';
    const gens = r.generals?.length ? `<div class="ip-gens">${r.generals.map((id) => `<div class="ip-gen">${C.portraitHTML(id, { nameTag: true })}</div>`).join('')}</div>` : '';
    $('infoPop').innerHTML = `<div class="ip-box" role="dialog" aria-label="${esc(r.title)}">
      <div class="ip-head"><b>${esc(r.title)}</b><button type="button" class="ip-x" aria-label="Đóng">×</button></div>
      ${cards}${gens}${r.text ? `<p>${esc(r.text)}</p>` : ''}
      <div class="ip-foot"><span class="muted">Chỉ mình bạn thấy${revealQueue.length ? ` · còn ${revealQueue.length} bảng nữa` : ''}</span><button type="button" class="btn primary ip-ok">Đóng</button></div>
    </div>`;
    $('infoPop').classList.remove('hidden');
    const close = () => showRevealPop();
    $('infoPop').querySelector('.ip-x').onclick = close;
    $('infoPop').querySelector('.ip-ok').onclick = close;
  }

  function renderGame() {
    if (!view || $('game').classList.contains('hidden')) return;
    checkReveals();
    renderSeats();
    renderCenter();
    renderMine();
    renderHand();
    renderSkills();
    renderAction();
    updateTopButtons();
    prev.first = false;
  }

  const players = () => view.players;
  const me = () => view.players[view.me];
  const pname = (s) => view?.players[s]?.name ?? `Ghế ${s + 1}`;
  const req = () => pending?.request ?? null;

  /** Những ghế đang có thể bấm chọn làm mục tiêu, và giới hạn số người. */
  function targetSpec() {
    const r = req();
    if (!r) return null;
    if (r.type === 'play' && sel.hint?.needsTarget) return { seats: sel.hint.targets, min: sel.hint.minTargets, max: sel.hint.maxTargets };
    if (r.type === 'play' && sel.skill?.needsTarget) return { seats: sel.skill.targets, min: 1, max: 1 };
    if (r.type === 'chooseTargets') return { seats: r.candidates, min: r.min, max: r.max };
    return null;
  }

  function hpHTML(p, big) {
    const hp = Math.max(0, p.hp);
    const ratio = p.maxHp ? hp / p.maxHp : 0;
    const cls = ratio > .66 ? 'hi' : ratio > .34 ? 'mid' : 'lo';
    if (p.maxHp > (big ? 8 : 6)) return `<div class="hp ${cls}" title="${hp}/${p.maxHp} máu"><i></i><span class="num">${hp}/${p.maxHp}</span></div>`;
    let s = '';
    for (let i = 0; i < p.maxHp; i++) s += `<i class="${i < hp ? '' : 'lost'}"></i>`;
    return `<div class="hp ${cls}" title="${hp}/${p.maxHp} máu">${s}</div>`;
  }

  function kingdomTag(p) {
    if (view?.boss) return `<span class="tag ${p.seat === view.boss.seat ? 'k-ye' : 'k-shu'}">${p.seat === view.boss.seat ? 'Boss' : 'Liên quân'}</span>`;
    const k = p.kingdom;
    if (!k) return '<span class="tag">Chưa lộ</span>';
    // Dã tâm gia: ghi kèm người cầm đầu (đồng minh Lạp Long Nhân Tâm cùng tên)
    if (k === 'careerist') return `<span class="tag k-ye" title="Mỗi dã tâm gia là một phe riêng; người gia nhập qua Lạp Long Nhân Tâm cùng phe với người cầm đầu">${esc(p.team || 'Dã tâm gia')}</span>`;
    return `<span class="tag k-${esc(k)}">${esc(C.KINGDOM[k]?.label ?? k)}</span>`;
  }

  function markTags(p) {
    const m = p.marks || {};
    return [
      m.yinyang ? `<span class="tag" title="Âm Dương Ngư ×${m.yinyang}: bốc thêm 1 lá hoặc tăng giới hạn bài">Âm Dương${m.yinyang > 1 ? ` ×${m.yinyang}` : ''}</span>` : '',
      m.pioneer ? `<span class="tag" title="Tiên Khu ×${m.pioneer}: bốc bài đến 4 lá hoặc xem 1 tướng úp">Tiên Khu${m.pioneer > 1 ? ` ×${m.pioneer}` : ''}</span>` : '',
      m.pair ? `<span class="tag" title="Châu Liên Bích Hợp ×${m.pair}: bốc 2 lá hoặc dùng như Đào">Châu Liên${m.pair > 1 ? ` ×${m.pair}` : ''}</span>` : '',
      m.ambition ? `<span class="tag k-ye" title="Dã Tâm Gia ×${m.ambition}: dùng thay Âm Dương Ngư, Tiên Khu hoặc Châu Liên Bích Hợp">Dã Tâm${m.ambition > 1 ? ` ×${m.ambition}` : ''}</span>` : '',
      p.chained ? '<span class="tag chain" title="Đang bị xích">Xích</span>' : '',
      p.lured ? '<span class="tag lured" title="Bị Điệu Hổ Ly Sơn: lượt này tạm rời bàn — không tính khoảng cách và trận pháp, không dùng/đánh bài, không bị chọn làm mục tiêu, máu không đổi">Điệu Hổ</span>' : '',
      p.faceDown ? '<span class="tag facedown" title="Bị lật úp: bỏ qua lượt kế tiếp">Lật úp</span>' : '',
      p.lord ? '<span class="tag" title="Quân chủ của thế lực">Quân chủ</span>' : '',
    ].join('');
  }

  function eqLine(c, slotLabel) {
    if (!c) return `<div class="eq empty"><span class="sl">${slotLabel}</span></div>`;
    return `<div class="eq" title="${esc(slotLabel + ': ' + C.cardLabel(c) + ' — ' + C.cardDesc(c.name))}"><span class="cn">${esc(C.cardLabel(c))}</span><span class="sr ${C.isRed(c) ? 'red' : ''}">${C.SUIT[c.suit]}${C.RANK[c.rank]}</span></div>`;
  }

  function zonesHTML(p, withEmpty) {
    const eq = SLOTS.map(([k, label]) => (p.equips?.[k] || withEmpty ? eqLine(p.equips?.[k], label) : '')).join('');
    if (withEmpty === 'slots') return `<div class="eqgrid">${eq}</div>`;
    if (withEmpty === 'extras') return extrasHTML(p);
    const jd = (p.judgeArea || []).map((c) => `<span class="j" title="${esc(C.cardLabel(c) + ' — ' + C.cardDesc(c.name))}">${esc([...C.glyphOf(c)][0])}</span>`).join('');
    const sp = (p.special || []).length ? `<div class="eq" title="Bài trên tướng">Trên tướng: ${p.special.length} lá</div>` : '';
    const gp = (p.generalPiles || []).map((pile) => {
      const names = (pile.ids || []).map((id) => C.general(id)?.name ?? id);
      const tip = names.length ? names.join(', ') : 'Tướng úp';
      return `<div class="eq" title="[${esc(pile.name)}] ${esc(tip)}">[${esc(pile.name)}]: ${pile.count} tướng${names.length ? ` <span class="muted">(${esc(names.join(', '))})</span>` : ''}</div>`;
    }).join('');
    return `${withEmpty ? `<div class="eqgrid">${eq}</div>` : eq}${jd ? `<div class="judges">${jd}</div>` : ''}${sp}${gp}`;
  }
  /** Phần phụ của ghế người khác: khu phán định, bài trên tướng, chồng tướng. */
  function extrasHTML(p) {
    const html = zonesHTML({ ...p, equips: {} }, false);
    return html;
  }

  function gensHTML(p, isMe) {
    const g = p.generals;
    if (!g) return '';
    const one = (slot) => C.portraitHTML(slot.generalId, { down: !slot.revealed && slot.generalId, nameTag: isMe, removed: slot.removed, cls: isMe ? '' : 'no-ntag', noTitle: !isMe });
    // Ghế của mình: mỗi tướng một cột, các kỹ năng của tướng là từng ô ngay dưới ảnh
    if (isMe) {
      const mine = (slot) => C.portraitHTML(slot.generalId, { down: !slot.revealed && slot.generalId, removed: slot.removed, cls: 'no-ntag' });
      const nm = (slot) => (slot.generalId ? esc(C.general(slot.generalId)?.name ?? slot.generalId) : 'Úp');
      // Ảnh kéo hết chiều cao ô; kỹ năng đè lên ảnh từ dưới lên; tên tướng nằm ngoài ảnh (bên dưới) cho khỏi lẫn với kỹ năng
      return `<div class="gens">${['main', 'deputy'].map((w) => `<div class="gen-col"><div class="pwrap">${mine(g[w])}${genSkillsHTML(g[w], w)}</div><div class="gname">${nm(g[w])}</div></div>`).join('')}</div>`;
    }
    // Ghế người khác: tên tướng ghi đầy đủ dưới ảnh (không bị cắt)
    const nm = (slot) => {
      if (!slot.generalId) return '<span class="gn muted">Úp</span>';
      const n = C.general(slot.generalId)?.name ?? slot.generalId;
      return `<span class="gn${slot.removed ? ' muted' : ''}" title="${esc(n)}">${esc(n)}${!slot.revealed ? ' <i>(úp)</i>' : ''}</span>`;
    };
    return `<div class="gens-col"><div class="gens">${one(g.main)}${one(g.deputy)}</div><div class="gnames">${nm(g.main)}${nm(g.deputy)}</div></div>`;
  }

  function seatFlags(p, el) {
    const spec = targetSpec();
    const can = spec?.seats.includes(p.seat);
    const chosen = selTargets().includes(p.seat);
    el.classList.toggle('current', p.seat === view.currentSeat && p.alive);
    el.classList.toggle('dead', !p.alive);
    el.classList.toggle('lured-seat', !!p.lured && p.alive);
    el.classList.toggle('targetable', !!can && !chosen);
    el.classList.toggle('targeted', !!chosen);
    // hiệu ứng mất / hồi máu
    const before = prev.hp.get(p.seat);
    if (!prev.first && before !== undefined && before !== p.hp) {
      const cls = p.hp < before ? 'hurt' : 'heal';
      el.classList.remove('hurt', 'heal');
      void el.offsetWidth;
      el.classList.add(cls);
    }
    prev.hp.set(p.seat, p.hp);
  }

  const selTargets = () => sel.targets;

  function renderSeats() {
    const box = $('seats');
    const n = players().length;
    const order = [];
    for (let i = 1; i < n; i++) order.push((view.me + i) % n);
    // tạo/giữ phần tử để hiệu ứng không bị mất
    const keep = new Set(order.map(String));
    for (const el of [...box.children]) if (!keep.has(el.dataset.seat)) el.remove();
    order.forEach((s) => {
      let el = box.querySelector(`[data-seat="${s}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'seat';
        el.dataset.seat = String(s);
        el.onclick = () => clickSeat(s);
        box.appendChild(el);
      }
      const p = players()[s];
      const turn = p.seat === view.currentSeat && p.alive ? `<span class="turn-flag">${esc(PHASE_LABEL[view.phase] ?? '')}</span>` : '';
      const tg = selTargets().includes(s) ? '<span class="target-badge">Mục tiêu</span>' : '';
      el.innerHTML = `${turn}${tg}
        <div class="seat-head"><span class="seatno" title="Thứ tự lượt: ghế ${s + 1}">${s + 1}</span><span class="who" title="${esc(p.name)}">${esc(p.name)}</span>${p.alive ? hpHTML(p, false) : '<span class="dead-mark">Tử trận</span>'}<span class="handcount" title="Số bài trên tay">${p.handCount}</span></div>
        <div class="seat-body">${gensHTML(p, false)}
          <div class="side">
            <div class="tags">${kingdomTag(p)}${markTags(p)}</div>
            ${zonesHTML(p, 'slots')}
          </div>
        </div>
        <div class="zones">${zonesHTML(p, 'extras')}</div>`;
      seatFlags(p, el);
    });
    // Thứ tự phần tử phải đúng thứ tự lượt (sau ván mới / đổi chỗ ngồi, phần tử cũ có thể nằm sai chỗ)
    for (const s of order) box.appendChild(box.querySelector(`[data-seat="${s}"]`));
    layoutSeats();
  }

  /**
   * Xếp các ghế khác theo hình chữ U quanh bàn: người kế tiếp ở cột phải (dưới lên),
   * rồi hàng trên (phải sang trái), rồi cột trái (trên xuống) — đúng chiều lượt chơi.
   * Vùng giữa (bài vừa đánh, giai đoạn) được đặt vào phần trống còn lại.
   */
  function layoutSeats() {
    const box = $('seats');
    const table = $('table');
    const els = [...box.children];
    const center = $('center');
    if (!els.length) return;
    const W = table.clientWidth, H = table.clientHeight;
    const m = els.length;
    box.classList.toggle('dense', m >= 6 || H < 470 || W < 700);
    const sw0 = Math.max(...els.map((e) => e.offsetWidth || 180));
    const sh0 = Math.max(...els.map((e) => e.offsetHeight || 130));
    const g = 8;
    // Thu nhỏ ghế (scale) nếu bàn không đủ chỗ cho mọi ghế mà không đè lên nhau
    let f = 1, sw = sw0, sh = sh0, k = 0, top = m, sideCap = 0;
    for (f = 1; f >= 0.6; f = Math.round((f - 0.05) * 100) / 100) {
      sw = sw0 * f; sh = sh0 * f;
      const yt2f = sh * 1.5 + g * 2, ybf = H - sh / 2 - g;
      sideCap = ybf >= yt2f ? Math.floor((ybf - yt2f) / (sh + g)) + 1 : 0;
      const topCapF = Math.max(1, Math.floor((W - g) / (sw + g)));
      k = m >= 3 ? Math.max(1, Math.ceil((m - topCapF) / 2)) : 0;
      k = Math.min(k, sideCap, Math.floor((m - 1) / 2));
      top = m - 2 * k;
      if (top <= topCapF) break;
    }
    f = Math.max(0.6, f);
    // Dùng thuộc tính "scale" riêng (không đụng "transform") để hiệu ứng rung khi mất máu vẫn chạy
    // transform-origin 0 0: tâm ghế vẫn nằm đúng điểm (left, top) sau khi thu nhỏ
    els.forEach((el) => { el.style.scale = f < 1 ? String(f) : ''; el.style.transformOrigin = f < 1 ? '0 0' : ''; });
    const xl = sw / 2 + g, xr = W - sw / 2 - g, yt = sh / 2 + g;
    const yt2 = sh * 1.5 + g * 2, yb = H - sh / 2 - g;
    const pos = [];
    const spread = (n, a, b) => (n === 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));
    // cột phải: dưới lên
    for (const y of spread(k, yb, k === 1 ? (yt2 + yb) / 2 : yt2)) pos.push([xr, k === 1 ? (yt2 + yb) / 2 : y]);
    // hàng trên: phải sang trái
    let tx0 = xr, tx1 = xl;
    if (k === 0) {
      const span = Math.min(xr - xl, (top - 1) * (sw + 70));
      tx0 = W / 2 + span / 2; tx1 = W / 2 - span / 2;
    }
    for (const x of spread(top, tx0, tx1)) pos.push([x, yt]);
    // cột trái: trên xuống
    for (const y of spread(k, k === 1 ? (yt2 + yb) / 2 : yt2, yb)) pos.push([xl, y]);
    els.forEach((el, i) => {
      const [x, y] = pos[i] ?? [W / 2, yt];
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    });
    // vùng giữa
    const L = k > 0 ? sw + g * 2 : g, R = k > 0 ? W - sw - g * 2 : W - g;
    const T = sh + g * 2, B = H - g;
    center.style.left = `${Math.round((L + R) / 2)}px`;
    center.style.top = `${Math.round((T + B) / 2)}px`;
    center.style.width = `${Math.max(160, Math.min(600, R - L - 16))}px`;
    center.classList.toggle('tight', B - T < 250 || R - L < 420);
  }
  window.addEventListener('resize', () => requestAnimationFrame(layoutSeats));
  // Khu bài của mình cao/thấp lại (thanh hỏi nhiều nút, nhiều lá) làm bàn co giãn: xếp lại ghế cho khỏi bị che
  if (window.ResizeObserver) {
    let lastH = 0, lastW = 0;
    new ResizeObserver(() => {
      const t = $('table');
      if (!t || (t.clientHeight === lastH && t.clientWidth === lastW)) return;
      lastH = t.clientHeight; lastW = t.clientWidth;
      requestAnimationFrame(layoutSeats);
    }).observe($('table'));
  }

  function renderCenter() {
    renderBossBar();
    $('phaseStrip').innerHTML = PHASES.map(([k, l]) => `<span class="${view.phase === k ? 'on' : ''}">${l}</span>`).join('');
    $('turnLine').innerHTML = `${C.backHTML('pile-mini')}<span>Vòng ${view.turn} · lượt của <b>${esc(pname(view.currentSeat))}</b> · chồng bài ${view.drawPileCount} lá</span>`;
    const cards = view.lastDiscards || [];
    const ids = new Set(cards.map((c) => c.id));
    $('played').innerHTML = cards.map((c) => C.cardHTML(c, { cls: prev.played.has(c.id) ? '' : 'drop' })).join('');
    prev.played = ids;
    const [last, before] = narration;
    $('narrate').innerHTML = `${before ? `<span class="old">${esc(before)}</span>` : ''}${esc(last ?? '')}`;
  }

  function renderMine() {
    const p = me();
    const el = $('myseat');
    el.classList.toggle('current', p.seat === view.currentSeat && p.alive);
    el.classList.toggle('dead', !p.alive);
    const spec = targetSpec();
    el.classList.toggle('targetable', !!spec?.seats.includes(p.seat) && !selTargets().includes(p.seat));
    el.classList.toggle('targeted', selTargets().includes(p.seat));
    el.onclick = (e) => { if (e.target.closest('.portrait') || e.target.closest('.side')) clickSeat(p.seat); };
    const before = prev.hp.get(p.seat);
    if (!prev.first && before !== undefined && before !== p.hp) {
      el.classList.remove('hurt', 'heal'); void el.offsetWidth; el.classList.add(p.hp < before ? 'hurt' : 'heal');
    }
    prev.hp.set(p.seat, p.hp);
    const notes = (view.notes || []).slice(-2).map((n) => `<div class="notes">${esc(n)}</div>`).join('');
    el.innerHTML = `${selTargets().includes(p.seat) ? '<span class="target-badge">Mục tiêu</span>' : ''}${gensHTML(p, true)}
      <div class="side">
        <div class="who"><span class="seatno" title="Thứ tự lượt: ghế ${p.seat + 1}">${p.seat + 1}</span>${esc(p.name)}</div>
        ${p.alive ? hpHTML(p, true) : '<span class="dead-mark">Đã tử trận</span>'}
        <div class="tags">${kingdomTag(p)}${markTags(p)}</div>
        <div class="slots">${zonesHTML(p, true)}</div>
        ${notes}
      </div>`;
    el.querySelectorAll('[data-gsk]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        // Ô xám: bấm để xem mô tả (điện thoại không có rê chuột); ô đỏ: kích hoạt
        if (!b.classList.contains('on')) { showSkillTip(b, true); return; }
        hideSkillTip();
        clickGenSkill(b.dataset.gsk, b.dataset.which);
      };
      b.onmouseenter = () => showSkillTip(b);
      b.onmouseleave = () => hideSkillTip();
    });
  }

  /** Lá nào trên tay đang bấm được, theo câu hỏi hiện tại. */
  function selectableCards() {
    const r = req();
    const v = view;
    if (!r) return new Set();
    switch (r.type) {
      case 'play':
        if (sel.skill) return new Set(sel.skill.cards === 'none' ? [] : (sel.skill.validCards ?? v.myHand.map((c) => c.id)));
        return new Set(v.hints.map((h) => h.cardId));
      case 'respond': case 'save': return new Set(v.responseOptions.map((o) => o.cardId));
      case 'discard': return new Set(r.cardIds ?? v.myHand.map((c) => c.id));
      case 'chooseCards': return new Set(r.cardIds);
      default: return new Set();
    }
  }

  function selectedCards() {
    if (sel.hint) return [sel.hint.cardId];
    return sel.cards;
  }

  function renderHand() {
    const box = $('hand');
    const hand = view.myHand;
    if (view.spectator) { box.innerHTML = `<div class="none">Người xem không thấy bài trên tay. ${esc(me().name)} đang cầm ${me().handCount ?? 0} lá.</div>`; prev.hand = new Set(); return; }
    if (!hand.length) { box.innerHTML = '<div class="none">Không có bài trên tay.</div>'; prev.hand = new Set(); return; }
    const can = selectableCards();
    const chosen = new Set(selectedCards());
    const asking = !!req();
    const asOf = (id) => (sel.hint && sel.hint.cardId === id ? sel.hint.as : (req()?.type === 'respond' || req()?.type === 'save') ? view.responseOptions.find((o) => o.cardId === id)?.as : undefined);
    box.innerHTML = hand.map((c) => {
      const cls = [
        chosen.has(c.id) ? 'selected' : can.has(c.id) ? 'playable' : asking && can.size ? 'dim' : '',
        prev.hand.has(c.id) || prev.first ? '' : 'enter',
      ].join(' ');
      return C.cardHTML(c, { cls, as: asOf(c.id) });
    }).join('');
    prev.hand = new Set(hand.map((c) => c.id));
    box.querySelectorAll('.card').forEach((el) => {
      const id = Number(el.dataset.card);
      el.onclick = () => clickCard(id);
      el.ondblclick = () => dblCard(id);
    });
    fitHand();
  }

  function fitHand() {
    const box = $('hand');
    const cards = box.querySelectorAll('.card');
    if (cards.length < 2) return;
    const cw = cards[0].offsetWidth;
    const avail = box.clientWidth - 12;
    const need = cw * cards.length + 6 * (cards.length - 1);
    const overlap = need > avail ? -Math.min(cw * 0.72, (need - avail) / (cards.length - 1) + 6) + 6 : 6;
    box.style.setProperty('--overlap', `${Math.round(overlap)}px`);
  }
  window.addEventListener('resize', () => requestAnimationFrame(fitHand));

  function myGeneralSkills() {
    const g = me().generals;
    if (!g) return [];
    const out = [];
    for (const which of ['main', 'deputy']) {
      const slot = g[which];
      const gen = slot.generalId && C.general(slot.generalId);
      if (!gen || slot.removed) continue;
      for (const s of gen.skills) out.push({ id: s, gen: gen.name, revealed: slot.revealed, which });
    }
    return out;
  }

  /** Trạng thái một kỹ năng của mình lúc này: dùng được (đỏ), đang được hỏi, hay không (xám). */
  function skillState(id, which, revealed) {
    const r = req();
    if (!r) return null;
    if (r.type === 'play') {
      const h = (view.skillHints || []).find((x) => x.skill === id);
      if (h) return { kind: 'use' };
      const rv = !revealed && (view.skillHints || []).find((x) => x.skill === `reveal:${which}`);
      return rv ? { kind: 'reveal', skill: rv.skill } : null;
    }
    if (r.type === 'confirm' && r.skill === id) return { kind: 'confirm' };
    if (r.type === 'choose' && Array.isArray(r.skills)) {
      const i = r.skills.indexOf(id);
      if (i >= 0) return { kind: 'choice', index: i };
    }
    return null;
  }

  function genSkillsHTML(slot, which) {
    const gen = slot.generalId && C.general(slot.generalId);
    if (!gen || slot.removed) return '';
    return `<div class="gskills">${gen.skills.map((id) => {
      const info = C.catalog.skills[id] || { name: id, desc: '' };
      const st = skillState(id, which, slot.revealed);
      const locked = /^Tỏa định kỹ/i.test(info.desc || '');
      const on = sel.skill?.skill === id ? ' active' : '';
      const tip = `【${info.name}】${info.desc || ''}${slot.revealed ? '' : '\n(Tướng đang úp: dùng kỹ năng sẽ lật tướng)'}`;
      const len = [...info.name].length;
      return `<button type="button" class="gsk${st ? ' on' : ''}${on}${slot.revealed ? '' : ' hidden-gen'}${len > 14 ? ' xlong' : len > 10 ? ' long' : ''}" data-gsk="${esc(id)}" data-which="${which}" data-tip="${esc(tip)}" aria-label="${esc(info.name)}">`
        + `${locked ? '<span class="ico">锁</span>' : ''}<span class="nm">${esc(info.name)}</span></button>`;
    }).join('')}</div>`;
  }

  /** Bảng mô tả kỹ năng khi rê chuột / bấm vào ô kỹ năng. */
  function showSkillTip(btn, toggle = false) {
    let tip = $('skTip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'skTip'; tip.className = 'sk-tip hidden'; document.body.appendChild(tip); }
    if (toggle && !tip.classList.contains('hidden') && tip.dataset.for === btn.dataset.gsk) { hideSkillTip(); return; }
    const [head, ...rest] = (btn.dataset.tip || '').split('】');
    tip.innerHTML = `<b>${esc(head.replace('【', ''))}</b><div>${esc(rest.join('】')).replace(/\n/g, '<br>')}</div>`;
    tip.dataset.for = btn.dataset.gsk;
    tip.classList.remove('hidden');
    const r = btn.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 16);
    tip.style.width = `${w}px`;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    tip.style.left = `${left}px`;
    const h = tip.offsetHeight;
    tip.style.top = `${r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8}px`;
  }
  function hideSkillTip() { $('skTip')?.classList.add('hidden'); }

  /** Rê chuột / bấm vào ảnh tướng của người khác: xem đầy đủ các kỹ năng của tướng đó. */
  function showGenTip(el, toggle = false) {
    const id = el.dataset.gen;
    const g = id && C.general(id);
    if (!g) return;
    let tip = $('skTip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'skTip'; tip.className = 'sk-tip hidden'; document.body.appendChild(tip); }
    const key = `gen:${id}`;
    if (toggle && !tip.classList.contains('hidden') && tip.dataset.for === key) { hideSkillTip(); return; }
    const ks = (g.kingdoms && g.kingdoms.length > 1 ? g.kingdoms : [g.kingdom]).map((k) => C.KINGDOM[k]?.label ?? k).join(' / ');
    const skills = (g.skills || []).map((sid) => {
      const info = C.catalog.skills[sid] || { name: sid, desc: '' };
      return `<div class="gt-sk"><b>${esc(info.name)}</b> ${esc(info.desc || '')}</div>`;
    }).join('');
    tip.innerHTML = `<b>${esc(g.name)}</b><div class="muted gt-sub">${esc(ks)} · ${g.halfHp} âm dương ngư</div>${skills}`;
    tip.dataset.for = key;
    tip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 16);
    tip.style.width = `${w}px`;
    let left = r.right + 8;
    if (left + w > window.innerWidth - 8) left = r.left - w - 8;
    tip.style.left = `${Math.max(8, left)}px`;
    const h = tip.offsetHeight;
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, r.top))}px`;
  }
  document.addEventListener('mouseover', (e) => {
    const p = e.target.closest?.('#seats .portrait[data-gen]');
    if (p) showGenTip(p);
  });
  document.addEventListener('mouseout', (e) => {
    const p = e.target.closest?.('#seats .portrait[data-gen]');
    if (p && !p.contains(e.relatedTarget)) hideSkillTip();
  });
  // Bấm ảnh tướng người khác (khi không phải đang chọn mục tiêu): bật/tắt bảng kỹ năng (điện thoại)
  document.addEventListener('click', (e) => {
    const p = e.target.closest?.('#seats .portrait[data-gen]');
    if (!p) return;
    const seat = Number(p.closest('.seat')?.dataset.seat);
    if (targetSpec()?.seats.includes(seat)) return;
    showGenTip(p, true);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest?.('.gsk') && !e.target.closest?.('#seats .portrait[data-gen]')) hideSkillTip(); });

  /** Bấm ô kỹ năng dưới ảnh tướng. */
  function clickGenSkill(id, which) {
    const slot = me().generals?.[which];
    const st = skillState(id, which, slot?.revealed);
    if (!st) return;
    if (st.kind === 'use') clickSkill(id);
    else if (st.kind === 'reveal') answer({ kind: 'useSkill', skill: st.skill, cardIds: [], targets: [] });
    else if (st.kind === 'confirm') answer({ kind: 'yes' });
    else if (st.kind === 'choice') answer({ kind: 'choice', index: st.index });
  }

  function renderSkills() {
    const hints = req()?.type === 'play' ? view.skillHints || [] : [];
    const usable = new Map(hints.map((h) => [h.skill, h]));
    // Kỹ năng của tướng nằm dưới ảnh tướng; cột này chỉ còn ký hiệu (Âm Dương Ngư...) và kỹ năng trang bị
    const list = [];
    const mine = new Set(myGeneralSkills().map((s) => s.id));
    for (const h of hints) {
      if (mine.has(h.skill)) continue;
      if (h.skill.startsWith('reveal:') || list.some((s) => s.id === h.skill)) continue;
      list.push({ id: h.skill, name: h.name, gen: h.skill.startsWith('mark:') ? 'Ký hiệu' : 'Trang bị', revealed: true });
    }
    $('skills').innerHTML = list.map((s) => {
      const info = C.catalog.skills[s.id] || { name: s.name || s.id, desc: '' };
      const h = usable.get(s.id);
      // Tướng đang úp: trong lượt của mình bấm vào kỹ năng của nó để lật tướng ngay (kỹ năng tỏa định / bị động có hiệu lực luôn)
      const rv = !s.revealed && s.which ? usable.get(`reveal:${s.which}`) : null;
      const cls = h ? 'usable' : rv ? 'usable revealable' : '';
      const on = sel.skill?.skill === s.id ? ' active' : '';
      const note = h?.reveals ? ' · dùng sẽ lật tướng' : rv ? ' · bấm để lật tướng' : '';
      return `<button type="button" class="skill-btn ${cls}${on}" data-skill="${esc(s.id)}" data-reveal="${rv ? esc(rv.skill) : ''}" title="${esc(`【${info.name}】${info.desc}`)}" ${h || rv ? '' : 'aria-disabled="true"'}>
        <span class="sk-name">${esc(info.name)}</span><small>${esc(s.gen)}${s.revealed ? '' : ' · đang úp'}${note}</small></button>`;
    }).join('');
    $('skills').querySelectorAll('.skill-btn.usable').forEach((b) => {
      b.onclick = () => (usable.has(b.dataset.skill) ? clickSkill(b.dataset.skill) : b.dataset.reveal && answer({ kind: 'useSkill', skill: b.dataset.reveal, cardIds: [], targets: [] }));
    });
  }

  // ---------- Thanh thao tác ----------
  function btn(label, onClick, kind = '', disabled = false) {
    return { label, onClick, kind, disabled };
  }

  function renderAction() {
    const bar = $('actionbar');
    const r = req();
    const buttons = [];
    let prompt = '';
    bar.classList.toggle('asking', !!r);
    if (view.spectator) {
      const cur = players()[view.currentSeat];
      prompt = `<span class="spec-badge">👁 Đang theo dõi</span> <span class="muted">Lượt của <b>${esc(cur?.name ?? '')}</b> — giai đoạn ${esc(PHASE_LABEL[view.phase] ?? '')}. Bấm “Thoát xem” để về sảnh.</span>`;
    } else if (!r) {
      const cur = players()[view.currentSeat];
      prompt = cur?.seat === view.me ? 'Đang xử lý…' : `<span class="muted">Đang chờ <b>${esc(cur?.name ?? '')}</b> — giai đoạn ${esc(PHASE_LABEL[view.phase] ?? '')}.</span>`;
    } else {
      switch (r.type) {
        case 'play': {
          if (sel.hint) {
            const h = sel.hint;
            const real = cardOf(h.cardId)?.name;
            const label = C.info(h.as ?? real).label + (h.as && real && h.as !== real ? ` (bằng ${C.info(real).label})` : '');
            const asChoices = view.hints.filter((x) => x.cardId === h.cardId);
            if (asChoices.length > 1) {
              for (const x of asChoices) buttons.push(btn(`Như ${C.info(x.as ?? cardOf(x.cardId).name).label}`, () => { sel.hint = x; sel.targets = []; renderGame(); }, x === h ? 'primary' : ''));
            }
            const ok = !h.needsTarget || (sel.targets.length >= h.minTargets && sel.targets.length <= h.maxTargets);
            const names = sel.targets.map((t) => esc(pname(t))).join(', ');
            if (h.needsTarget && !sel.targets.length) {
              const range = h.minTargets === h.maxTargets ? `${h.maxTargets}` : `${h.minTargets}–${h.maxTargets}`;
              prompt = `Dùng <b>${esc(label)}</b>: bấm chọn ${range} mục tiêu trên bàn${h.minTargets === 0 ? ' (hoặc bấm "Có" không chọn ai = trùng chú, bỏ lá này để bốc 1 lá)' : ''}.`;
            } else if (h.needsTarget && sel.targets.length < h.maxTargets && sel.targets.length >= h.minTargets) {
              prompt = `Dùng <b>${esc(label)}</b> vào <b>${names}</b>? <span class="muted">(có thể chọn thêm mục tiêu)</span>`;
            } else prompt = `Dùng <b>${esc(label)}</b>${names ? ` vào <b>${names}</b>` : ''}?`;
            buttons.push(btn('Có', () => answer({ kind: 'useCard', cardId: h.cardId, targets: sel.targets, ...(h.as ? { as: h.as } : {}) }), 'primary', !ok));
            buttons.push(btn('Không', () => { sel = emptySel(); renderGame(); }, 'ghost'));
          } else if (sel.skill) {
            const s = sel.skill;
            const info = C.catalog.skills[s.skill] || { name: s.name };
            const [min, max] = skillCardRange(s);
            const parts = [];
            if (s.cards !== 'none') parts.push(`chọn ${min === max ? min : `${min}${Number.isFinite(max) ? `–${max}` : ' trở lên'}`} lá (đã chọn ${sel.cards.length})`);
            if (s.needsTarget) parts.push('chọn 1 mục tiêu');
            prompt = `<b>${esc(info.name)}</b>${parts.length ? `: ${parts.join(', ')}.` : '?'} ${s.reveals ? '<span class="muted">Dùng sẽ lật tướng.</span>' : ''}`;
            const ok = sel.cards.length >= min && sel.cards.length <= max && (!s.needsTarget || sel.targets.length === 1);
            buttons.push(btn(`Dùng ${info.name}`, () => answer({ kind: 'useSkill', skill: s.skill, cardIds: sel.cards, targets: sel.targets }), 'primary', !ok));
            buttons.push(btn('Hủy', () => { sel = emptySel(); renderGame(); }, 'ghost'));
          } else {
            const any = view.hints.length || (view.skillHints || []).some((h) => !h.skill.startsWith('reveal:'));
            prompt = any ? 'Lượt của bạn: bấm lá bài sáng viền để dùng (lá cần mục tiêu: bấm tiếp vào người trên bàn), hoặc bấm kỹ năng sáng.' : 'Không còn lá nào dùng được.';
            for (const h of view.skillHints || []) {
              if (h.skill.startsWith('reveal:')) buttons.push(btn(h.name, () => answer({ kind: 'useSkill', skill: h.skill, cardIds: [], targets: [] }), 'ghost'));
            }
          }
          buttons.push(btn('Kết thúc ra bài', () => answer({ kind: 'endPlay' }), sel.hint || sel.skill ? 'ghost' : (view.hints.length ? '' : 'primary')));
          break;
        }
        case 'respond':
        case 'save': {
          const need = r.type === 'respond' ? r.accept.map((a) => C.info(a).label).join(' hoặc ') : 'Đào';
          prompt = r.type === 'respond'
            ? (r.reason.includes(need) ? `${esc(r.reason).replace(esc(need), `<b>${esc(need)}</b>`)}?` : `${esc(r.reason)} — đánh <b>${esc(need)}</b>?`)
            : r.dying === view.me ? `Bạn đang hấp hối, cần thêm <b>${r.need}</b> lá Đào (hoặc Rượu).` : `<b>${esc(pname(r.dying))}</b> đang hấp hối, cần thêm <b>${r.need}</b> lá Đào.`;
          if (!view.responseOptions.length && !(r.type === 'save' && view.specialSaves?.length)) prompt += ' <span class="muted">Bạn không có lá phù hợp.</span>';
          else if (sel.cards.length === 1) {
            const c = cardOf(sel.cards[0]);
            const as = view.responseOptions.find((o) => o.cardId === sel.cards[0])?.as;
            prompt += ` <br>Đánh <b>${esc(C.info(as ?? c?.name).label)}</b>${as && c && as !== c.name ? ` (bằng ${esc(C.info(c.name).label)})` : ''}?`;
          } else if (view.responseOptions.length) prompt += ' <span class="muted">Bấm lá sáng viền để chọn.</span>';
          buttons.push(btn(sel.cards.length === 1 ? 'Có' : 'Đánh', () => answer({ kind: 'card', cardId: sel.cards[0] }), 'primary', sel.cards.length !== 1));
          if (r.type === 'save') for (const s of view.specialSaves || []) buttons.push(btn(s.name, () => answer({ kind: 'useSkill', skill: s.skill, cardIds: [], targets: [] })));
          if (sel.cards.length === 1) buttons.push(btn('Không', () => { sel = emptySel(); renderGame(); }, 'ghost'));
          buttons.push(btn('Không đánh', () => answer({ kind: 'pass' }), view.responseOptions.length ? 'ghost' : 'primary'));
          break;
        }
        case 'discard':
          prompt = r.reason === 'discardPhase' || !r.reason
            ? `Giai đoạn bỏ bài: bạn có ${view.myHand.length} lá${r.limit !== undefined ? `, giới hạn trữ bài ${r.limit}` : ''} — bấm chọn <b>${r.count}</b> lá muốn bỏ (đã chọn ${sel.cards.length}).`
            : `Phải bỏ <b>${r.count}</b> lá trên tay — bấm chọn lá muốn bỏ (đã chọn ${sel.cards.length}).`;
          if (r.cardIds && r.cardIds.filter((id) => view.myHand.some((c) => c.id === id)).length < view.myHand.length) prompt += ' <span class="muted">Lá mờ không được phép bỏ.</span>';
          buttons.push(btn('Bỏ bài', () => answer({ kind: 'discard', cardIds: sel.cards }), 'primary', sel.cards.length !== r.count));
          // Được bỏ cả trang bị (Anh Hồn...): mở bảng chọn gồm bài trên tay + trang bị
          if (r.cardIds && r.cardIds.some((id) => !view.myHand.some((c) => c.id === id))) {
            prompt = prompt.replace('lá trên tay', 'lá (trên tay hoặc trang bị)');
            buttons.push(btn('Chọn cả trang bị', () => openCardPicker({ ...r, prompt: `Bỏ ${r.count} lá (trên tay hoặc trang bị)`, min: r.count, max: r.count })));
          }
          if (sel.cards.length) buttons.push(btn('Chọn lại', () => { sel.cards = []; renderGame(); }, 'ghost'));
          break;
        case 'chooseCards':
          prompt = `${esc(r.prompt)} <span class="muted">(${r.min === r.max ? r.min : `${r.min}–${r.max}`} lá, đã chọn ${sel.cards.length})</span>`;
          buttons.push(btn('Xác nhận', () => answer({ kind: 'cards', cardIds: sel.cards }), 'primary', sel.cards.length < r.min || sel.cards.length > r.max));
          if (r.cardIds.some((id) => !view.myHand.some((c) => c.id === id))) buttons.push(btn('Xem lá', () => openCardPicker(r)));
          break;
        case 'chooseTargets':
          prompt = `${esc(r.prompt)} <span class="muted">(${r.min === r.max ? r.min : `${r.min}–${r.max}`} người — bấm vào ghế trên bàn)</span>`;
          buttons.push(btn('Xác nhận', () => answer({ kind: 'targets', targets: sel.targets }), 'primary', sel.targets.length < r.min || sel.targets.length > r.max));
          break;
        case 'choose':
          prompt = esc(r.prompt);
          r.options.forEach((o, i) => buttons.push(btn(o, () => answer({ kind: 'choice', index: i }), i === 0 ? 'primary' : '')));
          break;
        case 'confirm': {
          if (r.skill === 'changeToLord') {
            prompt = esc(r.prompt);
            buttons.push(btn('Đổi thành quân chủ', () => answer({ kind: 'yes' }), 'primary'));
            buttons.push(btn('Giữ tướng thường', () => answer({ kind: 'no' })));
            break;
          }
          if (r.skill === 'lacthan' && /Phán định tiếp/.test(r.prompt)) {
            prompt = esc(r.prompt);
            buttons.push(btn('Rút tiếp', () => answer({ kind: 'yes' }), 'primary'));
            buttons.push(btn('Dừng, nhận bài', () => answer({ kind: 'no' }), 'ghost'));
            break;
          }
          if (r.skill === 'mark:yinyang-limit') {
            prompt = esc(r.prompt);
            buttons.push(btn('Dùng (+2 giới hạn)', () => answer({ kind: 'yes' }), 'primary'));
            buttons.push(btn('Không, bỏ bài', () => answer({ kind: 'no' }), 'ghost'));
            break;
          }
          if (r.skill === 'mulligan') {
            prompt = 'Đầu ván: <b>đổi 4 lá bài khởi đầu</b>? Bài trên tay được xào lại vào chồng bài và bốc lại (chỉ 1 lần).';
            buttons.push(btn('Đổi bài', () => answer({ kind: 'yes' }), 'primary'));
            buttons.push(btn('Giữ bài', () => answer({ kind: 'no' })));
            break;
          }
          const info = C.catalog.skills[r.skill];
          prompt = `${esc(r.prompt)}${r.reveal ? ' <span class="muted">Dùng sẽ lật tướng đang úp.</span>' : ''}`;
          buttons.push(btn(info ? `Dùng ${info.name}` : 'Đồng ý', () => answer({ kind: 'yes' }), 'primary'));
          buttons.push(btn('Không', () => answer({ kind: 'no' }), 'ghost'));
          break;
        }
        case 'reveal':
          prompt = 'Đầu lượt: lật tướng đang úp? Lật rồi thì mọi người thấy thế lực của bạn.';
          if (r.canMain && r.canDeputy) buttons.push(btn('Lật cả hai', () => answer({ kind: 'reveal', main: true, deputy: true })));
          if (r.canMain) buttons.push(btn('Lật chủ tướng', () => answer({ kind: 'reveal', main: true, deputy: false })));
          if (r.canDeputy) buttons.push(btn('Lật phó tướng', () => answer({ kind: 'reveal', main: false, deputy: true })));
          buttons.push(btn('Giữ úp', () => answer({ kind: 'reveal', main: false, deputy: false }), 'primary'));
          break;
        case 'chooseGenerals':
          prompt = 'Chọn 2 tướng cùng thế lực.';
          buttons.push(btn('Mở bảng chọn tướng', () => openGeneralPicker(r), 'primary'));
          break;
        default:
          prompt = `Câu hỏi chưa hỗ trợ: ${esc(r.type)}`;
          buttons.push(btn('Bỏ qua', () => answer({ kind: 'pass' })));
      }
    }
    $('prompt').innerHTML = prompt;
    const box = $('buttons');
    box.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btn ${b.kind}`;
      el.textContent = b.label;
      el.disabled = b.disabled;
      el.onclick = b.onClick;
      box.appendChild(el);
    }
  }

  const cardOf = (id) => view.myHand.find((c) => c.id === id);

  function skillCardRange(s) {
    if (s.cards === 'none') return [0, 0];
    const min = s.minCards ?? 1;
    const max = s.maxCards ?? (s.cards === 'one' ? 1 : Infinity);
    return [min, max];
  }

  // ---------- Thao tác ----------
  function clickCard(id) {
    const r = req();
    if (!r) return;
    const can = selectableCards();
    if (!can.has(id) && !selectedCards().includes(id)) return;
    switch (r.type) {
      case 'play': {
        if (sel.skill) { toggleCard(id, skillCardRange(sel.skill)[1]); break; }
        // Bấm lại lá đang chọn = bỏ chọn
        if (sel.hint?.cardId === id) { sel = emptySel(); break; }
        // Bấm lá: lá được đẩy lên, thanh thao tác hỏi "Dùng ... ?" — bấm Có mới dùng
        sel = emptySel();
        sel.hint = view.hints.find((h) => h.cardId === id);
        if (!sel.hint) break;
        // Chỉ có đúng 1 mục tiêu hợp lệ và bắt buộc chọn -> chọn sẵn mục tiêu đó
        if (sel.hint.needsTarget && sel.hint.minTargets >= 1 && sel.hint.targets.length === 1) sel.targets = [...sel.hint.targets];
        break;
      }
      case 'respond': case 'save':
        sel.cards = sel.cards[0] === id ? [] : [id];
        break;
      case 'discard': toggleCard(id, r.count); break;
      case 'chooseCards': toggleCard(id, r.max); break;
    }
    renderGame();
  }

  /** Lá đang chọn đã đủ mục tiêu để dùng chưa. */
  function hintReady(h) {
    return !h.needsTarget || (sel.targets.length >= h.minTargets && sel.targets.length <= h.maxTargets);
  }

  function useSelected() {
    const h = sel.hint;
    if (!h) return;
    answer({ kind: 'useCard', cardId: h.cardId, targets: sel.targets, ...(h.as ? { as: h.as } : {}) });
  }

  function toggleCard(id, max) {
    const i = sel.cards.indexOf(id);
    if (i >= 0) sel.cards.splice(i, 1);
    else if (max === 1) sel.cards = [id];
    else if (sel.cards.length < max) sel.cards.push(id);
  }

  /** Nhấp đúp: dùng/đánh ngay nếu không cần chọn gì thêm. */
  function dblCard(id) {
    const r = req();
    if (!r) return;
    if (r.type === 'play' && !sel.skill) {
      const h = view.hints.find((x) => x.cardId === id);
      if (h && !h.needsTarget && view.hints.filter((x) => x.cardId === id).length === 1) answer({ kind: 'useCard', cardId: id, targets: [], ...(h.as ? { as: h.as } : {}) });
    } else if ((r.type === 'respond' || r.type === 'save') && view.responseOptions.some((o) => o.cardId === id)) {
      answer({ kind: 'card', cardId: id });
    }
  }

  function clickSeat(seat) {
    const spec = targetSpec();
    if (!spec || !spec.seats.includes(seat)) return;
    const i = sel.targets.indexOf(seat);
    if (i >= 0) sel.targets.splice(i, 1);
    else if (spec.max === 1) sel.targets = [seat];
    else if (sel.targets.length < spec.max) sel.targets.push(seat);
    renderGame();
  }

  function clickSkill(id) {
    if (req()?.type !== 'play') return;
    const h = (view.skillHints || []).find((s) => s.skill === id);
    if (!h) return;
    if (sel.skill?.skill === id) { sel = emptySel(); renderGame(); return; }
    sel = emptySel();
    sel.skill = h;
    if (h.cards === 'none' && !h.needsTarget) {
      renderGame(); // vẫn hỏi xác nhận bằng nút "Dùng ..."
      return;
    }
    if (h.needsTarget && h.targets.length === 1) sel.targets = [...h.targets];
    renderGame();
  }

  function answer(response) {
    if (!pending) return;
    send({ t: 'answer', reqId: pending.reqId, response });
    pending = null;
    sel = emptySel();
    closeModal();
    renderGame();
  }

  // ---------- Hộp thoại: chọn tướng ----------
  function openGeneralPicker(r) {
    const chosen = [];
    const any = !!r.anyKingdom; // Loạn tướng: không cần cùng thế lực
    const big = r.candidates.length > 12; // Tự chọn tướng: danh sách dài -> có lọc thế lực + tìm kiếm
    let filter = 'all';
    let query = '';
    const kingdomOf = (id) => C.general(id)?.kingdom;
    const kingdomsOf = (id) => C.general(id)?.kingdoms ?? [kingdomOf(id)];
    const isDual = (id) => kingdomsOf(id).length > 1;
    const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    const sub = r.boss
      ? 'Thảo Phạt: chọn 2 tướng BẤT KỲ (không cần cùng thế lực) — mọi người chơi cùng phe Liên quân. Tướng chọn trước là chủ tướng.'
      : any
      ? 'Loạn tướng: chọn 2 tướng BẤT KỲ (không cần cùng thế lực). Tướng chọn trước là chủ tướng — phe của bạn theo chủ tướng.'
      : big
        ? 'Tự chọn tướng: chọn 2 tướng cùng thế lực. Tướng chọn trước là chủ tướng. Tướng người khác đã chọn không còn trong danh sách.'
        : 'Chọn 2 tướng cùng thế lực. Tướng chọn trước là chủ tướng. Cả hai sẽ được úp cho đến khi bạn lật.';
    const subRules = ' Tướng tím (Dã tâm gia) chỉ làm chủ tướng. Tướng 2 thế lực chỉ làm phó tướng, chủ tướng phải thuộc 1 trong 2 thế lực của nó.';

    const optHTML = (id) => {
      const g = C.general(id) || { name: id, skills: [], halfHp: 0 };
      const role = chosen[0] === id ? 'Chủ tướng' : chosen[1] === id ? 'Phó tướng' : '';
      // Tướng Dã tâm gia (ye) chỉ làm chủ tướng, ghép với phó tướng thế lực bất kỳ
      const k0 = chosen.length ? kingdomOf(chosen[0]) : null;
      const off = !chosen.includes(id) && (
        (chosen.length === 0 && isDual(id))
        || (chosen.length === 1 && kingdomOf(id) === 'ye')
        || (!any && k0 && k0 !== 'ye' && !kingdomsOf(id).includes(k0)));
      const kLabel = kingdomsOf(id).map((k) => C.KINGDOM[k]?.label ?? k).join('/');
      const note = isDual(id) ? ' · chỉ làm phó tướng' : kingdomOf(id) === 'ye' ? ' · tướng tím, chỉ làm chủ tướng' : '';
      const sk = g.skills.map((x) => `<div class="sk"><b>${esc(C.catalog.skills[x]?.name ?? x)}</b> ${esc(C.catalog.skills[x]?.desc ?? '')}</div>`).join('');
      const skinList = C.skinsOf(id);
      const cur = C.currentSkin(id);
      const skinCtl = skinList.length > 1
        ? `<span class="skin-ctl"><span class="skin-btn" data-skin="${esc(id)}" data-dir="-1" role="button" title="Skin trước">‹</span><span class="skin-nm">${esc(cur.name)} (${skinList.indexOf(cur) + 1}/${skinList.length})</span><span class="skin-btn" data-skin="${esc(id)}" data-dir="1" role="button" title="Skin sau">›</span></span>`
        : '';
      return `<button type="button" class="gen-opt ${role ? 'sel' : ''} ${off ? 'off' : ''}" data-id="${esc(id)}" ${off ? 'disabled' : ''}>
        <span class="gen-face">${C.portraitHTML(id)}${skinCtl}</span>
        <div class="info"><b class="nm">${esc(g.name)}</b><span class="muted">${esc(kLabel)} · ${g.halfHp} âm dương ngư${note}</span>${role ? `<br><span class="role">${role}</span>` : ''}${sk}</div>
      </button>`;
    };

    const draw = () => {
      const prevScroll = document.querySelector('.gen-pick')?.scrollTop ?? 0;
      const list = r.candidates.filter((id) => {
        if (chosen.includes(id)) return true;
        if (filter !== 'all' && !kingdomsOf(id).includes(filter)) return false;
        if (query && !norm(C.general(id)?.name).includes(norm(query))) return false;
        return true;
      });
      const counts = {};
      for (const id of r.candidates) for (const k of kingdomsOf(id)) counts[k] = (counts[k] ?? 0) + 1;
      const tabs = big ? `<div class="gen-filter">
          ${['all', 'wei', 'shu', 'wu', 'qun', 'ye'].filter((k) => k === 'all' || counts[k]).map((k) => `<button type="button" class="btn small ${filter === k ? 'primary' : 'ghost'}" data-k="${k}">${k === 'all' ? `Tất cả (${r.candidates.length})` : `${esc(C.KINGDOM[k]?.label ?? k)} (${counts[k] ?? 0})`}</button>`).join('')}
          <input id="gpSearch" class="field" placeholder="Tìm tên tướng…" value="${esc(query)}">
        </div>` : '';
      const picked = chosen.length ? `<span class="muted">Đã chọn: ${chosen.map((id, i) => `${i ? 'Phó' : 'Chủ'} tướng <b>${esc(C.general(id)?.name ?? id)}</b>`).join(' · ')}</span>` : '';
      openModal(`<div class="dialog ${big ? 'wide' : ''}">
        <h2>Chọn tướng</h2>
        <p class="sub">${sub}${subRules}</p>
        ${tabs}
        <div class="gen-pick">${list.map(optHTML).join('') || '<div class="empty">Không có tướng phù hợp.</div>'}</div>
        <div class="foot"><span class="grow" id="pickTimer"></span>${picked}<button type="button" class="btn ghost" id="gpReset">Chọn lại</button><button type="button" class="btn primary" id="gpOk" ${chosen.length === 2 ? '' : 'disabled'}>Xác nhận</button></div>
      </div>`);
      const pick = document.querySelector('.gen-pick');
      if (pick) pick.scrollTop = prevScroll;
      document.querySelectorAll('.skin-btn').forEach((b) => {
        b.onclick = (ev) => { ev.stopPropagation(); C.cycleSkin(b.dataset.skin, Number(b.dataset.dir)); draw(); };
      });
      document.querySelectorAll('.gen-opt').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.id;
          const i = chosen.indexOf(id);
          if (i >= 0) chosen.splice(i, 1); else if (chosen.length < 2) chosen.push(id);
          draw();
        };
      });
      document.querySelectorAll('.gen-filter [data-k]').forEach((b) => { b.onclick = () => { filter = b.dataset.k; draw(); }; });
      const sInput = $('gpSearch');
      if (sInput) {
        sInput.oninput = () => {
          query = sInput.value;
          const pos = sInput.selectionStart;
          draw();
          const again = $('gpSearch');
          again.focus();
          again.setSelectionRange(pos, pos);
        };
      }
      $('gpReset').onclick = () => { chosen.length = 0; draw(); };
      $('gpOk').onclick = () => answer({ kind: 'generals', main: chosen[0], deputy: chosen[1] });
    };
    draw();
  }

  // ---------- Hộp thoại: chọn lá không nằm trên tay ----------
  function findCard(id) {
    const all = [...(pending?.request?.cards || []), ...view.myHand];
    for (const p of view.players) all.push(...Object.values(p.equips || {}), ...(p.judgeArea || []), ...(p.special || []));
    return all.find((c) => c && c.id === id);
  }

  function openCardPicker(r) {
    const draw = () => {
      const faces = r.cardIds.map((id) => {
        const c = findCard(id);
        const cls = sel.cards.includes(id) ? 'selected' : '';
        return c ? C.cardHTML(c, { cls }) : `<div class="card back ${cls}" data-card="${id}"><span class="back-seal">?</span></div>`;
      }).join('');
      openModal(`<div class="dialog">
        <h2>${esc(r.prompt)}</h2>
        <p class="sub">Chọn ${r.min === r.max ? r.min : `${r.min}–${r.max}`} lá.</p>
        <div class="card-pick">${faces}</div>
        <div class="foot"><button type="button" class="btn primary" id="cpOk" ${sel.cards.length < r.min || sel.cards.length > r.max ? 'disabled' : ''}>Xác nhận</button></div>
      </div>`);
      document.querySelectorAll('.card-pick .card').forEach((el) => {
        el.onclick = () => { toggleCard(Number(el.dataset.card), r.max); draw(); renderAction(); };
      });
      $('cpOk').onclick = () => answer(r.type === 'discard' ? { kind: 'discard', cardIds: sel.cards } : { kind: 'cards', cardIds: sel.cards });
    };
    draw();
  }

  // ---------- Kết thúc ván ----------
  const CAT = [['damage', 'Sát thương'], ['kill', 'Hạ gục'], ['heal', 'Hồi máu'], ['cards', 'Hủy/lấy bài'], ['hpLoss', 'Làm mất máu'],
    ['jail', 'Tù'], ['control', 'Khống chế'], ['support', 'Hỗ trợ'], ['end', 'Kết thúc ván']];
  const FACTION_LABEL = (f) => (f === 'careerist' ? 'Dã tâm gia' : f === 'lienquan' ? 'Liên quân' : f === 'boss' ? 'Boss' : C.KINGDOM[f]?.label ?? f);
  const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

  function showGameOver(result, scores, match) {
    gameOverShown = true;
    const winner = result.winner;
    const mine = scores?.players.find((p) => p.seat === view?.me);
    const won = mine ? mine.winner : false;
    const bossMode = !!view?.boss;
    let body;
    if (scores) {
      const rows = [...scores.players].filter((p) => !bossMode || p.seat !== view.boss.seat).sort((a, b) => b.total - a.total).map((p) => {
        const r = match?.ratings?.[p.seat];
        const elo = r && r.before !== null && r.after !== null
          ? `<span class="${r.after >= r.before ? 'elo-up' : 'elo-down'}">${r.after}<br><small>${r.after >= r.before ? '+' : ''}${r.after - r.before}</small></span>` : '<span class="muted">—</span>';
        const names = p.generals.map((id) => C.general(id)?.name ?? id).join(' + ');
        const detail = CAT.filter(([k]) => p.breakdown[k]).map(([k, l]) => `${l} ${p.breakdown[k] > 0 ? '+' : ''}${fmt(p.breakdown[k])}`).join(' · ');
        const titles = p.titles.map((t) => `<span class="title-chip ${t === 'MVP' ? 'mvp' : ''}">${esc(t)}</span>`).join('');
        return `<tr class="${p.winner ? 'win' : ''} ${p.seat === view?.me ? 'me' : ''}">
          <td>${C.portraitHTML(p.generals[0])}</td>
          <td><b>${esc(p.name)}</b>${p.seat === view?.me ? ' (bạn)' : ''}${p.alive ? '' : ' <span class="muted">✝</span>'}<br>
            <small class="muted">${esc(names)} · ${esc(bossMode ? 'Liên quân' : FACTION_LABEL(p.faction))}${p.winner ? ' · <b>Thắng</b>' : ''}</small>
            ${titles ? `<div class="titles">${titles}</div>` : ''}
            <div class="score-detail">${esc(detail || 'Không có điểm hành động')}</div></td>
          <td class="num total">${fmt(p.total)}</td>
          ${bossMode ? '' : `<td class="num">${elo}</td>`}
        </tr>`;
      }).join('');
      body = `<div class="score-wrap"><table class="score-table">
        <thead><tr><th></th><th>Người chơi</th><th class="num">${bossMode ? 'Chiến công' : 'Điểm'}</th>${bossMode ? '' : '<th class="num">Elo</th>'}</tr></thead>
        <tbody>${rows}</tbody></table></div>
        <p class="muted" style="font-size:13px;margin:10px 0 0">${bossMode ? `Thảo Phạt ${esc(view.boss.name)} (${esc(view.boss.difficultyLabel)}) · ${view.boss.round} vòng. Chiến công được cộng vào bảng xếp hạng Thảo Phạt (không tính Elo).` : match?.ranked ? 'Ván đã được lưu và tính Elo cho người chơi có tài khoản.' : match ? 'Ván đã được lưu (không tính Elo: không có người thắng hoặc không ai có tài khoản).' : ''}
        ${account ? '' : ' Đăng nhập tài khoản để được lưu điểm và xếp hạng.'}</p>`;
    } else body = '<p class="muted">Không có bảng điểm.</p>';
    const title = !winner ? 'Ván hòa' : bossMode ? (winner === 'Liên quân' ? `Hạ được ${view.boss.name}!` : `${view.boss.name} thắng`) : won ? 'Bạn thắng' : `${winner} thắng`;
    openModal(`<div class="dialog" style="width:min(720px,100%)">
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(result.reason === 'victory' ? `Kết thúc sau ${result.turns} lượt.` : 'Không còn bài hoặc quá số lượt tối đa.')}</p>
      ${body}
      <div class="foot">${match ? `<a class="btn ghost" href="/ranking.html#van-${esc(match.id)}" target="_blank" rel="noopener">Xem chi tiết ván</a>` : ''}<button type="button" class="btn primary" id="goBack">Về phòng chờ</button></div>
    </div>`);
    $('goBack').onclick = () => {
      gameOverShown = false;
      closeModal();
      view = null;
      prev.first = true; prev.hp.clear(); prev.hand.clear(); prev.played.clear();
      narration = [];
      if (room) { show('room'); renderRoom(); } else show('lobby');
    };
  }

  // ---------- Hộp thoại chung, thông báo ----------
  function openModal(html) { const m = $('modal'); m.innerHTML = html; m.classList.remove('hidden'); }
  function closeModal() { if (!gameOverShown) { $('modal').classList.add('hidden'); $('modal').innerHTML = ''; } }
  let toastTimer = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text; t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  function addLog(line) {
    const d = document.createElement('div');
    d.textContent = line;
    if (/^—— Lượt/.test(line)) d.className = 'turn';
    const log = $('log');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.appendChild(d);
    while (log.children.length > 400) log.firstChild.remove();
    if (atBottom) log.scrollTop = log.scrollHeight;
    if (!/^—— Lượt/.test(line)) narration = [line, narration[0]].filter(Boolean);
  }
  function addChat(from, text) {
    const d = document.createElement('div');
    d.innerHTML = `<b>${esc(from)}:</b> ${esc(text)}`;
    $('chatLog').appendChild(d);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    if ($('chatLog').classList.contains('hidden')) toast(`${from}: ${text}`);
  }

  // ---------- Đồng hồ ----------
  setInterval(() => {
    const t = $('timer');
    if (!pending) { t.style.width = '0'; return; }
    const left = Math.max(0, pending.at + pending.timeoutMs - Date.now());
    const pct = (left / pending.timeoutMs) * 100;
    t.style.width = `${pct}%`;
    t.classList.toggle('low', left < 6000);
    const pt = document.getElementById('pickTimer');
    if (pt) pt.textContent = `Còn ${Math.ceil(left / 1000)} giây`;
  }, 200);

  // ---------- Sự kiện giao diện ----------
  $('name').value = myName;
  $('loginForm').onsubmit = (e) => {
    e.preventDefault();
    myName = $('name').value.trim() || 'Người chơi';
    store.set('tqs_name', myName);
    if (!ws) connect(); else sendHello();
  };
  $('createForm').onsubmit = (e) => {
    e.preventDefault();
    const seats = Number($('roomSeats').value);
    autoFillWanted = $('autoFill').checked ? seats - 1 : 0;
    const isBoss = $('roomKind').value === 'boss';
    send({ t: 'createRoom', name: $('roomName').value.trim() || `Phòng của ${myName}`, seats, timeoutSec: Number($('roomTimeout').value),
      deck: $('roomDeck').value, mode: $('roomMode').value, mulligan: $('roomMulligan').checked, lord: $('roomLord').checked,
      ...(isBoss ? { boss: $('roomBoss').value, bossDifficulty: $('roomBossDiff').value } : {}) });
  };
  $('btnStart').onclick = () => send({ t: 'start' });
  $('btnAddBot').onclick = () => send({ t: 'addBot' });
  $('btnRemoveBot').onclick = () => send({ t: 'removeBot' });
  $('btnSurrender').onclick = () => {
    if (!confirm('Đầu hàng? Tướng của bạn sẽ chết ngay và không được tính thắng. Bạn vẫn có thể ở lại xem.')) return;
    send({ t: 'surrender' });
  };
  const dissolve = () => {
    if (!confirm(room?.status === 'playing' ? 'Giải tán phòng? Ván đang chơi sẽ bị hủy (không tính điểm) và mọi người về sảnh.' : 'Giải tán phòng? Mọi người sẽ về sảnh.')) return;
    send({ t: 'dissolveRoom' });
  };
  $('btnDissolve').onclick = dissolve;
  $('btnDissolveRoom').onclick = dissolve;
  $('btnLeave').onclick = () => {
    if (!spectating && room?.status === 'playing' && !confirm('Rời phòng giữa ván? Máy sẽ chơi thay bạn đến hết ván.')) return;
    send({ t: 'leaveRoom' });
  };
  $('sideToggle').onclick = () => $('side').classList.toggle('open');
  document.querySelectorAll('#side .tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#side .tabs button').forEach((x) => x.classList.toggle('on', x === b));
      $('log').classList.toggle('hidden', b.dataset.tab !== 'log');
      $('chatLog').classList.toggle('hidden', b.dataset.tab !== 'chat');
    };
  });
  $('chatForm').onsubmit = (e) => {
    e.preventDefault();
    const text = $('chatText').value.trim();
    if (text) send({ t: 'chat', text });
    $('chatText').value = '';
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (sel.hint || sel.skill || sel.cards.length || sel.targets.length)) { sel = emptySel(); renderGame(); }
    // Enter = "Có": dùng lá đang chọn / đánh lá đang chọn (không áp dụng khi đang gõ chat)
    if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') {
      const r = req();
      if (r?.type === 'play' && sel.hint && !sel.skill && hintReady(sel.hint)) useSelected();
      else if ((r?.type === 'respond' || r?.type === 'save') && sel.cards.length === 1) answer({ kind: 'card', cardId: sel.cards[0] });
    }
  });

  // ---------- Âm thanh: lồng tiếng kỹ năng / tử trận theo skin đang chọn ----------
  let soundOn = store.get('tqs_sound') !== 'off';
  let lastVoice = null;
  function renderSound() {
    const b = $('btnSound');
    if (b) { b.innerHTML = soundOn ? '🔊<span class="lbl"> Tiếng</span>' : '🔇<span class="lbl"> Tắt tiếng</span>'; b.title = soundOn ? 'Bấm để tắt lồng tiếng' : 'Bấm để bật lồng tiếng'; }
  }
  function playSfx(m) {
    if (!soundOn) return;
    const skin = C.currentSkin(m.general);
    if (!skin) return;
    const list = m.kind === 'death' ? (skin.death ? [skin.death] : []) : skin.voices[m.skill] || [];
    if (!list.length) return;
    try {
      if (lastVoice) lastVoice.pause();
      lastVoice = new Audio(list[Math.floor(Math.random() * list.length)]);
      lastVoice.volume = 0.8;
      lastVoice.play().catch(() => { /* trình duyệt chặn tự phát khi chưa bấm gì */ });
    } catch { /* bỏ qua */ }
  }
  if ($('btnSound')) {
    renderSound();
    $('btnSound').onclick = () => { soundOn = !soundOn; store.set('tqs_sound', soundOn ? 'on' : 'off'); renderSound(); if (!soundOn && lastVoice) lastVoice.pause(); };
  }

  // ---------- Tài khoản ----------
  function renderAccount() {
    const b = $('accBadge');
    if (account) {
      b.innerHTML = `<b>${esc(account.displayName)}</b> · ${esc(account.rank)} · Elo <b>${account.rating}</b>`;
      b.classList.remove('hidden');
      $('btnLogout').classList.remove('hidden');
    } else {
      b.classList.add('hidden');
      $('btnLogout').classList.add('hidden');
    }
  }
  async function refreshAccount() {
    if (!authToken) return;
    try {
      const r = await fetch('/api/account/me', { headers: { 'x-account-token': authToken } });
      if (r.ok) { account = await r.json(); renderAccount(); }
    } catch { /* bỏ qua */ }
  }
  let registerMode = false;
  document.querySelectorAll('[data-ltab]').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('[data-ltab]').forEach((x) => x.classList.toggle('on', x === b));
      $('loginForm').classList.toggle('hidden', b.dataset.ltab !== 'guest');
      $('accountForm').classList.toggle('hidden', b.dataset.ltab !== 'account');
    };
  });
  $('accSwitch').onclick = () => {
    registerMode = !registerMode;
    $('accDisplay').classList.toggle('hidden', !registerMode);
    $('accSubmit').textContent = registerMode ? 'Đăng ký' : 'Đăng nhập';
    $('accSwitch').textContent = registerMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký';
    $('accPass').autocomplete = registerMode ? 'new-password' : 'current-password';
  };
  $('accountForm').onsubmit = async (e) => {
    e.preventDefault();
    $('accErr').classList.add('hidden');
    const body = { username: $('accUser').value.trim(), password: $('accPass').value, displayName: $('accDisplay').value.trim() };
    try {
      const r = await fetch(registerMode ? '/api/account/register' : '/api/account/login', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Không đăng nhập được');
      authToken = j.token; sess.set('tqs_auth', authToken);
      account = j.profile;
      myName = account.displayName; store.set('tqs_name', myName);
      $('accPass').value = '';
      if (!ws) connect(); else sendHello();
    } catch (err) {
      $('accErr').textContent = err.message; $('accErr').classList.remove('hidden');
    }
  };
  $('btnLogout').onclick = async () => {
    if (room?.status === 'playing') { toast('Đang trong ván, hãy đăng xuất sau khi ván kết thúc.'); return; }
    try { await fetch('/api/account/logout', { method: 'POST', headers: { 'x-account-token': authToken } }); } catch { /* bỏ qua */ }
    authToken = ''; sess.set('tqs_auth', ''); account = null; pendingLogout = true;
    renderAccount();
    sendHello();
    toast('Đã đăng xuất. Bạn đang chơi như khách.');
  };

  // Mở trang mới (không phải tải lại): về màn hình đăng nhập, chỉ điền sẵn tên khách
  if (token || authToken) connect();
})();
