// ============================================================
// HegemonyGame: chế độ Quốc Chiến, kế thừa engine lõi.
// Chỉ GHI ĐÈ các điểm móc của Game, không sửa luật lõi.
// ============================================================
import { buildStandardDeck } from '../core/cards.js';
import { Game, type GameOptions } from '../core/game.js';
import './cards.js'; // đăng ký các cẩm nang riêng của Quốc Chiến
import type { EventName } from '../core/events.js';
import { shuffle } from '../core/rng.js';
import type { Card, CardName, Controller, Request, RespondContext, Response, UseMode, Zone } from '../core/types.js';
import { viewFor, type PlayerView, type SkillHint, type SlotView } from '../core/view.js';
import { FEMALE_GENERALS, GENERALS, getGeneral, isDualGeneral, isLordId, kingdomsOf, lordVersionOf, isGeneralId, isPair, KINGDOM_LABEL, KINGDOMS, type Kingdom } from './generals.js';
import { EQUIP_SKILLS, GLOBAL_SKILLS, SKILLS, type ActiveSkill, type Skill, type SkillTrigger } from './skills.js';
import * as mech from './mechanics.js';
import { BOSS_DIFFICULTY, BOSSES, isBossId, type BossDef, type BossDifficulty, type BossView } from './boss.js';
import { installTreasures } from './treasures.js';
import { halberdTargets, installQcCards, peaceSpellBonus, sixSwordsBonus } from './qc-cards.js';
import { EQUIP_SLOTS } from '../core/types.js';

export interface HeroSlot {
  generalId: string;
  revealed: boolean;
  /** Tướng đã bị loại khỏi ván (移除): không còn kỹ năng, không lật được nữa. */
  removed?: boolean;
  /** Tướng mất hết kỹ năng (Đoạn Trường) nhưng vẫn còn trên bàn. */
  noSkills?: boolean;
  /** Thiết Kỵ: kỹ năng không phải tỏa định của tướng này bị vô hiệu trong lượt có số thứ tự này. */
  suppressedTurn?: number;
}

export interface HeroState {
  main: HeroSlot; // chủ tướng
  deputy: HeroSlot; // phó tướng
  careerist: boolean; // dã tâm gia
  /**
   * Phe dã tâm gia (野心家) có đồng minh: ghế của người cầm đầu. Người được "Lạp Long Nhân Tâm" gia nhập cùng nhóm.
   * Bỏ trống = dã tâm gia một mình (ví dụ do thế lực quá nửa).
   */
  careeristGroup?: number;
  /** Tướng tím (Dã tâm gia) đã lộ (暴露野心): đã nhận dấu, đã xét Lạp Long Nhân Tâm. */
  exposed?: boolean;
  /** Ký hiệu: âm dương ngư, tiên khu, châu liên bích hợp, dã tâm gia (dùng thay được cả 3 loại kia). */
  marks: { yinyang: number; pioneer: number; pair: number; ambition: number };
  /** Đã xử lý phần thưởng khi lật đủ 2 tướng chưa. */
  bothRevealedHandled: boolean;
  /**
   * Thế lực đã được xác định (chốt ở lần lật tướng đầu tiên). Sau đó dù tướng bị úp lại (Trần Đăng, Cận Hãm...)
   * hay đổi phó tướng, người này vẫn giữ thế lực đã xác định.
   */
  fixedKingdom?: Kingdom;
}

export type SlotKey = 'main' | 'deputy';

export interface HegemonyPlayerSetup {
  name: string;
  controller: Controller;
}

export interface HegemonyOptions extends Omit<GameOptions, 'revealTeams'> {
  /** Số tướng ứng viên mỗi người (tự giảm nếu không đủ tướng). */
  candidates?: number;
  /** Danh sách id tướng được dùng trong ván. Mặc định: tất cả. */
  generalPool?: string[];
  /** Bỏ qua bước chọn tướng (dùng cho test): [chủ tướng, phó tướng] cho từng ghế. */
  presetGenerals?: [string, string][];
  /**
   * Chế độ chọn tướng:
   * - 'normal': chia ngẫu nhiên vài ứng viên, chọn 2 tướng cùng thế lực (luật thường)
   * - 'free': tự chọn — xem toàn bộ danh sách tướng, chọn 2 tướng cùng thế lực (lần lượt theo ghế, không trùng)
   * - 'chaos': loạn tướng — chia 3 tướng ngẫu nhiên, chọn 2 tướng bất kỳ, không cần cùng thế lực.
   *   Thế lực của người chơi là thế lực của CHỦ TƯỚNG.
   */
  mode?: GameMode;
  /** Sau khi chia 4 lá đầu, mỗi người được chọn đổi toàn bộ một lần. */
  mulligan?: boolean;
  /** Cho phép đổi chủ tướng thành quân chủ (Lưu Bị, Trương Giác, Tào Tháo, Tôn Quyền – Quân). */
  lordConvert?: boolean;
  /** Chế độ Thảo Phạt (đánh boss): boss ngồi ghế CUỐI, các ghế còn lại là Liên quân. */
  boss?: { id: string; difficulty?: BossDifficulty };
}

export type GameMode = 'normal' | 'free' | 'chaos';
export const GAME_MODES: Record<GameMode, { label: string; desc: string }> = {
  normal: { label: 'Bình thường', desc: 'Chia ngẫu nhiên vài tướng, chọn 2 tướng cùng thế lực.' },
  free: { label: 'Tự chọn tướng', desc: 'Xem toàn bộ danh sách tướng, tự chọn 2 tướng cùng thế lực (chọn lần lượt, không trùng người khác).' },
  chaos: { label: 'Loạn tướng', desc: 'Chia 3 tướng ngẫu nhiên, chọn 2 tướng bất kỳ, không cần cùng thế lực. Thế lực theo chủ tướng.' },
};

interface SkillEntry {
  skill: Skill;
  which: SlotKey;
  slot: HeroSlot;
}

/** Ký hiệu được dùng như kỹ năng chủ động. */
export const MARK_SKILL = {
  yinyang: 'mark:yinyang',
  /** Âm Dương Ngư: +2 giới hạn trữ bài (hỏi ở đầu giai đoạn bỏ bài). */
  yinyangLimit: 'mark:yinyang-limit',
  pioneer: 'mark:pioneer',
  /** Châu Liên Bích Hợp: bốc 2 lá. */
  pair: 'mark:pair',
  /** Châu Liên Bích Hợp: dùng như Đào. */
  pairTao: 'mark:pair-tao',
} as const;

const SLOT_LABEL: Record<SlotKey, string> = { main: 'chủ tướng', deputy: 'phó tướng' };

/** Ô giả cho kỹ năng đến từ trang bị: coi như đã lật, không bao giờ hỏi lật tướng. */
const EQUIPMENT_SLOT: HeroSlot = { generalId: '', revealed: true };

export class HegemonyGame extends Game {
  readonly heroes: HeroState[] = [];
  /** Tướng úp mà từng người đã được biết (qua Tri Kỷ Tri Bỉ). */
  private readonly known = new Map<number, Set<string>>();

  /** Ghi nhận `viewer` đã biết tướng `generalId` (sẽ hiện trong view của họ dù tướng còn úp). */
  learnGeneral(viewer: number, generalId: string): void {
    const set = this.known.get(viewer) ?? new Set<string>();
    set.add(generalId);
    this.known.set(viewer, set);
  }
  private anyRevealed = false;
  /** Có kỹ năng nào cấm lật tướng không (tính 1 lần cho nhanh). */
  private readonly revealBlockers = Object.values(SKILLS).some((s) => s.blockReveal);
  private readonly candidateCount: number;
  private readonly pool: string[];
  readonly mode: GameMode;
  private readonly lordConvert: boolean;
  private readonly mulligan: boolean;

  // ---------- Chế độ Thảo Phạt (đánh boss) ----------
  /** Ghế của boss (null = ván thường). */
  readonly bossSeat: number | null = null;
  readonly bossDef: BossDef | null = null;
  readonly bossDifficulty: BossDifficulty = 'normal';
  /** Giai đoạn hiện tại của boss (0 = đầu tiên). */
  bossPhase = 0;
  /** Số lượt boss đã đi (= số vòng). */
  bossRound = 0;
  /** Quân lương còn lại (mỗi lần hồi sinh tốn 1). */
  bossFood = 0;
  /** Thù hận của boss với từng ghế. */
  readonly bossThreat: number[] = [];
  /** Ghế đang chờ hồi sinh -> số lượt boss còn phải chờ. */
  readonly bossReviving = new Map<number, number>();
  /** Ký hiệu riêng của boss (Trương Giác: Hoàng Cân). */
  bossTokens = 0;
  /** Boss nhiều mạng (Mạnh Hoạch): số lần đã bắt. */
  bossCaptures = 0;
  private readonly bossCounters = new Map<string, number>();
  /** Số người chơi đã đi kể từ lượt boss gần nhất; người đi gần nhất. */
  private bossSince = 0;
  private bossLastPlayer = -1;

  constructor(setups: HegemonyPlayerSetup[], options: HegemonyOptions = {}) {
    super(
      setups.map((s) => ({ name: s.name, team: '?', maxHp: 1, controller: s.controller })),
      { ...options, deck: options.deck ?? buildStandardDeck(), revealTeams: false },
    );
    this.mode = options.mode ?? 'normal';
    this.mulligan = options.mulligan ?? false;
    this.candidateCount = this.mode === 'chaos' ? 3 : options.candidates ?? 5;
    this.pool = (options.generalPool ?? GENERALS.map((g) => g.id)).filter((id) => !isLordId(id) && !isBossId(id));
    this.lordConvert = options.lordConvert ?? false;
    if (options.boss) {
      const def = BOSSES[options.boss.id];
      if (!def) throw new Error(`Không có boss "${options.boss.id}"`);
      if (setups.length < 3 || setups.length > 6) throw new Error('Thảo Phạt cần 2–5 người chơi và 1 boss');
      this.bossSeat = setups.length - 1;
      this.bossDef = def;
      this.bossDifficulty = options.boss.difficulty && BOSS_DIFFICULTY[options.boss.difficulty] ? options.boss.difficulty : 'normal';
      this.bossFood = BOSS_DIFFICULTY[this.bossDifficulty].food;
      for (let i = 0; i < setups.length; i++) this.bossThreat.push(0);
      this.installBossMode();
    }
    installTreasures(this);
    installQcCards(this);

    if (options.presetGenerals) {
      options.presetGenerals.forEach(([m, d], seat) => {
        if (seat === this.bossSeat) return;
        if (!this.isValidPair(m, d)) throw new Error(`Cặp tướng không hợp lệ ở ghế ${seat}: ${m}, ${d}`);
        this.assignGenerals(seat, m, d);
      });
    }

    this.installSkillDispatcher();
    this.bus.on('turnStart', async ({ seat }) => {
      // Quân chủ: lật chủ tướng ngay đầu lượt đầu tiên
      const h = this.heroes[seat];
      if (h && isLordId(h.main.generalId) && !h.main.revealed) await this.reveal(seat, 'main');
      while (this.pendingRecruit.length) await this.offerRecruit(this.pendingRecruit.shift()!);
      await this.askRevealAtTurnStart(seat);
    });
    // Quân chủ chết: mọi người cùng thế lực trở thành dã tâm gia
    this.bus.on('death', ({ seat }) => {
      if (!this.isLord(seat)) return;
      const k = this.realKingdom(seat);
      for (const q of this.alivePlayers()) {
        const hq = this.heroes[q.seat];
        if (hq && this.realKingdom(q.seat) === k) {
          hq.careerist = true;
          q.team = this.teamLabel(q.seat);
        }
      }
      this.say(`Quân chủ ${getGeneral(this.heroes[seat].main.generalId).name} tử trận: người thế lực ${KINGDOM_LABEL[k]} trở thành dã tâm gia.`);
    }, 50);
    // Thống kê trong lượt (cho kỹ năng): số lá đã dùng, sát thương đã gây, lá bị bỏ ở giai đoạn bỏ bài
    this.bus.on('cardUsed', ({ seat, card, as }) => {
      if (card.id >= 0) this.usedAs.set(card.id, as);
      if (seat !== this.state.currentSeat) return;
      const f = this.player(seat).flags;
      f.stat_used = (f.stat_used ?? 0) + 1;
      if (this.state.phase === 'play') f.stat_usedPlay = (f.stat_usedPlay ?? 0) + 1;
    }, 100);
    this.bus.on('damageDealt', ({ source, amount }) => {
      if (source === null || !this.player(source).alive) return;
      const f = this.player(source).flags;
      f.stat_dmg = (f.stat_dmg ?? 0) + amount;
      if (source === this.state.currentSeat && this.state.phase === 'play') f.stat_dmgPlay = (f.stat_dmgPlay ?? 0) + amount;
    }, 100);
    this.bus.on('cardsMoved', ({ cardIds, from, reason }) => {
      if (reason === 'discardPhase' && from.kind === 'hand') this.lastDiscardPhase = { seat: from.seat, turn: this.state.turnCount, ids: [...cardIds] };
    }, 100);
    this.bus.on('turnEnd', () => {
      for (const [seat, list] of this.granted) this.granted.set(seat, list.filter((x) => !x.turnOnly));
    });
    this.bus.on('death', ({ seat, killer }) => this.rewardOrPunish(seat, killer));
  }

  // ==========================================================
  // Chọn tướng
  // ==========================================================

  override async setup(): Promise<void> {
    if (this.started) return;
    if (this.bossSeat !== null) {
      if (this.playerSeats().some((s) => !this.heroes[s])) await this.chooseGenerals();
      this.setupBoss();
    } else if (this.heroes.length === 0) await this.chooseGenerals();
    if (this.lordConvert && this.bossSeat === null) await this.offerLords();
    await super.setup();
    if (this.mulligan) await this.offerMulligan();
  }

  // ---------- Quân chủ (君主) ----------

  /** Ai có chủ tướng có bản quân chủ (và không trùng với người khác) được hỏi có đổi thành quân chủ không. */
  private async offerLords(): Promise<void> {
    for (const p of this.state.players) {
      const h = this.heroes[p.seat];
      if (!h) continue;
      const lord = lordVersionOf(h.main.generalId);
      if (!lord) continue;
      if (this.heroes.some((x, s) => s !== p.seat && x && x.main.generalId === h.main.generalId)) continue;
      const res = await this.ask({ type: 'confirm', seat: p.seat, skill: 'changeToLord', reveal: false,
        prompt: `Đổi chủ tướng ${getGeneral(h.main.generalId).name} thành quân chủ ${getGeneral(lord).name}? Quân chủ sẽ lật ngay đầu lượt đầu tiên.` });
      if (res.kind !== 'yes') continue;
      h.main = { generalId: lord, revealed: false };
      p.maxHp = p.hp = Math.floor((this.fishOf(lord, 'main') + this.fishOf(h.deputy.generalId, 'deputy')) / 2);
      this.tell(p.seat, `Bạn trở thành quân chủ ${getGeneral(lord).name}.`);
    }
  }

  /** Quân chủ còn sống của thế lực `kingdom` (đã lật hoặc chưa), hoặc null. includeDead: tính cả quân chủ đã chết. */
  lordOf(kingdom: string, includeDead = false): number | null {
    const p = this.state.players.find((q) => (includeDead || q.alive) && this.heroes[q.seat] && isLordId(this.heroes[q.seat].main.generalId)
      && getGeneral(this.heroes[q.seat].main.generalId).kingdom === kingdom);
    return p ? p.seat : null;
  }

  /** `seat` là quân chủ. */
  isLord(seat: number): boolean {
    return !!this.heroes[seat] && isLordId(this.heroes[seat].main.generalId);
  }

  /** Đổi bài khởi đầu: mọi người cùng lúc chọn có đổi không; ai đổi thì trả hết bài vào chồng, xào lại, bốc lại bằng số đó. */
  private async offerMulligan(): Promise<void> {
    const seats = this.alivePlayers().map((p) => p.seat);
    const answers = await Promise.all(seats.map((seat) => this.ask({
      type: 'confirm', seat, skill: 'mulligan', reveal: false,
      prompt: 'Đổi bài khởi đầu? Toàn bộ bài trên tay được xào lại vào chồng bài và bốc lại số lá như cũ (chỉ được đổi 1 lần).',
    }).then((r) => r.kind === 'yes')));
    for (const [i, seat] of seats.entries()) {
      if (!answers[i]) continue;
      const p = this.player(seat);
      const n = p.hand.length;
      if (!n) continue;
      await this.moveCards([...p.hand], { kind: 'hand', seat }, { kind: 'draw' }, 'mulligan');
      shuffle(this.state.drawPile, this.rng);
      await this.draw(seat, n, 'deal');
      this.say(`${p.name} đổi bài khởi đầu.`);
    }
  }

  /**
   * Cặp tướng hợp lệ:
   * - Tướng Dã tâm gia (tướng tím) chỉ làm chủ tướng; phó tướng là tướng thường bất kỳ (kể cả tướng 2 thế lực).
   * - Tướng 2 thế lực chỉ làm phó tướng; chủ tướng phải thuộc 1 trong 2 thế lực của nó.
   * - Còn lại: 2 tướng cùng thế lực. Chế độ Loạn tướng bỏ qua thế lực (vẫn giữ 2 quy tắc vị trí ở trên).
   */
  isValidPair(main: unknown, deputy: unknown): boolean {
    if (!isGeneralId(main) || !isGeneralId(deputy) || main === deputy) return false;
    const km = getGeneral(main).kingdom;
    if (getGeneral(deputy).kingdom === 'ye') return false; // tướng Dã tâm gia chỉ làm chủ tướng
    if (isDualGeneral(main)) return false; // tướng 2 thế lực chỉ làm phó tướng
    return this.mode === 'chaos' || this.bossSeat !== null || km === 'ye' || kingdomsOf(deputy).includes(km);
  }

  private assignGenerals(seat: number, main: string, deputy: string): void {
    this.heroes[seat] = {
      main: { generalId: main, revealed: false },
      deputy: { generalId: deputy, revealed: false },
      careerist: false,
      marks: { yinyang: 0, pioneer: 0, pair: 0, ambition: 0 },
      bothRevealedHandled: false,
    };
    const p = this.player(seat);
    p.maxHp = p.hp = Math.floor((this.fishOf(main, 'main') + this.fishOf(deputy, 'deputy')) / 2);
  }

  /** Người có danh sách ứng viên này có chọn được ít nhất 1 cặp cùng thế lực không. */
  private hasPair(cands: string[]): boolean {
    // Danh sách lớn (chế độ tự chọn): gom theo thế lực cho nhanh
    if (cands.length > 40) {
      const mains = new Map<string, number>();
      for (const id of cands) if (!isDualGeneral(id)) mains.set(getGeneral(id).kingdom, (mains.get(getGeneral(id).kingdom) ?? 0) + 1);
      return cands.some((d) => getGeneral(d).kingdom !== 'ye' && ((mains.get('ye') ?? 0) > 0
        || kingdomsOf(d).some((k) => (mains.get(k) ?? 0) - (!isDualGeneral(d) && getGeneral(d).kingdom === k ? 1 : 0) > 0)));
    }
    return cands.some((a) => cands.some((b) => this.isValidPair(a, b)));
  }

  /**
   * Chia ứng viên NGẪU NHIÊN như bốc bài thật (nhờ vậy một thế lực có thể dồn nhiều người -> có dã tâm gia).
   * Nếu có người không có cặp hợp lệ thì chia lại; sau 50 lần vẫn không được mới dùng cách giữ chỗ.
   */
  /** Các ghế người chơi (trừ boss). */
  playerSeats(): number[] {
    return this.state.players.map((p) => p.seat).filter((s) => s !== this.bossSeat);
  }

  private dealCandidates(): string[][] {
    const n = this.playerSeats().length;
    const k = Math.min(this.candidateCount, Math.floor(this.pool.length / n));
    if (k < 2) throw new Error('Không đủ tướng cho số người chơi này');

    for (let attempt = 0; attempt < 50; attempt++) {
      const pool = shuffle([...this.pool], this.rng);
      const hands = Array.from({ length: n }, (_, i) => pool.slice(i * k, (i + 1) * k));
      // Loạn tướng vẫn cần ít nhất 1 cặp đặt được (tướng tím chỉ làm chủ, tướng 2 thế lực chỉ làm phó)
      if (hands.every((h) => this.hasPair(h))) return hands;
    }
    return this.dealWithReservedPairs(k);
  }

  /** Cách dự phòng: giữ chỗ trước cho mỗi người 1 cặp, lấy từ thế lực còn nhiều tướng nhất. */
  private dealWithReservedPairs(k: number): string[][] {
    const pool = shuffle([...this.pool], this.rng);
    const take = (pred: (id: string) => boolean) => {
      const i = pool.findIndex(pred);
      return i < 0 ? null : pool.splice(i, 1)[0];
    };
    const remaining = (kd: Kingdom) => Math.min(pool.filter((id) => getGeneral(id).kingdom === kd && !isDualGeneral(id)).length,
      pool.filter((id) => kingdomsOf(id).includes(kd)).length - 1);
    const hands = this.playerSeats().map(() => {
      const kingdoms = shuffle([...KINGDOMS], this.rng).sort((a, b) => remaining(b) - remaining(a));
      const k0 = kingdoms[0];
      if (remaining(k0) < 2) throw new Error('Không đủ tướng cùng thế lực để chia');
      return [take((id) => getGeneral(id).kingdom === k0 && !isDualGeneral(id))!, take((id) => kingdomsOf(id).includes(k0))!];
    });
    for (const h of hands) {
      while (h.length < k && pool.length > 0) h.push(take(() => true)!);
    }
    return hands.map((h) => shuffle(h, this.rng));
  }

  /** Tự chọn cặp có tổng âm dương ngư cao nhất (khi người chơi trả lời sai/hết giờ). */
  autoPick(candidates: string[]): [string, string] {
    let best: [string, string] | null = null;
    let bestScore = -1;
    for (const a of candidates) {
      for (const b of candidates) {
        if (!this.isValidPair(a, b)) continue;
        const [m, d] = getGeneral(a).halfHp >= getGeneral(b).halfHp && this.isValidPair(a, b) ? [a, b] : this.isValidPair(b, a) ? [b, a] : [a, b];
        const score = getGeneral(a).halfHp + getGeneral(b).halfHp;
        if (score > bestScore) { best = [m, d]; bestScore = score; }
      }
    }
    return best!;
  }

  private async chooseGenerals(): Promise<void> {
    if (this.mode === 'free') { await this.chooseGeneralsFree(); return; }
    const candidates = this.dealCandidates();
    const anyKingdom = this.mode === 'chaos' || this.bossSeat !== null;
    const seats = this.playerSeats();
    // Mọi người chọn cùng lúc
    const picks = await Promise.all(candidates.map((cands, i) => [seats[i], cands] as const).map(([seat, cands]) =>
      this.ask({ type: 'chooseGenerals', seat, candidates: cands, mode: this.mode, ...(anyKingdom ? { anyKingdom } : {}), ...(this.bossSeat !== null ? { boss: true } : {}) }).then((res): [string, string] => {
        const ok = res.kind === 'generals' && cands.includes(res.main) && cands.includes(res.deputy)
          && this.isValidPair(res.main, res.deputy);
        return ok ? [res.main, res.deputy] : this.autoPick(cands);
      })));
    picks.forEach(([m, d], i) => this.assignGenerals(seats[i], m, d));
    this.say('Tất cả đã chọn xong 2 tướng và úp xuống.');
  }

  /**
   * Chế độ tự chọn: lần lượt theo ghế, mỗi người xem toàn bộ tướng CÒN LẠI và chọn 2 tướng cùng thế lực.
   * Tướng đã có người chọn thì người sau không chọn được nữa.
   */
  private async chooseGeneralsFree(): Promise<void> {
    const taken = new Set<string>();
    for (const p of this.state.players) {
      if (p.seat === this.bossSeat) continue;
      const cands = this.pool.filter((id) => !taken.has(id));
      if (!this.hasPair(cands)) throw new Error('Không đủ tướng cùng thế lực cho chế độ tự chọn');
      const res = await this.ask({ type: 'chooseGenerals', seat: p.seat, candidates: cands, mode: 'free' });
      const ok = res.kind === 'generals' && cands.includes(res.main) && cands.includes(res.deputy) && this.isValidPair(res.main, res.deputy);
      const [m, d] = ok ? [res.main, res.deputy] : this.autoPick(this.shuffledSample(cands, 8));
      taken.add(m); taken.add(d);
      this.assignGenerals(p.seat, m, d);
      this.say(`${p.name} đã chọn xong tướng.`);
    }
    this.say('Tất cả đã chọn xong 2 tướng và úp xuống.');
  }

  /** Lấy ngẫu nhiên vài tướng nhưng bảo đảm có ít nhất 1 cặp cùng thế lực (để tự chọn thay khi hết giờ). */
  private shuffledSample(cands: string[], n: number): string[] {
    for (let i = 0; i < 30; i++) {
      const s = shuffle([...cands], this.rng).slice(0, n);
      if (this.hasPair(s)) return s;
    }
    return cands;
  }

  // ==========================================================
  // Thế lực
  // ==========================================================

  hero(seat: number): HeroState {
    const h = this.heroes[seat];
    if (!h) throw new Error(`Ghế ${seat} chưa có tướng`);
    return h;
  }

  /**
   * Thế lực thật của người chơi = thế lực chủ tướng.
   * Chủ tướng là tướng Dã tâm gia (tím) còn úp: tạm theo thế lực phó tướng (phó tướng 2 thế lực thì không có thế lực
   * tạm -> 'ye'). Khi chủ tướng tím lật ra -> 'ye' (dã tâm gia).
   */
  realKingdom(seat: number): Kingdom {
    // Thảo Phạt: mọi người chơi chung một thế lực (Liên quân), boss riêng
    if (this.bossSeat !== null) return seat === this.bossSeat ? 'qun' : 'shu';
    const h = this.hero(seat);
    const km = getGeneral(h.main.generalId).kingdom;
    // Đã xác định thế lực: giữ nguyên (trừ khi chính chủ tướng tím vừa lộ -> dã tâm gia, xử lý bằng cờ careerist)
    if (h.fixedKingdom && !(km === 'ye' && h.main.revealed)) return h.fixedKingdom;
    if (km !== 'ye' || h.main.revealed) return km;
    const kd = kingdomsOf(h.deputy.generalId);
    return kd.length === 1 && kd[0] !== 'ye' ? kd[0] : 'ye';
  }

  /** Khóa phe đang lộ: thế lực, hoặc "c<ghế>" cho dã tâm gia (cùng nhóm Lạp Long Nhân Tâm thì chung khóa). null = chưa lộ. */
  factionKeyOf(seat: number): string | null {
    const k = this.shownKingdom(seat);
    if (k === null) return null;
    return k === 'careerist' ? `c${this.heroes[seat]?.careeristGroup ?? seat}` : k;
  }

  /** Đã xác định thế lực (đã từng lật tướng; úp lại sau đó vẫn giữ thế lực). */
  isRevealedAny(seat: number): boolean {
    const h = this.hero(seat);
    return h.main.revealed || h.deputy.revealed || !!h.fixedKingdom;
  }

  /** Thế lực mà mọi người nhìn thấy. null = chưa xác định (chưa từng lật tướng nào). */
  shownKingdom(seat: number): Kingdom | 'careerist' | null {
    const h = this.heroes[seat];
    if (!h || !(h.main.revealed || h.deputy.revealed || h.fixedKingdom)) return null;
    return h.careerist ? 'careerist' : this.realKingdom(seat);
  }

  /** Cùng phe: cả hai đã lộ, cùng thế lực, không ai là dã tâm gia. */
  /** Giới tính theo chủ tướng (kể cả khi chủ tướng đang úp). */
  override isFemale(seat: number): boolean {
    const h = this.heroes[seat];
    if (!h) return false;
    const id = h.main.generalId;
    return FEMALE_GENERALS.has(id) || !!getGeneral(id).female;
  }

  /** Giới tính đã lộ: theo chủ tướng nếu đã lật, không thì theo phó tướng đã lật; chưa lật tướng nào -> null. */
  override visibleGender(seat: number): 'male' | 'female' | null {
    const h = this.heroes[seat];
    if (!h) return null;
    const slot = h.main.revealed && !h.main.removed ? h.main : h.deputy.revealed && !h.deputy.removed ? h.deputy : null;
    if (!slot) return null;
    return FEMALE_GENERALS.has(slot.generalId) || getGeneral(slot.generalId).female ? 'female' : 'male';
  }

  isSameFaction(a: number, b: number): boolean {
    const ka = this.shownKingdom(a);
    if (ka === 'careerist') {
      // Dã tâm gia: chỉ cùng phe với đồng minh Lạp Long Nhân Tâm (cùng nhóm)
      const ga = this.heroes[a]?.careeristGroup;
      return a !== b && ga !== undefined && this.shownKingdom(b) === 'careerist' && this.heroes[b]?.careeristGroup === ga;
    }
    return ka !== null && ka === this.shownKingdom(b);
  }

  // ---------- Đại thế lực / tiểu thế lực ----------

  /** Số người còn sống đã lộ thuộc thế lực `kingdom` (không tính dã tâm gia), cộng phần cộng thêm từ kỹ năng. */
  factionSize(kingdom: string): number {
    let n = this.alivePlayers().filter((p) => this.shownKingdom(p.seat) === kingdom).length;
    for (const p of this.alivePlayers()) {
      for (const e of this.skillEntries(p.seat, true)) n += e.skill.factionSizeBonus?.(this, p.seat, kingdom) ?? 0;
    }
    return n;
  }

  /**
   * Các đại thế lực (大势力): thế lực đông người nhất, cần ít nhất 2 người. Có thể có nhiều thế lực cùng lớn nhất.
   * Ngọc Tỷ: người đang lắp Ngọc Tỷ (đã lộ) -> thế lực của họ là đại thế lực DUY NHẤT
   * (dã tâm gia lắp Ngọc Tỷ thì chỉ riêng người đó là đại thế lực, trả về "seat:<n>").
   */
  bigFactions(): string[] {
    const jade = this.alivePlayers().find((p) => this.equipOf(p.seat, 'treasure')?.name === 'yuxi' && this.isRevealedAny(p.seat))
      ?? this.alivePlayers().find((p) => this.skillEntries(p.seat, true).some((e) => e.skill.virtualTreasure?.(this, p.seat) === 'yuxi'));
    if (jade) {
      const k = this.shownKingdom(jade.seat);
      return [k === 'careerist' ? `seat:${this.heroes[jade.seat]?.careeristGroup ?? jade.seat}` : String(k)];
    }
    const sizes = KINGDOMS.map((k) => [k, this.factionSize(k)] as const).filter(([, n]) => n >= 2);
    const max = Math.max(0, ...sizes.map(([, n]) => n));
    return sizes.filter(([, n]) => n === max).map(([k]) => k);
  }

  /** `seat` thuộc đại thế lực. */
  isBig(seat: number): boolean {
    const k = this.shownKingdom(seat);
    if (k === null) return false;
    const big = this.bigFactions();
    return k === 'careerist' ? big.includes(`seat:${this.heroes[seat]?.careeristGroup ?? seat}`) : big.includes(k);
  }

  /** `seat` thuộc tiểu thế lực: đã có thế lực nhưng không phải đại thế lực. */
  isSmall(seat: number): boolean {
    return this.shownKingdom(seat) !== null && !this.isBig(seat);
  }

  /** Khác phe: cả hai đã lộ và không cùng phe. Người chưa lộ thì không cùng mà cũng không khác. */
  isDifferentFaction(a: number, b: number): boolean {
    return this.shownKingdom(a) !== null && this.shownKingdom(b) !== null && !this.isSameFaction(a, b);
  }

  private teamLabel(seat: number): string {
    if (this.bossSeat !== null) return seat === this.bossSeat ? 'Boss' : 'Liên quân';
    const k = this.shownKingdom(seat);
    if (k === 'careerist') {
      // Mỗi dã tâm gia (hoặc nhóm Lạp Long Nhân Tâm) là một phe riêng, ghi kèm tên người cầm đầu
      const lead = this.heroes[seat]?.careeristGroup ?? seat;
      return `Dã tâm gia ${this.player(lead).name}`;
    }
    return k === null ? '?' : KINGDOM_LABEL[k];
  }

  // ==========================================================
  // Lật tướng
  // ==========================================================

  async reveal(seat: number, which: SlotKey): Promise<void> {
    const h = this.hero(seat);
    const slot = h[which];
    if (slot.revealed || slot.removed) return;
    const first = !this.isRevealedAny(seat);
    slot.revealed = true;
    const p = this.player(seat);
    const gen = getGeneral(slot.generalId);

    if (first) {
      // Dã tâm gia: thế lực của mình đã lộ đủ một nửa số người chơi (thế lực = thế lực chủ tướng).
      // Có quân chủ cùng thế lực còn sống -> không bao giờ thành dã tâm gia; quân chủ đã chết -> luôn là dã tâm gia.
      const k = this.realKingdom(seat);
      const lordAlive = this.lordOf(k);
      const lordDead = lordAlive === null && this.lordOf(k, true) !== null;
      const already = this.state.players.filter((q) => q.seat !== seat && this.shownKingdom(q.seat) === k).length;
      if (lordDead || k === 'ye') h.careerist = true;
      else if (lordAlive === null && already + 1 > this.state.players.length / 2) h.careerist = true;
      h.fixedKingdom = k; // chốt thế lực tại thời điểm lật
      p.team = this.teamLabel(seat);
    }
    // Quân chủ lật tướng: người cùng thế lực đang là dã tâm gia được trở lại thế lực
    if (which === 'main' && isLordId(slot.generalId)) {
      const k = this.realKingdom(seat);
      for (const q of this.state.players) {
        const hq = this.heroes[q.seat];
        if (q.seat !== seat && hq?.careerist && q.alive && this.realKingdom(q.seat) === k && hq.careeristGroup === undefined) {
          hq.careerist = false;
          q.team = this.teamLabel(q.seat);
          this.say(`${q.name} quay về thế lực ${KINGDOM_LABEL[k]} nhờ quân chủ.`);
        }
      }
    }

    const genKs = kingdomsOf(slot.generalId);
    this.say(`${p.name} lật ${SLOT_LABEL[which]} ${gen.name} (${genKs.map((k) => KINGDOM_LABEL[k]).join('/')})`
      + (!h.careerist && (genKs.length > 1 || gen.kingdom !== this.realKingdom(seat)) ? ` — phe ${KINGDOM_LABEL[this.realKingdom(seat)]} theo chủ tướng.` : '.'));
    // Tướng tím: chủ tướng Dã tâm gia lật ra -> bạo lộ dã tâm
    let exposedNow = false;
    if (which === 'main' && gen.kingdom === 'ye' && !h.exposed) { this.exposeCareerist(seat); exposedNow = true; }
    else if (first && h.careerist) this.say(`⚑ ${p.name} trở thành DÃ TÂM GIA!`);

    if (first && !this.anyRevealed) {
      this.anyRevealed = true;
      h.marks.pioneer++;
      this.say(`${p.name} lật tướng đầu tiên, nhận ký hiệu Tiên Khu.`);
    }

    if (h.main.revealed && h.deputy.revealed && !h.bothRevealedHandled) {
      h.bothRevealedHandled = true;
      const fish = this.fishOf(h.main.generalId, 'main') + this.fishOf(h.deputy.generalId, 'deputy');
      if (fish % 2 === 1) {
        h.marks.yinyang++;
        this.say(`${p.name} có nửa máu lẻ, nhận ký hiệu Âm Dương Ngư.`);
      }
      if (isPair(h.main.generalId, h.deputy.generalId)) {
        h.marks.pair++;
        this.say(`${p.name} có cặp tướng Châu Liên Bích Hợp, nhận ký hiệu.`);
      }
    }
    await this.bus.emit('generalRevealed', { seat, generalId: slot.generalId, first });
    if (exposedNow) await this.offerRecruit(seat);
    // Lật tướng làm mọi người còn sống đã cùng một thế lực (ví dụ ván 2 người, cả hai đều Ngụy): ván kết thúc ngay,
    // không cần đợi có người chết. Chỉ xét khi mọi người còn sống đều đã xác định thế lực.
    if (first && p.alive && !this.state.finished && this.started && this.bossSeat === null
      && this.alivePlayers().every((q) => this.isRevealedAny(q.seat))) {
      const w = this.checkWinner();
      if (w !== null) await this.finish(w, 'victory');
    }
  }

  // ---------- Tướng tím (Dã tâm gia, 野心家) ----------

  /** Người cần được hỏi Lạp Long Nhân Tâm ở đầu lượt kế tiếp (bị buộc bạo lộ lúc kiểm tra thắng). */
  private pendingRecruit: number[] = [];

  /**
   * Bạo lộ dã tâm (暴露野心): chủ tướng tím lật ra -> trở thành dã tâm gia, nhận 1 dấu Dã Tâm Gia
   * (dùng thay được Âm Dương Ngư, Tiên Khu hoặc Châu Liên Bích Hợp).
   */
  private exposeCareerist(seat: number): void {
    const h = this.hero(seat);
    const p = this.player(seat);
    h.exposed = true;
    h.main.revealed = true;
    if (!h.careerist || h.careeristGroup === undefined) h.careeristGroup = seat;
    h.careerist = true;
    h.marks.ambition++;
    p.team = this.teamLabel(seat);
    this.say(`⚑ ${p.name} BẠO LỘ DÃ TÂM: ${getGeneral(h.main.generalId).name} là Dã tâm gia! Nhận 1 dấu Dã Tâm Gia.`);
  }

  /**
   * Lạp Long Nhân Tâm (拉拢人心): dã tâm gia vừa bạo lộ (bàn còn ít nhất 3 người) mời người khác gia nhập.
   * Lần lượt từ người kế tiếp, ai đồng ý đầu tiên thì gia nhập (chỉ 1 người; không mời quân chủ, dã tâm gia, tướng tím đang úp):
   * người đó thành dã tâm gia cùng phe, bốc bài đến 4 lá và hồi 1 máu.
   */
  async offerRecruit(leader: number): Promise<void> {
    const lp = this.player(leader);
    if (!lp.alive || this.state.finished || this.alivePlayers().length < 3) return;
    const ok = await this.ask({ type: 'confirm', seat: leader, skill: 'recruit', reveal: false,
      prompt: 'Lạp Long Nhân Tâm: mời 1 người gia nhập phe Dã tâm gia của bạn (thắng/thua cùng bạn)?' });
    if (ok.kind !== 'yes') return;
    this.say(`${lp.name} dùng Lạp Long Nhân Tâm, mời mọi người gia nhập phe Dã tâm gia.`);
    for (const s of this.aliveSeatsFrom(leader)) {
      if (s === leader) continue;
      const hq = this.heroes[s];
      if (!hq || hq.careerist || this.isLord(s) || getGeneral(hq.main.generalId).kingdom === 'ye') continue;
      const res = await this.ask({ type: 'confirm', seat: s, skill: 'joinCareerist', reveal: false,
        prompt: `Gia nhập phe Dã tâm gia của ${lp.name}? Bạn sẽ thắng/thua cùng họ, lật tướng, bốc bài đến 4 lá và hồi 1 máu.` });
      if (res.kind !== 'yes') continue;
      hq.careerist = true;
      hq.careeristGroup = leader;
      if (!hq.main.revealed && !hq.main.removed) await this.reveal(s, 'main');
      hq.careerist = true;
      hq.careeristGroup = leader;
      const q = this.player(s);
      q.team = this.teamLabel(s);
      this.say(`${q.name} gia nhập phe Dã tâm gia của ${lp.name}.`);
      await this.draw(s, Math.max(0, 4 - q.hand.length));
      if (q.hp < q.maxHp) await this.recover(s, 1, s);
      return;
    }
    this.say('Không ai gia nhập phe Dã tâm gia.');
  }

  private async askRevealAtTurnStart(seat: number): Promise<void> {
    const h = this.heroes[seat];
    if (!h) return;
    const canMain = !h.main.revealed && !h.main.removed;
    const canDeputy = !h.deputy.revealed && !h.deputy.removed;
    if ((!canMain && !canDeputy) || !this.canReveal(seat)) return;
    const res = await this.ask({ type: 'reveal', seat, canMain, canDeputy });
    if (res.kind !== 'reveal') return;
    // Lật cả hai tướng cùng lúc: kỹ năng "sau khi mở tướng" xét trạng thái sau khi CẢ HAI đã lật (Cận Hãm...)
    if (res.main && res.deputy) {
      this.revealBatch.add(seat);
      try {
        await this.reveal(seat, 'main');
        await this.reveal(seat, 'deputy');
      } finally { this.revealBatch.delete(seat); }
      await this.bus.emit('revealBatchDone', { seat });
      return;
    }
    if (res.main) await this.reveal(seat, 'main');
    if (res.deputy) await this.reveal(seat, 'deputy');
  }

  private readonly revealBatch = new Set<number>();
  /** `seat` đang lật cả hai tướng cùng lúc (tướng còn lại sẽ lật ngay sau). */
  isRevealBatch(seat: number): boolean {
    return this.revealBatch.has(seat);
  }

  /** Lật hết tướng mà không phát sự kiện (dùng khi ván kết thúc). */
  private revealSilently(seat: number): void {
    const h = this.hero(seat);
    h.main.revealed = h.deputy.revealed = true;
    this.player(seat).team = this.teamLabel(seat);
    this.say(`${this.player(seat).name} lật tướng: ${getGeneral(h.main.generalId).name} & ${getGeneral(h.deputy.generalId).name}.`);
  }

  // ==========================================================
  // Kỹ năng
  // ==========================================================

  /** Danh sách kỹ năng của một người. Mặc định gồm cả tướng đang úp. */
  skillEntries(seat: number, revealedOnly = false): SkillEntry[] {
    const h = this.heroes[seat];
    if (!h) return [];
    const out: SkillEntry[] = [];
    for (const which of ['main', 'deputy'] as const) {
      const slot = h[which];
      if (slot.removed || slot.noSkills) continue;
      if (revealedOnly && !slot.revealed) continue;
      // Tướng úp mà đang bị cấm lật (Họa Thủy) thì không thể dùng kỹ năng của nó
      if (!slot.revealed && !revealedOnly && this.started && (this.revealBlockers || !!this.player(seat).flags.qinglongLock) && !this.canReveal(seat)) continue;
      for (const id of getGeneral(slot.generalId).skills) {
        const skill = SKILLS[id];
        // Kỹ năng bị vô hiệu trong lượt này (Ty Địch): cờ "turn_noSkill_<id>"
        if (this.player(seat).flags[`turn_noSkill_${id}`]) continue;
        // Kỹ năng đã mất (Kích Chiếu mất Thụ Việt, Liễm Tư...) / bị Thiết Kỵ vô hiệu trong lượt (trừ tỏa định kỹ)
        if (this.lostSkills.get(seat)?.has(id)) continue;
        if (slot.suppressedTurn === this.state.turnCount && skill && !isLockedSkill(skill)) continue;
        // Kỹ năng chủ tướng / phó tướng chỉ có khi tướng nằm đúng vị trí
        if (skill.position && skill.position !== which) continue;
        out.push({ skill, which, slot });
      }
    }
    // Trang bị có kỹ năng (nạp từ content/): luôn có hiệu lực khi đang lắp
    for (const es of EQUIP_SLOTS) {
      const id = this.player(seat).equips[es][0];
      const ids = id === undefined ? [] : [EQUIP_SKILLS[this.card(id).name], EQUIP_SKILLS[`${this.card(id).name}#2`]];
      for (const skillId of ids) if (skillId && SKILLS[skillId]) out.push({ skill: SKILLS[skillId], which: 'main', slot: EQUIPMENT_SLOT });
    }
    // Kỹ năng chung của mọi người (Chiếu Thư...)
    for (const id of GLOBAL_SKILLS) if (SKILLS[id]) out.push({ skill: SKILLS[id], which: 'main', slot: EQUIPMENT_SLOT });
    // Kỹ năng được trao thêm
    for (const g of this.granted.get(seat) ?? []) {
      if (SKILLS[g.id]) out.push({ skill: SKILLS[g.id], which: 'main', slot: EQUIPMENT_SLOT });
    }
    return out;
  }

  /** Lá vừa dùng được tính là loại gì (Dũng Quyết cần biết lá vào chồng bỏ có phải Sát không). */
  private readonly usedAs = new Map<number, CardName>();
  usedAsOf(id: number): CardName | null {
    return this.usedAs.get(id) ?? null;
  }

  /** Các lá bị bỏ ở giai đoạn bỏ bài gần nhất (Cố Chính). */
  lastDiscardPhase: { seat: number; turn: number; ids: number[] } | null = null;

  /** Kỹ năng được trao thêm cho từng ghế (Tồn Tự, Huyễn Hoặc...). `turnOnly`: mất khi hết lượt hiện tại. */
  private readonly granted = new Map<number, { id: string; turnOnly: boolean }[]>();

  grantSkill(seat: number, skillId: string, turnOnly = false): void {
    if (!SKILLS[skillId]) throw new Error(`Kỹ năng ${skillId} không tồn tại`);
    const list = this.granted.get(seat) ?? [];
    if (!list.some((x) => x.id === skillId)) list.push({ id: skillId, turnOnly });
    this.granted.set(seat, list);
    this.say(`${this.player(seat).name} nhận kỹ năng ${SKILLS[skillId].name}.`);
  }

  /** Kỹ năng của tướng mà `seat` đã mất vĩnh viễn (Kích Chiếu, Liễm Tư). */
  private readonly lostSkills = new Map<number, Set<string>>();

  /** `seat` mất kỹ năng `skillId` của tướng (vĩnh viễn trong ván). Kỹ năng được trao cũng bị thu hồi. */
  loseSkill(seat: number, skillId: string): void {
    const set = this.lostSkills.get(seat) ?? new Set<string>();
    set.add(skillId);
    this.lostSkills.set(seat, set);
    this.revokeSkill(seat, skillId);
    this.say(`${this.player(seat).name} mất kỹ năng ${SKILLS[skillId]?.name ?? skillId}.`);
  }

  /**
   * Số âm dương ngư của tướng `id` khi nằm ở vị trí `which`, đã tính kỹ năng "giảm 0.5 máu gốc" (fishDelta):
   * kỹ năng có `position` chỉ tính khi tướng nằm đúng vị trí đó.
   */
  fishOf(id: string, which: SlotKey): number {
    const gen = getGeneral(id);
    let n = gen.halfHp;
    for (const sid of gen.skills) {
      const sk = SKILLS[sid];
      if (sk?.fishDelta && (!sk.position || sk.position === which)) n += sk.fishDelta;
    }
    return n;
  }

  /** Ưng Dương: điểm cộng thêm cho lá đấu điểm của `seat` (hỏi kỹ năng có trường pindianBonus; tướng úp thì lật khi dùng). */
  async pindianBonus(seat: number, card: Card): Promise<number> {
    let n = 0;
    for (const e of this.skillEntries(seat)) {
      if (!e.skill.pindianBonus || !this.player(seat).alive) continue;
      const d = await e.skill.pindianBonus(this, seat, card);
      if (!d) continue;
      if (!e.slot.revealed) await this.reveal(seat, e.which);
      this.say(`${this.player(seat).name} dùng ${e.skill.name}: lá đấu điểm ${d > 0 ? '+' : ''}${d} điểm.`);
      n += d;
    }
    return n;
  }

  revokeSkill(seat: number, skillId: string): void {
    const list = this.granted.get(seat);
    if (list) this.granted.set(seat, list.filter((x) => x.id !== skillId));
  }

  // ---------- Cơ chế dùng chung (xem mechanics.ts) ----------

  /** Đấu điểm: `a` thắng khi điểm lá của `a` lớn hơn hẳn. */
  pindian(a: number, b: number, reason: string): Promise<mech.PindianResult | null> {
    return mech.pindian(this, a, b, reason);
  }

  /** Người ra lệnh rút 2 quân lệnh ngẫu nhiên, chọn 1 (trả về 0..5). */
  drawOrder(issuer: number): Promise<number> {
    return mech.drawOrder(this, issuer);
  }

  /** Hỏi `target` có thực hiện quân lệnh không; true nếu đã thực hiện. */
  askOrder(issuer: number, target: number, order: number): Promise<boolean> {
    return mech.askOrder(this, issuer, target, order);
  }

  neighbors(seat: number): number[] {
    return mech.neighbors(this, seat);
  }

  /** Hai người đang vây công `target`, hoặc null. */
  besiegers(target: number): [number, number] | null {
    return mech.besiegers(this, target);
  }

  formation(seat: number): number[] {
    return mech.formation(this, seat);
  }

  /** Thông tin tướng (thế lực, số âm dương ngư...) cho kỹ năng viết bằng JavaScript. */
  generalInfo(id: string): { id: string; name: string; kingdom: Kingdom; halfHp: number } | null {
    return isGeneralId(id) ? getGeneral(id) : null;
  }

  generalName(id: string): string {
    return isGeneralId(id) ? getGeneral(id).name : id;
  }

  /** Số âm dương ngư của một tướng (0 nếu không tồn tại) — cho kỹ năng "giảm 0.5 máu gốc". */
  generalHalfHp(id: string): number {
    return isGeneralId(id) ? getGeneral(id).halfHp : 0;
  }

  /** Thế lực in trên tướng `id` (null nếu không có tướng này). */
  generalKingdom(id: string): Kingdom | null {
    return isGeneralId(id) ? getGeneral(id).kingdom : null;
  }

  skillName(id: string): string {
    return SKILLS[id]?.name ?? id;
  }

  grantedSkills(seat: number): string[] {
    return (this.granted.get(seat) ?? []).map((x) => x.id);
  }

  /** Loại một tướng khỏi ván (移除武将牌). */
  async removeGeneral(seat: number, which: SlotKey): Promise<void> {
    const slot = this.hero(seat)[which];
    if (slot.removed) return;
    if (!slot.revealed) await this.reveal(seat, which);
    slot.removed = true;
    this.say(`${this.player(seat).name} loại bỏ ${SLOT_LABEL[which]} ${getGeneral(slot.generalId).name}.`);
    await this.bus.emit('generalRemoved', { seat, generalId: slot.generalId });
  }

  // ---------- Hợp Tung (合纵) ----------

  /** Lá `id` trên tay `seat` có dấu Hợp không (kể cả được kỹ năng gắn dấu trong lượt, ví dụ Hoằng Viện). */
  isTransferable(seat: number, id: number): boolean {
    return !!this.card(id).transferable || this.player(seat).flags[`turn_transfer_${id}`] === 1;
  }

  /** Người nhận được Hợp Tung: người khác KHÔNG cùng thế lực với bạn, hoặc chưa xác định thế lực. */
  transferTargets(seat: number): number[] {
    return this.alivePlayers().map((p) => p.seat).filter((t) => t !== seat && this.canTarget(seat, t)
      && (!this.isRevealedAny(t) || !this.isSameFaction(seat, t)));
  }

  /** Hợp Tung: giao 1–3 lá cho `target`; nếu người nhận đã xác định thế lực thì bạn rút lại số lá tương đương. */
  async doTransfer(seat: number, cardIds: number[], target: number): Promise<void> {
    this.player(seat).flags.turn_transferUsed = 1;
    const draw = this.isRevealedAny(target);
    await this.moveCards([...cardIds], { kind: 'hand', seat }, { kind: 'hand', seat: target }, 'transfer');
    this.say(`${this.player(seat).name} Hợp Tung: giao ${cardIds.length} lá cho ${this.player(target).name}.`);
    if (!draw) return;
    const ctx = await this.bus.emit('transferDraw', { seat, drawer: seat, target, count: cardIds.length });
    if (this.player(ctx.drawer).alive) await this.draw(ctx.drawer, ctx.count, 'transfer');
  }

  // ---------- Chồng tướng riêng (Hồn, Lục...) ----------

  /** Chồng tướng riêng trên tướng của từng người: tên chồng -> danh sách id tướng. open = ai cũng thấy. */
  private readonly genPiles = new Map<number, Map<string, { ids: string[]; open: boolean }>>();
  /** Tướng đã được lấy ra khỏi chồng bài tướng (không còn rút được). */
  private readonly takenGenerals = new Set<string>();

  /** Chồng bài tướng (武将牌堆): các tướng chưa ai cầm, chưa bị lấy ra, không phải quân chủ. */
  generalDeck(): string[] {
    const inUse = new Set(this.heroes.flatMap((x) => (x ? [x.main.generalId, x.deputy.generalId] : [])));
    return this.pool.filter((id) => isGeneralId(id) && !inUse.has(id) && !this.takenGenerals.has(id) && !this.transformedOut.has(id) && !isLordId(id));
  }

  /** Lấy ngẫu nhiên `n` tướng từ chồng bài tướng. */
  takeGeneralsFromDeck(n: number): string[] {
    const deck = shuffle(this.generalDeck(), this.rng);
    const ids = deck.slice(0, Math.max(0, n));
    for (const id of ids) this.takenGenerals.add(id);
    return ids;
  }

  /** Trả tướng về chồng bài tướng. */
  returnGeneralsToDeck(ids: string[]): void {
    for (const id of ids) this.takenGenerals.delete(id);
  }

  /** Đặt tướng lên chồng riêng `name` của `seat` (ví dụ "Hồn"). open = mọi người nhìn thấy. */
  addGeneralPile(seat: number, name: string, ids: string[], open = false): void {
    if (!ids.length) return;
    let m = this.genPiles.get(seat);
    if (!m) this.genPiles.set(seat, (m = new Map()));
    const pile = m.get(name) ?? { ids: [], open };
    pile.ids.push(...ids);
    for (const id of ids) this.takenGenerals.add(id);
    m.set(name, pile);
    this.say(`${this.player(seat).name} nhận ${ids.length} [${name}]${open ? `: ${ids.map((i) => getGeneral(i).name).join(', ')}` : ''}.`);
    this.tell(seat, `[${name}] mới: ${ids.map((i) => getGeneral(i).name).join(', ')}.`);
  }

  /** Các tướng trong chồng riêng `name` của `seat`. */
  generalPile(seat: number, name: string): string[] {
    return [...(this.genPiles.get(seat)?.get(name)?.ids ?? [])];
  }

  /** Bỏ tướng khỏi chồng riêng (về lại chồng bài tướng nếu backToDeck). */
  removeFromGeneralPile(seat: number, name: string, ids: string[], backToDeck = true): void {
    const pile = this.genPiles.get(seat)?.get(name);
    if (!pile) return;
    pile.ids = pile.ids.filter((x) => !ids.includes(x));
    if (backToDeck) this.returnGeneralsToDeck(ids);
    this.say(`${this.player(seat).name} bỏ ${ids.length} [${name}]: ${ids.map((i) => getGeneral(i).name).join(', ')}.`);
  }

  private generalPilesOf(seat: number): [string, { ids: string[]; open: boolean }][] {
    return [...(this.genPiles.get(seat)?.entries() ?? [])].filter(([, p]) => p.ids.length > 0);
  }

  /** Tướng đã bị đổi ra khỏi ván (变更副将): không được rút lại nữa. */
  private readonly transformedOut = new Set<string>();

  /** Các tướng có thể nhận khi đổi phó tướng: cùng thế lực với chủ tướng, chưa ai cầm, chưa bị đổi ra. */
  transformCandidates(seat: number): string[] {
    const h = this.heroes[seat];
    if (!h) return [];
    const km = getGeneral(h.main.generalId).kingdom;
    const kingdom = km === 'ye' ? kingdomsOf(h.deputy.generalId)[0] : km;
    const inUse = new Set(this.heroes.flatMap((x) => (x ? [x.main.generalId, x.deputy.generalId] : [])));
    return this.pool.filter((id) => isGeneralId(id) && !inUse.has(id) && !this.transformedOut.has(id) && !this.takenGenerals.has(id)
      && !isLordId(id) && getGeneral(id).kingdom !== 'ye' && (km === 'ye' ? !isDualGeneral(id) : true) && kingdomsOf(id).includes(kingdom));
  }

  /**
   * Đổi phó tướng (变更副将) theo luật Quốc Chiến·Biến:
   * lật phó tướng (nếu đang úp), bỏ nó ra khỏi ván, rồi nhận ngẫu nhiên một tướng cùng thế lực với chủ tướng
   * làm phó tướng mới ở trạng thái ÚP. Máu và giới hạn máu không đổi. Trả về true nếu đổi được.
   */
  async transformDeputy(seat: number): Promise<boolean> {
    const h = this.heroes[seat];
    const p = this.player(seat);
    if (!h || !p.alive || h.deputy.removed) return false;
    const pool = this.transformCandidates(seat);
    if (!pool.length) { this.say(`${p.name} không còn tướng cùng thế lực để đổi phó tướng.`); return false; }
    if (!h.deputy.revealed) await this.reveal(seat, 'deputy');
    const old = h.deputy.generalId;
    const next = pool[this.randomInt(pool.length)];
    this.transformedOut.add(old);
    h.deputy = { generalId: next, revealed: false };
    this.player(seat).team = this.teamLabel(seat);
    this.say(`${p.name} đổi phó tướng: ${getGeneral(old).name} rời ván, nhận một phó tướng mới (đang úp).`);
    this.tell(seat, `Phó tướng mới của bạn: ${getGeneral(next).name}.`);
    await this.bus.emit('generalRemoved', { seat, generalId: old });
    await this.bus.emit('deputyTransformed', { seat, oldGeneral: old, newGeneral: next });
    return true;
  }

  /** Hỏi `seat` có muốn đổi phó tướng không (dùng trong Kỳ Sách, Chế Man, Điển Tài...). */
  async askTransform(seat: number, reason: string): Promise<boolean> {
    const h = this.heroes[seat];
    if (!h || h.deputy.removed || !this.transformCandidates(seat).length) return false;
    const res = await this.ask({ type: 'confirm', seat, skill: 'transform', prompt: `${reason}: đổi phó tướng?`, reveal: !h.deputy.revealed });
    if (res.kind !== 'yes') return false;
    return this.transformDeputy(seat);
  }

  /** Úp lại một tướng đã lật (暗置), ví dụ Khuynh Thành. */
  hideGeneral(seat: number, which: SlotKey): void {
    const h = this.hero(seat);
    const slot = h[which];
    if (!slot.revealed || slot.removed) return;
    slot.revealed = false;
    this.player(seat).team = this.teamLabel(seat);
    this.say(`${this.player(seat).name} úp lại ${SLOT_LABEL[which]} ${getGeneral(slot.generalId).name}.`);
  }

  /** `seat` có được lật tướng lúc này không (Họa Thủy cấm người khác lật trong lượt của chủ kỹ năng). */
  canReveal(seat: number): boolean {
    // Thanh Long Yển Nguyệt Đao (Quốc Chiến): mục tiêu của Sát không thể lật tướng đến khi Sát xử lý xong
    if (this.player(seat).flags.qinglongLock) return false;
    for (const p of this.alivePlayers()) {
      if (p.seat === seat) continue;
      if (this.skillEntries(p.seat, true).some((e) => e.skill.blockReveal?.(this, p.seat, seat))) return false;
    }
    return true;
  }

  hasSkill(seat: number, skillId: string, revealedOnly = true): boolean {
    return this.skillEntries(seat, revealedOnly).some((e) => e.skill.id === skillId);
  }

  /** Gắn một listener cho mỗi sự kiện mà có kỹ năng cần nghe. */
  private installSkillDispatcher(): void {
    const events = new Set<EventName>();
    for (const s of Object.values(SKILLS)) for (const t of s.triggers ?? []) events.add(t.event);
    for (const ev of events) this.bus.on(ev, (ctx) => this.dispatch(ev, ctx));
  }

  /**
   * Thu thập trigger theo thứ tự chỗ ngồi bắt đầu từ người đang trong lượt.
   * - Tướng đã lật + tỏa định: tự chạy.
   * - Còn lại: hỏi người chơi (nếu tướng đang úp thì đồng ý = lật tướng).
   */
  private async dispatch(event: EventName, ctx: unknown): Promise<void> {
    if (this.heroes.length === 0) return;
    const seats = this.aliveSeatsFrom(this.state.currentSeat);
    // Kỹ năng "khi bạn chết" (Đoạn Trường): người vừa chết cũng được xét
    const dead = event === 'death' ? (ctx as { seat: number }).seat : -1;
    if (dead >= 0) seats.unshift(dead);
    for (const seat of seats) {
      // Duyệt kỹ năng theo thứ tự như cũ (tỏa định kỹ đã lật tự chạy, observer chạy đúng chỗ).
      // Gặp kỹ năng không bắt buộc mà cùng lúc còn kỹ năng không bắt buộc khác của người này cũng phát động được:
      // người chơi chọn kích hoạt cái nào trước, lần lượt từng cái (hoặc thôi).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: { e: SkillEntry; trig: SkillTrigger<any> }[] = [];
      for (const e of this.skillEntries(seat)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of e.skill.triggers ?? []) if (t.event === event) list.push({ e, trig: t as SkillTrigger<any> });
      }
      const done = new Set<number>();
      const alive = () => this.player(seat).alive || seat === dead;
      const auto = (c: { e: SkillEntry; trig: { compulsory?: boolean } }) => c.e.slot.revealed && !!c.trig.compulsory;
      for (let idx = 0; idx < list.length; idx++) {
        if (done.has(idx) || !alive()) continue;
        const { e, trig } = list[idx];
        if (!trig.can(this, ctx, seat)) continue;
        if (auto(list[idx])) { done.add(idx); await this.runTrigger(seat, e, trig, ctx); continue; }
        // Nhóm các kỹ năng không bắt buộc cùng phát động lúc này (bỏ qua observer và kỹ năng tự chạy)
        let group = [idx];
        for (let k = idx + 1; k < list.length; k++) {
          const c = list[k];
          if (done.has(k) || c.trig.observer || auto(c) || c.e.skill.id === e.skill.id) continue;
          if (c.trig.can(this, ctx, seat)) group.push(k);
        }
        for (const k of group) done.add(k);
        if (group.length === 1) {
          const res = await this.ask({
            type: 'confirm', seat, skill: e.skill.id, reveal: !e.slot.revealed,
            prompt: e.slot.revealed ? `Kích hoạt ${e.skill.name}?` : `Lật ${getGeneral(e.slot.generalId).name} để kích hoạt ${e.skill.name}?`,
          });
          if (res.kind !== 'yes' || !trig.can(this, ctx, seat)) continue; // trạng thái có thể đã đổi trong lúc chờ
          await this.runTrigger(seat, e, trig, ctx);
          continue;
        }
        // Chọn lần lượt cho đến khi hết hoặc người chơi thôi
        while (group.length && alive()) {
          group = group.filter((k) => k === idx ? true : list[k].trig.can(this, ctx, seat));
          if (!group.length) break;
          const opts = group.map((k) => (list[k].e.slot.revealed ? list[k].e.skill.name : `${list[k].e.skill.name} (lật ${getGeneral(list[k].e.slot.generalId).name})`));
          let pick: number;
          if (group.length === 1) {
            const c = list[group[0]];
            const res = await this.ask({
              type: 'confirm', seat, skill: c.e.skill.id, reveal: !c.e.slot.revealed,
              prompt: c.e.slot.revealed ? `Kích hoạt ${c.e.skill.name}?` : `Lật ${getGeneral(c.e.slot.generalId).name} để kích hoạt ${c.e.skill.name}?`,
            });
            if (res.kind !== 'yes') break;
            pick = group[0];
          } else {
            const res = await this.ask({
              type: 'choose', seat, prompt: 'Nhiều kỹ năng cùng phát động: chọn kỹ năng kích hoạt trước (bấm ô kỹ năng màu đỏ)',
              options: [...opts, 'Không kích hoạt thêm'], skills: [...group.map((k) => list[k].e.skill.id), null],
              skillReveal: [...group.map((k) => !list[k].e.slot.revealed), false],
            });
            const i2 = res.kind === 'choice' && Number.isInteger(res.index) ? res.index : group.length;
            if (i2 < 0 || i2 >= group.length) break;
            pick = group[i2];
          }
          group = group.filter((k) => k !== pick);
          const c = list[pick];
          if (pick !== idx && !c.trig.can(this, ctx, seat)) continue;
          if (pick === idx && !trig.can(this, ctx, seat)) continue;
          await this.runTrigger(seat, c.e, c.trig, ctx);
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async runTrigger(seat: number, e: SkillEntry, trig: SkillTrigger<any>, ctx: unknown): Promise<void> {
    if (!e.slot.revealed) await this.reveal(seat, e.which);
    this.say(`${this.player(seat).name} kích hoạt ${e.skill.name}.`);
    if (e.slot.generalId) this.stat({ kind: 'skillUsed', seat, skill: e.skill.id, generalId: e.slot.generalId });
    await this.asActor(seat, async () => { await trig.run(this, ctx, seat); });
  }

  // ---------- Ghi đè các điểm móc của engine lõi ----------

  override cardCountsAs(seat: number, card: Card): CardName[] {
    const names = new Set<CardName>(super.cardCountsAs(seat, card));
    if (this.player(seat).alive) {
      for (const e of this.skillEntries(seat)) {
        for (const n of e.skill.convert?.(this, seat, card) ?? []) names.add(n);
      }
    }
    return [...names];
  }

  override slashLimit(seat: number): number {
    return Math.max(super.slashLimit(seat), ...this.skillEntries(seat).map((e) => e.skill.slashLimit ?? 1))
      + this.sumBonus(seat, (s) => s.slashBonus) + (this.player(seat).flags.turn_extraSlash ?? 0);
  }

  private revealedSlashLimit(seat: number): number {
    return Math.max(super.slashLimit(seat), ...this.skillEntries(seat, true).map((e) => e.skill.slashLimit ?? 1));
  }

  /** Vô Giải·Quốc: chặn cho mọi người cùng thế lực đã lộ với mục tiêu. */
  override factionGroup(target: number): number[] {
    const k = this.factionKeyOf(target);
    if (k === null) return [target];
    return this.alivePlayers().filter((p) => this.factionKeyOf(p.seat) === k).map((p) => p.seat);
  }

  /** Số thế lực đã lộ diện trong số người còn sống (mỗi dã tâm gia tính là một thế lực riêng). */
  revealedFactionCount(): number {
    const keys = new Set<string>();
    for (const p of this.alivePlayers()) {
      const k = this.factionKeyOf(p.seat);
      if (k !== null) keys.add(k);
    }
    return keys.size;
  }

  private sumBonus(seat: number, pick: (s: Skill) => ((g: HegemonyGame, owner: number) => number) | undefined): number {
    if (!this.player(seat).alive) return 0;
    return this.skillEntries(seat, true).reduce((n, e) => n + (pick(e.skill)?.(this, seat) ?? 0), 0);
  }

  override attackRange(seat: number): number {
    return super.attackRange(seat) + this.sumBonus(seat, (s) => s.rangeBonus) + sixSwordsBonus(this, seat);
  }

  protected override async extraSlashTargets(seat: number, _card: Card, targets: number[]): Promise<number[]> {
    return halberdTargets(this, seat, targets);
  }

  override distance(from: number, to: number): number {
    const d = super.distance(from, to);
    if (from === to || !Number.isFinite(d)) return d;
    // Phấn Tấn: khoảng cách đến mục tiêu đã chọn là 1 trong lượt này
    if (this.state.currentSeat === from && (this.player(from).flags.fenxunTarget ?? 0) === to + 1) return 1;
    return Math.max(1, d + this.sumBonus(to, (s) => s.defenseBonus) - this.sumBonus(from, (s) => s.offenseBonus) - this.auraOffense(from));
  }

  /** Có kỹ năng nào cộng khoảng cách cho người khác (Nhạn Hàng) không — tính 1 lần cho nhanh. */
  private readonly hasAura = Object.values(SKILLS).some((s) => s.auraOffense);

  /** Nhạn Hàng: kỹ năng (đã lật) của mọi người giảm khoảng cách từ `from` đến người khác. */
  private auraOffense(from: number): number {
    if (!this.hasAura) return 0;
    let n = 0;
    for (const p of this.alivePlayers()) {
      for (const e of this.skillEntries(p.seat, true)) n += e.skill.auraOffense?.(this, p.seat, from) ?? 0;
    }
    return n;
  }

  /** Võ Thánh (Sát Rô), Liệt Cung: Sát của `seat` lên `target` không giới hạn khoảng cách (kỹ năng đã lật). */
  override slashRangeExempt(seat: number, target: number, card: Card | null): boolean {
    if (!this.player(seat).alive) return false;
    return this.skillEntries(seat, true).some((e) => e.skill.slashNoRange?.(this, seat, target, card));
  }

  /** Khu Thỉ: số mục tiêu của Sát +cờ turn_extraSlashTargets. */
  override maxSlashTargets(seat: number, cardId: number): number {
    // Thần Kích (boss Lữ Bố): Sát là lá cuối cùng trên tay -> thêm tối đa 2 mục tiêu
    const thanKich = this.hasSkill(seat, 'boss_thankich', true) && this.player(seat).hand.length <= 1 ? 2 : 0;
    return super.maxSlashTargets(seat, cardId) + (this.player(seat).flags.turn_extraSlashTargets ?? 0) + thanKich;
  }

  /** Giáp ảo (Bát Trận): khi không lắp giáp thì coi như có. Thanh Công Kiếm vẫn bỏ qua. */
  override armorOf(target: number, source: number | null = null, isSlash = false): CardName | null {
    // Bỏ qua phòng cụ do kỹ năng đặt cờ tạm trên mục tiêu (Nghịch Trảm...): Sát không tính giáp của người này
    if (isSlash && this.player(target).flags.turn_ignoreArmor) return null;
    // Bào Hao + Ngũ Hổ Tướng Đại Kỳ: Sát của người có kỹ năng ignoreArmor (đã lật) bỏ qua phòng cụ
    if (isSlash && source !== null && source !== target && this.player(source).alive
      && this.skillEntries(source, true).some((e) => e.skill.ignoreArmor?.(this, source, target))) return null;
    const real = super.armorOf(target, source, isSlash);
    if (real || this.equipOf(target, 'armor')) return real;
    if (isSlash && source !== null && this.player(source).alive && this.weaponName(source) === 'qinggang') return null;
    if (!this.player(target).alive) return null;
    for (const e of this.skillEntries(target, true)) {
      const a = e.skill.virtualArmor?.(this, target);
      if (a) return a;
    }
    return null;
  }

  /** Bát Trận trên tướng đang úp: khi cần Thiểm có thể lật tướng đó để dùng như Bát Quái Trận. */
  protected override hiddenVirtualArmor(seat: number, source: number | null, isSlash: boolean, armor: CardName): { label: string; reveal: () => Promise<void> } | null {
    const p = this.player(seat);
    if (!p.alive || this.equipOf(seat, 'armor') || !this.heroes[seat]) return null;
    if (isSlash && this.player(seat).flags.turn_ignoreArmor) return null;
    if (isSlash && source !== null && source !== seat && this.player(source).alive) {
      if (this.weaponName(source) === 'qinggang') return null;
      if (this.skillEntries(source, true).some((e) => e.skill.ignoreArmor?.(this, source, seat))) return null;
    }
    if (!this.canReveal(seat)) return null;
    const e = this.skillEntries(seat).find((x) => !x.slot.revealed && x.skill.virtualArmor?.(this, seat) === armor);
    if (!e) return null;
    return { label: e.skill.name, reveal: async () => { await this.reveal(seat, e.which); } };
  }

  override handLimit(seat: number): number {
    if (seat === this.bossSeat) return 6;
    return super.handLimit(seat) + this.sumBonus(seat, (s) => s.handLimitBonus) + peaceSpellBonus(this, seat);
  }

  /** Phong Dương: người lắp kỹ năng `protectEquip` (đã lật) cấm `chooser` lấy/bỏ trang bị của `target`. */
  override equipProtected(chooser: number, target: number): boolean {
    if (!this.heroes.length || !this.player(target).alive) return false;
    return this.alivePlayers().some((p) => this.skillEntries(p.seat, true).some((e) => e.skill.protectEquip?.(this, p.seat, chooser, target)));
  }

  override canTarget(source: number, target: number): boolean {
    return super.canTarget(source, target) && !this.skillEntries(source, true).some((e) => e.skill.restrictTarget?.(this, source, target));
  }

  override canBeSlashTarget(_source: number, target: number): boolean {
    return !this.skillEntries(target, true).some((e) => e.skill.slashImmune?.(this, target));
  }

  override responseBlocked(seat: number, accept: CardName[], source: number | null, context?: RespondContext): boolean {
    return this.alivePlayers().some((p) => this.skillEntries(p.seat, true)
      .some((e) => e.skill.blockResponse?.(this, p.seat, seat, accept, source, context)));
  }

  override async redirectPick(chooser: number, target: number, includeJudge: boolean): Promise<{ id: number; from: Zone } | null> {
    if (!this.heroes[target] || !this.player(target).alive) return null;
    for (const e of this.skillEntries(target)) {
      const r = await e.skill.redirectPick?.(this, target, chooser, includeJudge);
      if (r) return r;
    }
    return null;
  }

  override trickNoDistance(seat: number): boolean {
    return this.player(seat).alive && this.skillEntries(seat, true).some((e) => e.skill.trickNoDistance?.(this, seat));
  }

  override canSave(helper: number, dying: number): boolean {
    // Độc Thệ: người hấp hối có kỹ năng cấm người khác dùng Đào với mình
    if (this.player(dying).alive && this.skillEntries(dying, true).some((e) => e.skill.blockSaveSelf?.(this, dying, helper))) return false;
    const cur = this.state.currentSeat;
    if (!this.player(cur).alive) return true;
    return !this.skillEntries(cur, true).some((e) => e.skill.blockSave?.(this, cur, helper, dying));
  }

  /** Lá được chuyển hóa bằng kỹ năng của tướng úp -> lật tướng đó. Sát vượt giới hạn nhờ Bào Hao úp -> lật. */
  protected override async onCardUsedAs(seat: number, card: Card, as: CardName, mode: UseMode): Promise<void> {
    const name = this.player(seat).name;
    if (as !== card.name) {
      const providers = this.skillEntries(seat).filter((e) => e.skill.convert?.(this, seat, card).includes(as));
      const e = providers.find((x) => x.slot.revealed) ?? providers[0];
      if (e) {
        if (!e.slot.revealed) await this.reveal(seat, e.which);
        this.say(`${name} dùng ${e.skill.name}.`);
        if (e.slot.generalId) this.stat({ kind: 'skillUsed', seat, skill: e.skill.id, generalId: e.slot.generalId });
      }
    }
    if (as === 'sha' && mode === 'use') {
      const used = this.player(seat).flags.shaUsed ?? 0;
      if (used >= this.revealedSlashLimit(seat)) {
        const e = this.skillEntries(seat).find((x) => !x.slot.revealed && (x.skill.slashLimit ?? 1) > used);
        if (e) {
          await this.reveal(seat, e.which);
          this.say(`${name} dùng ${e.skill.name}.`);
        }
      }
    }
  }

  protected override async beforeDeath(seat: number): Promise<void> {
    if (!this.heroes[seat]) return;
    await this.reveal(seat, 'main');
    await this.reveal(seat, 'deputy');
  }

  // ---------- Kỹ năng chủ động và ký hiệu ----------

  private checkActiveArgs(seat: number, a: ActiveSkill, cardIds: number[], targets: number[]): string | null {
    const hand = this.player(seat).hand;
    if (new Set(cardIds).size !== cardIds.length || !cardIds.every((id) => hand.includes(id))) return 'Lá bài không hợp lệ';
    if (a.cards === 'none' && cardIds.length !== 0) return 'Kỹ năng này không cần chọn bài';
    if (a.cards === 'one' && cardIds.length !== 1) return 'Cần chọn đúng 1 lá';
    if (a.cards === 'any' && cardIds.length < 1) return 'Cần chọn ít nhất 1 lá';
    if (a.target === 'none' && targets.length !== 0) return 'Kỹ năng này không cần mục tiêu';
    const extra = a.checkCards?.(this, seat, cardIds);
    if (extra) return extra;
    if (a.target === 'one' && (targets.length !== 1 || !a.validTarget?.(this, seat, targets[0]) || !this.canTarget(seat, targets[0]))) return 'Mục tiêu không hợp lệ';
    return null;
  }

  /** Bảng xem tướng: ghi chú kèm tên tướng. */
  override showInfo(seat: number, info: { title: string; cardIds?: number[]; generals?: string[]; text?: string; noteText?: string }): void {
    super.showInfo(seat, { ...info, noteText: info.noteText ?? (info.generals?.length ? info.generals.map((id) => getGeneral(id).name).join(', ') : undefined) });
  }

  /** Âm Dương Ngư (hoặc dấu Dã Tâm Gia): đầu giai đoạn bỏ bài, nếu phải bỏ bài thì có thể tiêu để +2 giới hạn trữ bài lượt này. */
  protected override async beforeDiscardPhase(seat: number): Promise<void> {
    const h = this.heroes[seat];
    if (!h || (!h.marks.yinyang && !h.marks.ambition)) return;
    const p = this.player(seat);
    const over = p.hand.length - this.handLimit(seat);
    const res = await this.ask({ type: 'confirm', seat, skill: MARK_SKILL.yinyangLimit, reveal: false,
      prompt: `Dùng ký hiệu ${h.marks.yinyang ? 'Âm Dương Ngư' : 'Dã Tâm Gia (thay Âm Dương Ngư)'}: +2 giới hạn trữ bài lượt này (đang phải bỏ ${over} lá)?` });
    if (res.kind !== 'yes' || !this.useMark(h, 'yinyang')) return;
    p.flags.turn_handLimitDelta = (p.flags.turn_handLimitDelta ?? 0) + 2;
    this.say(`${p.name} dùng ký hiệu Âm Dương Ngư: +2 giới hạn trữ bài lượt này.`);
  }

  /** Tiêu 1 ký hiệu loại `kind`; hết thì dùng dấu Dã Tâm Gia thay. */
  private useMark(h: HeroState, kind: 'yinyang' | 'pioneer' | 'pair'): boolean {
    if (h.marks[kind] > 0) { h.marks[kind]--; return true; }
    if (h.marks.ambition > 0) { h.marks.ambition--; return true; }
    return false;
  }

  protected override async useSkillAction(seat: number, res: Extract<Response, { kind: 'useSkill' }>): Promise<string | null> {
    if (typeof res.skill !== 'string' || !Array.isArray(res.cardIds) || !Array.isArray(res.targets)) return 'Yêu cầu không hợp lệ';
    const p = this.player(seat);
    const h = this.hero(seat);

    if (res.skill === MARK_SKILL.yinyang) {
      if (!this.useMark(h, 'yinyang')) return 'Không có ký hiệu Âm Dương Ngư';
      this.say(`${p.name} dùng ký hiệu Âm Dương Ngư.`);
      await this.draw(seat, 1);
      return null;
    }
    if (res.skill === MARK_SKILL.pioneer) {
      if (!this.useMark(h, 'pioneer')) return 'Không có ký hiệu Tiên Khu';
      this.say(`${p.name} dùng ký hiệu Tiên Khu.`);
      await this.draw(seat, Math.max(0, 4 - p.hand.length));
      return null;
    }

    if (res.skill === MARK_SKILL.pair) {
      if (!this.useMark(h, 'pair')) return 'Không có ký hiệu Châu Liên Bích Hợp';
      this.say(`${p.name} dùng ký hiệu Châu Liên Bích Hợp để bốc 2 lá.`);
      await this.draw(seat, 2);
      return null;
    }
    if (res.skill === 'transfer') {
      if (p.flags.turn_transferUsed) return 'Mỗi giai đoạn ra bài chỉ Hợp Tung một lần';
      const ids = [...new Set(res.cardIds)];
      const [t] = res.targets;
      if (ids.length < 1 || ids.length > 3 || ids.some((id) => !p.hand.includes(id) || !this.isTransferable(seat, id))) return 'Chọn 1–3 lá có dấu Hợp Tung trên tay';
      if (res.targets.length !== 1 || !this.transferTargets(seat).includes(t)) return 'Mục tiêu Hợp Tung không hợp lệ';
      await this.doTransfer(seat, ids, t);
      return null;
    }
    if (res.skill === 'reveal:main' || res.skill === 'reveal:deputy') {
      const which = res.skill === 'reveal:main' ? 'main' : 'deputy';
      if (h[which].revealed || h[which].removed) return 'Tướng này đã lật hoặc đã bị loại';
      if (!this.canReveal(seat)) return 'Lúc này không thể lật tướng';
      await this.reveal(seat, which);
      return null;
    }
    if (res.skill === MARK_SKILL.pairTao) {
      if (h.marks.pair + h.marks.ambition <= 0) return 'Không có ký hiệu Châu Liên Bích Hợp';
      if (p.hp >= p.maxHp) return 'Máu đang đầy';
      this.useMark(h, 'pair');
      this.say(`${p.name} dùng ký hiệu Châu Liên Bích Hợp như Đào.`);
      await this.recover(seat, 1, seat);
      return null;
    }

    const e = this.skillEntries(seat).find((x) => x.skill.id === res.skill && x.skill.active);
    if (!e) return 'Bạn không có kỹ năng này';
    const a = e.skill.active!;
    if (!a.available(this, seat)) return 'Kỹ năng hiện không dùng được';
    const err = this.checkActiveArgs(seat, a, res.cardIds, res.targets);
    if (err) return err;

    if (!e.slot.revealed) await this.reveal(seat, e.which);
    this.say(`${p.name} dùng ${e.skill.name}.`);
    if (e.slot.generalId) this.stat({ kind: 'skillUsed', seat, skill: e.skill.id, generalId: e.slot.generalId });
    await this.asActor(seat, () => a.run(this, seat, res.cardIds, res.targets));
    return null;
  }

  /** Dùng ký hiệu Châu Liên Bích Hợp như Đào để cứu người hấp hối. */
  protected override async specialSave(helper: number, dying: number, res: Extract<Response, { kind: 'useSkill' }>): Promise<boolean> {
    const h = this.heroes[helper];
    if (res.skill !== MARK_SKILL.pairTao || !h || !this.useMark(h, 'pair')) return false;
    this.say(`${this.player(helper).name} dùng ký hiệu Châu Liên Bích Hợp như Đào cứu ${this.player(dying).name}.`);
    await this.recover(dying, 1, helper);
    return true;
  }

  // ==========================================================
  // Chế độ Thảo Phạt (đánh boss)
  // ==========================================================

  /** Máu tối đa của boss (boss nhiều mạng: máu mỗi mạng): (máu gốc + máu mỗi người chơi × số người) × hệ số độ khó. */
  bossMaxHp(): number {
    const def = this.bossDef!;
    return Math.max(1, Math.round((def.baseHp + def.hpPerPlayer * this.playerSeats().length) * BOSS_DIFFICULTY[this.bossDifficulty].hpMul));
  }

  /** Bộ đếm theo lượt cho kỹ năng boss (ví dụ "mỗi lượt tối đa 2 lần"). */
  bossCounter(name: string): number {
    return this.bossCounters.get(`${name}@${this.state.turnCount}`) ?? 0;
  }
  bossCount(name: string): void {
    const k = `${name}@${this.state.turnCount}`;
    this.bossCounters.set(k, (this.bossCounters.get(k) ?? 0) + 1);
  }

  /** Người chơi còn sống có thù hận cao nhất (hòa thì người ít máu hơn), hoặc null. */
  bossTarget(): number | null {
    const cands = this.playerSeats().filter((s) => this.player(s).alive);
    if (!cands.length) return null;
    return cands.sort((a, b) => this.bossThreat[b] - this.bossThreat[a] || this.player(a).hp - this.player(b).hp)[0];
  }

  /** Đặt tướng boss, lật hết tướng của mọi người, chia phe Liên quân / Boss, trao Khiêu Chiến cho người chơi. */
  private setupBoss(): void {
    const b = this.bossSeat!;
    const def = this.bossDef!;
    if (!this.heroes[b]) this.assignGenerals(b, def.phases[0].general, def.deputy);
    const bp = this.player(b);
    bp.maxHp = bp.hp = this.bossMaxHp();
    for (const p of this.state.players) {
      const h = this.heroes[p.seat];
      if (!h) continue;
      h.main.revealed = h.deputy.revealed = true;
      h.bothRevealedHandled = true;
      if (p.seat === b) { h.careerist = true; h.careeristGroup = b; }
      p.team = this.teamLabel(p.seat);
      if (p.seat !== b) this.grantSkill(p.seat, 'khieuchien', false);
    }
    this.anyRevealed = true;
    this.say(`⚔ Thảo Phạt: ${def.name} (${BOSS_DIFFICULTY[this.bossDifficulty].label}) — ${bp.maxHp} máu, giới hạn ${def.roundLimit} vòng, ${this.bossFood} Quân lương.`);
  }

  private installBossMode(): void {
    const diff = BOSS_DIFFICULTY[this.bossDifficulty];
    const isBoss = (s: number | null) => s !== null && s === this.bossSeat;
    // Boss bốc thêm bài ở độ khó cao
    this.bus.on('drawPhase', (ctx) => { if (isBoss(ctx.seat)) ctx.count += diff.drawBonus; });
    // Đổi giai đoạn khi máu xuống ngưỡng (trước khi xét hấp hối)
    this.bus.on('damageDealt', async (ctx) => { if (isBoss(ctx.target)) await this.bossCheckPhase(ctx.nature === 'fire'); }, 1000);
    this.bus.on('hpLost', async (ctx) => { if (isBoss(ctx.seat)) await this.bossCheckPhase(false); }, 1000);
    // Thù hận
    this.bus.on('damageDealt', (ctx) => { if (isBoss(ctx.target) && ctx.source !== null && !isBoss(ctx.source)) this.bossThreat[ctx.source] += 2 * ctx.amount; }, -100);
    this.bus.on('recovered', (ctx) => { if (ctx.source !== null && !isBoss(ctx.source) && !isBoss(ctx.seat)) this.bossThreat[ctx.source] += ctx.amount; }, -100);
    this.statListeners.push((e) => {
      if (e.kind === 'nullified' && e.cancelled && isBoss(e.user) && !isBoss(e.by)) this.bossThreat[e.by] += 2;
    });
    // Người chơi chết: chờ 2 lượt boss rồi sống lại (tốn 1 Quân lương)
    this.bus.on('death', ({ seat }) => {
      if (isBoss(seat)) return;
      this.bossThreat[seat] = 0;
      if (this.surrendered.has(seat)) return; // đầu hàng: không hồi sinh
      if (this.bossFood > 0) {
        this.bossFood--;
        this.bossReviving.set(seat, 2);
        this.say(`${this.player(seat).name} về doanh trại: sống lại sau 2 lượt của boss (Quân lương còn ${this.bossFood}).`);
      } else {
        this.say(`Hết Quân lương: ${this.player(seat).name} không thể sống lại.`);
      }
    }, -100);
    this.bus.on('turnStart', async ({ seat }) => {
      if (!isBoss(seat)) return;
      this.bossRound++;
      if (this.bossRound > this.bossDef!.roundLimit) {
        this.say(`Quá ${this.bossDef!.roundLimit} vòng: Liên quân không hạ được boss.`);
        await this.finish('Boss', 'victory');
      }
      this.say(`Vòng ${this.bossRound}/${this.bossDef!.roundLimit} của boss.`);
    }, 1000);
    this.bus.on('turnEnd', async ({ seat }) => {
      if (!isBoss(seat)) return;
      for (const [s, left] of [...this.bossReviving]) {
        if (left > 1) { this.bossReviving.set(s, left - 1); continue; }
        this.bossReviving.delete(s);
        if (this.state.finished) continue;
        await this.revive(s, 2, 2);
        this.player(s).team = this.teamLabel(s);
      }
    });
  }

  /** Máu boss xuống ngưỡng giai đoạn kế -> đổi tướng, hồi máu, bỏ khu vực phán định. */
  private async bossCheckPhase(fire: boolean): Promise<void> {
    const b = this.bossSeat!;
    const def = this.bossDef!;
    const p = this.player(b);
    const h = this.hero(b);
    // Boss nhiều mạng (Thất Cầm Thất Túng): về 0 máu là bị bắt; chưa đủ số lần thì thả ra đầy máu
    if (def.lives && p.hp <= 0) {
      this.bossCaptures = Math.min(def.lives, this.bossCaptures + (fire ? 2 : 1));
      this.say(`⛓ ${def.name}: bắt được lần ${this.bossCaptures}/${def.lives}${fire ? ' (sát thương Hỏa tính 2 lần)' : ''}.`);
      if (this.bossCaptures < def.lives) {
        p.hp = p.maxHp;
        p.chained = false;
        p.faceDown = false;
        if (p.judgeArea.length) await this.moveCards([...p.judgeArea], { kind: 'judge', seat: b }, { kind: 'discard' }, 'bossCapture');
        this.say(`${p.name} được thả ra (Tái Khởi): đầy máu ${p.hp}/${p.maxHp}, bốc 2 lá.`);
        await this.draw(b, 2);
      }
    }
    const reached = (ph: BossDef['phases'][number]) => (ph.capture !== undefined ? this.bossCaptures >= ph.capture : p.hp <= Math.floor(p.maxHp * ph.at));
    while (this.bossPhase < def.phases.length - 1 && p.hp > -100 && reached(def.phases[this.bossPhase + 1])) {
      this.bossPhase++;
      const ph = def.phases[this.bossPhase];
      h.main = { generalId: ph.general, revealed: true };
      p.hp = Math.max(1, Math.min(p.maxHp, Math.max(p.hp, 0) + ph.heal));
      p.chained = false;
      p.faceDown = false;
      if (p.judgeArea.length) await this.moveCards([...p.judgeArea], { kind: 'judge', seat: b }, { kind: 'discard' }, 'bossPhase');
      this.say(`🔥 ${def.name} chuyển sang giai đoạn ${this.bossPhase + 1}: ${ph.name}! Hồi ${ph.heal} máu (còn ${p.hp}/${p.maxHp}).`);
    }
  }

  /** Khiêu Chiến: thù hận của `seat` trở thành cao nhất. */
  tauntBoss(seat: number): void {
    this.bossThreat[seat] = Math.max(0, ...this.bossThreat) + 1;
    this.say(`${this.player(seat).name} khiêu chiến: boss sẽ nhắm vào ${this.player(seat).name}.`);
  }

  /** Lượt kế tiếp: người chơi lần lượt, hết 1 vòng thì tới boss. */
  protected override nextTurnSeat(prev: number): number {
    const b = this.bossSeat;
    if (b === null) return super.nextTurnSeat(prev);
    const players = this.playerSeats();
    const n = this.state.players.length;
    const nextPlayer = (from: number) => {
      for (let k = 1; k <= n; k++) {
        const s = (from + k + n) % n;
        if (s !== b && this.player(s).alive) return s;
      }
      return b;
    };
    if (prev === b) {
      this.bossSince = 0;
      return nextPlayer(this.bossLastPlayer < 0 ? -1 : this.bossLastPlayer);
    }
    this.bossLastPlayer = prev;
    this.bossSince++;
    // Boss đi sau khi mọi người chơi còn sống đã đi 1 lượt (1 vòng)
    const interval = Math.max(1, players.filter((s) => this.player(s).alive).length);
    if (this.bossSince >= interval && this.player(b).alive) return b;
    return nextPlayer(prev);
  }

  /**
   * Góc nhìn khán giả (theo dõi ván): không có bài trên tay, không thấy tướng úp của ai,
   * không có ghi chú riêng hay gợi ý. Bàn được xoay theo ghế 0.
   */
  spectatorView(): PlayerView {
    const v = this.makeView(0);
    v.myHand = [];
    v.hints = [];
    v.responseOptions = [];
    v.notes = [];
    v.reveals = [];
    delete v.skillHints;
    delete v.specialSaves;
    v.players = v.players.map((pp) => {
      const h = this.heroes[pp.seat];
      if (!h || !pp.generals) return pp;
      const dead = !this.player(pp.seat).alive;
      const sv = (s: HeroSlot): SlotView => ({
        generalId: s.revealed || s.removed || dead ? s.generalId : null,
        revealed: s.revealed,
        ...(s.removed ? { removed: true } : {}),
      });
      return {
        ...pp,
        generals: { main: sv(h.main), deputy: sv(h.deputy) },
        ...(pp.generalPiles ? { generalPiles: pp.generalPiles.map(({ name, count }) => ({ name, count })) } : {}),
      };
    });
    v.spectator = true;
    return v;
  }

  bossView(): BossView | undefined {
    if (this.bossSeat === null) return undefined;
    const def = this.bossDef!;
    const diff = BOSS_DIFFICULTY[this.bossDifficulty];
    return {
      seat: this.bossSeat, id: def.id, name: def.name, difficulty: this.bossDifficulty, difficultyLabel: diff.label,
      phase: this.bossPhase, phases: def.phases.map((p) => p.name), round: this.bossRound, roundLimit: def.roundLimit,
      food: this.bossFood, foodMax: diff.food, threat: [...this.bossThreat], reviving: Object.fromEntries(this.bossReviving),
      ...(def.lives ? { captures: this.bossCaptures, lives: def.lives } : {}),
      ...(def.tokenName ? { tokens: this.bossTokens, tokenName: def.tokenName } : {}),
    };
  }

  // ==========================================================
  // Thưởng / phạt và điều kiện thắng
  // ==========================================================

  private async rewardOrPunish(victim: number, killer: number | null): Promise<void> {
    if (killer === null || killer === victim || this.bossSeat !== null) return;
    const k = this.player(killer);
    if (!k.alive || this.shownKingdom(killer) === null) return; // chưa lộ phe: không thưởng không phạt
    if (this.skillEntries(killer, true).some((e) => e.skill.skipRewardPunish?.(this, killer, victim))) {
      this.say(`${k.name} bỏ qua thưởng phạt.`);
      return;
    }

    if (this.isSameFaction(killer, victim)) {
      this.say(`${k.name} giết người cùng phe, phải bỏ toàn bộ bài trên tay.`);
      await this.moveCards([...k.hand], { kind: 'hand', seat: killer }, { kind: 'discard' }, 'penalty');
      return;
    }
    const vk = this.shownKingdom(victim);
    const n = vk === 'careerist' ? 1 : this.state.players.filter((p) => this.shownKingdom(p.seat) === vk).length;
    this.say(`${k.name} hạ gục người khác phe, được bốc ${n} lá.`);
    await this.draw(killer, n, 'reward');
  }

  override checkWinner(): string | null {
    const alive = this.alivePlayers();
    if (alive.length === 0 || this.heroes.length === 0) return null;
    if (this.bossSeat !== null) {
      if (!this.player(this.bossSeat).alive) return 'Liên quân';
      if (!this.playerSeats().some((s) => this.player(s).alive)) return 'Boss';
      return null;
    }
    const careerists = alive.filter((p) => this.hero(p.seat).careerist);
    if (careerists.length > 0) {
      // Dã tâm gia (và đồng minh Lạp Long Nhân Tâm) thắng khi chỉ còn người trong nhóm của họ
      const keys = new Set(alive.map((p) => (this.hero(p.seat).careerist ? `c${this.hero(p.seat).careeristGroup ?? p.seat}` : 'other')));
      if (keys.size !== 1 || keys.has('other')) return null;
      const lead = this.hero(careerists[0].seat).careeristGroup ?? careerists[0].seat;
      return `Dã tâm gia ${this.player(lead).name}`;
    }

    const kingdoms = new Set(alive.map((p) => this.realKingdom(p.seat)));
    if (kingdoms.size !== 1) return null;
    // Bạo lộ dã tâm: phe "giả" sắp thắng mà còn người có chủ tướng tím đang úp -> buộc lật, ván chưa kết thúc
    const hiddenYe = alive.filter((p) => { const h = this.hero(p.seat); return getGeneral(h.main.generalId).kingdom === 'ye' && !h.main.revealed && !h.main.removed; });
    if (hiddenYe.length) {
      for (const p of hiddenYe) { this.exposeCareerist(p.seat); this.pendingRecruit.push(p.seat); }
      return this.checkWinner();
    }
    const k = [...kingdoms][0];
    const hidden = alive.filter((p) => !this.isRevealedAny(p.seat));
    // Nếu lật hết mà thế lực này vượt quá một nửa -> sẽ có người thành dã tâm gia -> chưa kết thúc
    const total = this.state.players.filter((p) => this.shownKingdom(p.seat) === k).length + hidden.length;
    if (hidden.length > 0 && total > this.state.players.length / 2) return null;
    for (const p of hidden) this.revealSilently(p.seat);
    return KINGDOM_LABEL[k];
  }

  // ==========================================================
  // View
  // ==========================================================

  override makeView(seat: number, req?: Request): PlayerView {
    const v = viewFor(this, seat, req);
    v.players = v.players.map((pp) => {
      const h = this.heroes[pp.seat];
      if (!h) return pp;
      const visible = pp.seat === seat || !this.player(pp.seat).alive;
      const known = this.known.get(seat);
      const sv = (s: HeroSlot): SlotView => ({
        generalId: visible || s.revealed || s.removed || known?.has(s.generalId) ? s.generalId : null,
        revealed: s.revealed,
        ...(s.removed ? { removed: true } : {}),
      });
      return {
        ...pp,
        team: this.shownKingdom(pp.seat) === null ? null : this.teamLabel(pp.seat),
        kingdom: this.shownKingdom(pp.seat),
        generals: { main: sv(h.main), deputy: sv(h.deputy) },
        marks: { ...h.marks },
        ...(h.careerist && h.careeristGroup !== undefined && this.shownKingdom(pp.seat) === 'careerist' ? { careeristGroup: h.careeristGroup } : {}),
        ...(this.generalPilesOf(pp.seat).length ? {
          generalPiles: this.generalPilesOf(pp.seat).map(([name, pile]) => ({
            name, count: pile.ids.length, ...(pile.open || pp.seat === seat ? { ids: [...pile.ids] } : {}),
          })),
        } : {}),
        ...(isLordId(h.main.generalId) && (h.main.revealed || visible) ? { lord: true } : {}),
      };
    });
    if (this.bossSeat !== null) v.boss = this.bossView();
    if (req?.type === 'play') v.skillHints = this.skillHints(seat);
    if (req?.type === 'save' && ((this.heroes[seat]?.marks.pair ?? 0) + (this.heroes[seat]?.marks.ambition ?? 0)) > 0) {
      v.specialSaves = [{ skill: MARK_SKILL.pairTao, name: 'Châu Liên Bích Hợp (dùng như Đào)' }];
    }
    return v;
  }

  private skillHints(seat: number): SkillHint[] {
    const out: SkillHint[] = [];
    for (const e of this.skillEntries(seat)) {
      const a = e.skill.active;
      if (!a || !a.available(this, seat)) continue;
      const targets = a.target === 'one'
        ? this.alivePlayers().map((p) => p.seat).filter((t) => a.validTarget?.(this, seat, t) && this.canTarget(seat, t))
        : [];
      if (a.target === 'one' && targets.length === 0) continue;
      const hand = this.player(seat).hand;
      const validCards = a.cards === 'none' ? [] : hand.filter((id) => !a.cardOk || a.cardOk(this, seat, id));
      const minCards = a.minCards ?? (a.cards === 'none' ? 0 : 1);
      if (validCards.length < minCards) continue;
      out.push({
        skill: e.skill.id, name: e.skill.name, cards: a.cards, targets, needsTarget: a.target === 'one', reveals: !e.slot.revealed,
        minCards, maxCards: a.maxCards ?? (a.cards === 'one' ? 1 : a.cards === 'none' ? 0 : hand.length), validCards,
      });
    }
    const h = this.heroes[seat];
    const amb = h?.marks.ambition ? ' — dấu Dã Tâm Gia' : '';
    if (h?.marks.yinyang || h?.marks.ambition) {
      out.push({ skill: MARK_SKILL.yinyang, name: `Âm Dương Ngư (bốc 1 lá)${h.marks.yinyang ? '' : amb}`, cards: 'none', targets: [], needsTarget: false, reveals: false });
    }
    if (h?.marks.pair || h?.marks.ambition) {
      out.push({ skill: MARK_SKILL.pair, name: `Châu Liên Bích Hợp (bốc 2 lá)${h.marks.pair ? '' : amb}`, cards: 'none', targets: [], needsTarget: false, reveals: false });
      if (this.player(seat).hp < this.player(seat).maxHp) {
        out.push({ skill: MARK_SKILL.pairTao, name: `Châu Liên Bích Hợp (như Đào)${h.marks.pair ? '' : amb}`, cards: 'none', targets: [], needsTarget: false, reveals: false });
      }
    }
    if ((h?.marks.pioneer || h?.marks.ambition) && this.player(seat).hand.length < 4) {
      out.push({ skill: MARK_SKILL.pioneer, name: `Tiên Khu (bốc đến 4 lá)${h.marks.pioneer ? '' : amb}`, cards: 'none', targets: [], needsTarget: false, reveals: false });
    }
    // Hợp Tung (合纵): mỗi giai đoạn ra bài một lần, giao tối đa 3 lá có dấu "Hợp Tung" cho người không cùng thế lực / chưa xác định thế lực
    const tCards = this.player(seat).hand.filter((id) => this.isTransferable(seat, id));
    const tTargets = this.transferTargets(seat);
    if (!this.player(seat).flags.turn_transferUsed && tCards.length && tTargets.length) {
      out.push({ skill: 'transfer', name: 'Hợp Tung (giao tối đa 3 lá)', cards: 'any', targets: tTargets, needsTarget: true, reveals: false, minCards: 1, maxCards: Math.min(3, tCards.length), validCards: tCards });
    }
    // Trong lượt của mình: lật tướng đang úp bất cứ lúc nào (để kỹ năng tỏa định / bị động có hiệu lực ngay)
    if (h && this.canReveal(seat)) {
      for (const which of ['main', 'deputy'] as const) {
        const slot = h[which];
        if (slot.revealed || slot.removed) continue;
        out.push({ skill: `reveal:${which}`, name: `Lật ${SLOT_LABEL[which]} ${getGeneral(slot.generalId).name}`, cards: 'none', targets: [], needsTarget: false, reveals: true });
      }
    }
    return out;
  }
}

/** Tỏa định kỹ (không bị Thiết Kỵ vô hiệu): không có phần chủ động / chuyển hóa và mọi trigger đều là tỏa định. */
function isLockedSkill(skill: Skill): boolean {
  return !skill.active && !skill.convert && (skill.triggers ?? []).every((t) => t.compulsory);
}
