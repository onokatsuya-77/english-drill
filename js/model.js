// アプリの状態と、教材ごとの学習キュー・覚え具合・進捗・バッジの計算。
import { schedule, emptyCard, State, Rating } from './fsrs.js';

const DAY = 86400000;
export const SOLID_DAYS = 21;      // 次の復習がこの日数以上先なら「定着」の候補
export const SOLID_ACC = 0.9;      // 定着: 直近の正解率がこれ以上
export const SHAKY_ACC = 0.7;      // あやしい: 直近の正解率がこれ未満
export const RECENT_N = 10;        // 正解率は直近この回数で計算
export const MISS_LAPSES = 3;      // 「よく間違える語」: もう一度を押した回数
export const PRACTICE_SIZE = 20;   // Section・あやしい語の練習で 1 回に出す数

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayStart(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

export const DEFAULT_SETTINGS = { goals: { minutes: 30, answers: 100 }, materials: {} };
export const DEFAULT_MAT = { enabled: true, newPerDay: 10, direction: 'en-ja', order: 'book', mode: 'mix', newStyle: 'quiz', minRank: 0 };
export const MODES = [['card', 'カード'], ['choice', '4択'], ['spell', 'つづり'], ['cloze', '穴埋め'], ['listen', 'リスニング'], ['mix', 'ミックス']];

/** 1 枚の覚え具合: new（未学習）/ shaky（あやしい）/ known（覚えた）/ solid（定着） */
export function masteryOf(s) {
  if (!s) return 'new';
  const rec = s.recent || '';
  const n = rec.length;
  const ok = n ? [...rec].filter(c => c === '1').length : 0;
  const acc = n ? ok / n : (s.reps ? 1 - (s.lapses || 0) / s.reps : 0);
  const lastWrong = n ? rec[n - 1] === '0' : false;
  if (s.state === State.Learning || s.state === State.Relearning || s.state === State.New || lastWrong || (n >= 3 && acc < SHAKY_ACC)) return 'shaky';
  if (s.state === State.Review && (s.scheduledDays || 0) >= SOLID_DAYS && acc >= SOLID_ACC) return 'solid';
  return 'known';
}
export const MASTERY = [
  { id: 'solid', name: '定着', color: '#2B3A8F', ink: '#FFFFFF', desc: `正解率${SOLID_ACC * 100}%以上で、次の復習が3週間以上先` },
  { id: 'known', name: '覚えた', color: '#4F5BD5', ink: '#FFFFFF', desc: '最近の答えがおおむね正解' },
  { id: 'shaky', name: 'あやしい', color: '#97A2FB', ink: '#141A33', desc: `正解率${SHAKY_ACC * 100}%未満、最近まちがえた、または覚えはじめ` },
];
export const TRACK = '#E6E8F0';

/** アプリ全体の状態。UI は 'change' イベントで再描画する。 */
export class Store extends EventTarget {
  constructor(backend) {
    super();
    this.backend = backend;
    this.user = null; this.profiles = []; this.profile = null;
    this.materials = []; this.cards = new Map(); // materialId → cards[]
    this.cardIndex = new Map(); // cardId → card
    this.states = new Map(); // cardId → fsrs state
    this.days = []; this.unsubs = [];
    this.loading = ''; this.ready = false; this.passages = new Map();
    this.isAdmin = false; this.denied = false;
    this.images = new Map(); // 挿絵 id → data URL
    this.imageKeys = new Set(); this.imageJobs = []; // 読み込みを始めた挿絵（教材@版）と、その読み込み
  }
  emit() { this.dispatchEvent(new Event('change')); }

  async start() {
    this.backend.onAuth(async user => {
      this.user = user; this.profiles = []; this.profile = null; this.ready = false; this.isAdmin = false; this.denied = false; this.error = '';
      this.unsubs.forEach(f => f()); this.unsubs = []; this.states = new Map(); this.days = []; this.cards = new Map(); this.cardIndex = new Map();
      if (user) {
        this.loading = '読み込み中';
        this.emit();
        try {
          // 最後に開いた日時の記録は待たない。管理者の確認・教材の一覧・学習者の一覧は並べて取る
          this.backend.ensureUser(user).catch(e => console.warn('ensureUser', e));
          const [isAdmin, , profiles] = await Promise.all([
            this.backend.checkAdmin?.() ?? false, this.loadMaterialList(), this.backend.listProfiles(user.uid)]);
          this.isAdmin = isAdmin; this.profiles = profiles;
          const last = localStorage.getItem(`ed-profile:${user.uid}`);
          const p = this.profiles.find(x => x.id === last) || (this.profiles.length === 1 ? this.profiles[0] : null);
          if (p) await this.selectProfile(p.id);
        } catch (e) {
          console.error(e);
          if (e.code === 'permission-denied') this.denied = true; else this.error = e.message;
        }
        this.loading = '';
      }
      this.ready = true; this.emit();
    });
  }

  async loadMaterialList() {
    const [shared, own] = await Promise.all([
      this.backend.listMaterials(), this.backend.listOwnMaterials ? this.backend.listOwnMaterials(this.user.uid) : []]);
    this.materials = [...shared.map(m => ({ ...m, own: false })), ...own.map(m => ({ ...m, own: true }))];
  }

  async selectProfile(pid) {
    const p = this.profiles.find(x => x.id === pid); if (!p) return;
    this.profile = p;
    p.settings = { ...DEFAULT_SETTINGS, ...(p.settings || {}) };
    p.settings.goals = { ...DEFAULT_SETTINGS.goals, ...(p.settings.goals || {}) };
    p.settings.materials ||= {};
    p.badges = normalizeBadges(p.badges);
    localStorage.setItem(`ed-profile:${this.user.uid}`, pid);
    this.unsubs.forEach(f => f()); this.unsubs = []; this.states = new Map(); this.days = [];
    this.loading = '学習記録を読み込み中'; this.emit();
    await this.loadEnabledMaterials();
    await new Promise(resolve => {
      let first = true;
      this.unsubs.push(this.backend.subscribeCardStates(this.user.uid, pid, (changes) => {
        for (const ch of changes) { if (ch.type === 'removed') this.states.delete(ch.id); else this.states.set(ch.id, ch.data); }
        if (first) { first = false; resolve(); }
        this.emit();
      }));
      this.unsubs.push(this.backend.subscribeDays(this.user.uid, pid, days => { this.days = days.sort((a, b) => a.key < b.key ? -1 : 1); this.emit(); }));
    });
    this.loading = ''; this.emit();
  }

  async createProfile(name) {
    const id = await this.backend.createProfile(this.user.uid, { name, settings: { ...DEFAULT_SETTINGS, materials: {} }, badges: [] });
    this.profiles = await this.backend.listProfiles(this.user.uid);
    await this.selectProfile(id);
  }
  async saveSettings(patch) {
    this.profile.settings = { ...this.profile.settings, ...patch };
    await this.backend.updateProfile(this.user.uid, this.profile.id, { settings: this.profile.settings });
    await this.loadEnabledMaterials(); this.emit();
  }
  /** 教材ごとの設定（newPerDay, direction, order, mode, enabled） */
  matSettings(mid) {
    const m = this.materials.find(x => x.id === mid);
    const saved = this.profile?.settings.materials[mid] || {};
    const enabledDefault = m?.own ? m.owner === this.profile?.id : true;
    return { ...DEFAULT_MAT, enabled: enabledDefault, ...saved };
  }
  async saveMatSettings(mid, patch) {
    const all = { ...this.profile.settings.materials, [mid]: { ...(this.profile.settings.materials[mid] || {}), ...patch } };
    await this.saveSettings({ materials: all });
  }
  async renameProfile(name) { this.profile.name = name; await this.backend.updateProfile(this.user.uid, this.profile.id, { name }); this.emit(); }

  enabledMaterials() { return this.materials.filter(m => this.matSettings(m.id).enabled); }
  enabledMaterialIds() { return this.enabledMaterials().map(m => m.id); }
  material(mid) { return this.materials.find(m => m.id === mid) || null; }

  /** 使う教材のカードを並べて読み込む。挿絵は待たずに後ろで読み込み、届いたら画面を描き直す */
  async loadEnabledMaterials() {
    const todo = this.enabledMaterials().filter(m => !this.cards.has(m.id));
    let done = 0;
    const tick = () => { if (this.loading && todo.length > 1) { this.loading = `教材を読み込み中（${++done}/${todo.length}）`; this.emit(); } };
    const loaded = await Promise.all(todo.map(m => (m.own
      ? this.backend.loadOwnChunks(this.user.uid, m.id, m.cardChunks, m.version)
      : this.backend.loadChunks(m.id, 'cards', m.cardChunks, m.version)).then(x => { tick(); return x; })));
    todo.forEach((m, k) => { this.cards.set(m.id, loaded[k]); loaded[k].forEach(c => this.cardIndex.set(c.id, c)); });
    for (const m of todo) {
      const key = `${m.id}@${m.version}`;
      if (!m.imageChunks || m.own || this.imageKeys.has(key)) continue;
      this.imageKeys.add(key);
      this.imageJobs.push(this.backend.loadChunks(m.id, 'images', m.imageChunks, m.version)
        .then(xs => { xs.forEach(x => this.images.set(x.id, x.src)); this.emit(); })
        .catch(e => { console.warn('images', e); this.imageKeys.delete(key); }));
    }
  }
  /** 後ろで読み込んでいる挿絵が届くまで待つ（テスト用） */
  async imagesLoaded() { await Promise.all(this.imageJobs); }
  async loadPassages(materialId) {
    if (this.passages.has(materialId)) return this.passages.get(materialId);
    const m = this.material(materialId);
    const p = m?.passageChunks ? await this.backend.loadChunks(materialId, 'passages', m.passageChunks, m.version) : [];
    this.passages.set(materialId, p); return p;
  }
  /** 教材の一覧を取り直す。版が変わった教材（登録し直した・消した教材）だけ読み込み直す */
  async refreshMaterials() {
    const before = new Map(this.materials.map(m => [m.id, m.version]));
    await this.loadMaterialList();
    const now = new Map(this.materials.map(m => [m.id, m.version]));
    for (const [id, ver] of before) {
      if (now.get(id) === ver) continue;
      for (const c of this.cards.get(id) || []) this.cardIndex.delete(c.id);
      this.cards.delete(id); this.passages.delete(id);
    }
    if (this.profile) await this.loadEnabledMaterials();
    this.emit();
  }

  // ---- 今日の状況 ----
  today() { return this.days.find(d => d.key === dayKey()) || { key: dayKey(), reviews: 0, newCards: 0, studyMs: 0, byM: {} }; }
  todayFor(mid) { const t = this.today(); return (t.byM && t.byM[mid]) || { reviews: 0, newCards: 0, studyMs: 0, again: 0 }; }
  stateOf(cardId) { return this.states.get(cardId) || null; }
  goals() {
    const g = this.profile.settings.goals;
    const newWords = this.enabledMaterials().reduce((a, m) => a + this.matSettings(m.id).newPerDay, 0);
    return { minutes: g.minutes, answers: g.answers, newWords: Math.max(1, newWords) };
  }

  /** 教材の今日の数: 復習（期限が来た復習）、学習中（期限が来た学習中）、新規の残り */
  counts(mid, now = Date.now()) {
    let due = 0, learning = 0;
    for (const c of this.cards.get(mid) || []) {
      const s = this.states.get(c.id); if (!s || s.due > now) continue;
      if (s.state === State.Review) due++; else learning++;
    }
    const ms = this.matSettings(mid);
    const newLeft = Math.max(0, ms.newPerDay - (this.todayFor(mid).newCards || 0));
    const newAvail = this.newCandidates(mid, newLeft).length;
    return { due, learning, review: due + learning, newLeft: Math.min(newLeft, newAvail), total: due + learning + Math.min(newLeft, newAvail) };
  }
  totalCounts(now = Date.now()) {
    let review = 0, fresh = 0;
    for (const id of this.enabledMaterialIds()) { const c = this.counts(id, now); review += c.review; fresh += c.newLeft; }
    return { review, fresh };
  }
  newCandidates(mid, limit, deckNo = null) {
    const out = [];
    if (limit <= 0) return out;
    const ms = this.matSettings(mid);
    let list = (this.cards.get(mid) || []).filter(c => !this.states.has(c.id) && (deckNo == null || c.deckNo === deckNo) && (c.rank == null || c.rank >= (ms.minRank || 0)));
    if (ms.order === 'random') list = seededShuffle(list, dayKey() + mid);
    for (const c of list) { out.push(c); if (out.length >= limit) break; }
    return out;
  }

  /**
   * 学習のキュー。kind:
   *  today … 期限の来た学習中 → 復習 → 今日の新規
   *  deck  … その Section（期限 → あやしい → 新規 → その他、最大 PRACTICE_SIZE）
   *  shaky … あやしい語（正解率の低い順）
   *  miss  … よく間違える語（もう一度の多い順）
   */
  buildQueue(mid, kind = 'today', arg = null, now = Date.now()) {
    const cards = this.cards.get(mid) || [];
    const st = c => this.states.get(c.id);
    if (kind === 'today') {
      const due = [], learning = [];
      for (const c of cards) { const s = st(c); if (s && s.due <= now) (s.state === State.Review ? due : learning).push(c); }
      const byDue = (a, b) => st(a).due - st(b).due;
      due.sort(byDue); learning.sort(byDue);
      const { newLeft } = this.counts(mid, now);
      return [...learning, ...due, ...this.newCandidates(mid, newLeft)];
    }
    if (kind === 'deck') {
      const deck = cards.filter(c => c.deckNo === Number(arg));
      const dueL = deck.filter(c => st(c) && st(c).due <= now);
      const shaky = deck.filter(c => st(c) && st(c).due > now && masteryOf(st(c)) === 'shaky');
      const fresh = deck.filter(c => !st(c));
      const rest = deck.filter(c => st(c) && st(c).due > now && masteryOf(st(c)) !== 'shaky');
      return [...dueL, ...shaky, ...fresh, ...rest].slice(0, PRACTICE_SIZE);
    }
    if (kind === 'shaky') {
      return cards.filter(c => st(c) && masteryOf(st(c)) === 'shaky')
        .sort((a, b) => accuracyOf(st(a)) - accuracyOf(st(b))).slice(0, PRACTICE_SIZE);
    }
    if (kind === 'extra') return this.newCandidates(mid, Number(arg) || 10);
    if (kind === 'miss') {
      return cards.filter(c => st(c) && (st(c).lapses || 0) >= MISS_LAPSES)
        .sort((a, b) => (st(b).lapses || 0) - (st(a).lapses || 0)).slice(0, PRACTICE_SIZE);
    }
    return [];
  }
  missCount(mid) { return (this.cards.get(mid) || []).filter(c => (this.states.get(c.id)?.lapses || 0) >= MISS_LAPSES).length; }

  /** 評価を記録する。correct: 正解だったか（カードは評価から決める）。戻り値は新しい状態。 */
  async review(card, rating, durationMs, extra = {}, now = Date.now()) {
    const prev = this.states.get(card.id) || emptyCard(now);
    const wasNew = !this.states.has(card.id);
    const { card: next, log } = schedule(prev, rating, now);
    const correct = rating !== Rating.Again;
    const recent = ((prev.recent || '') + (correct ? '1' : '0')).slice(-RECENT_N);
    const state = { ...next, m: card.m, deck: card.deckNo, recent, ok: (prev.ok || 0) + (correct ? 1 : 0), n: (prev.n || 0) + 1 };
    this.states.set(card.id, state);
    const key = dayKey(now);
    const studyMs = Math.min(durationMs, 60000);
    const one = { reviews: 1, studyMs };
    if (wasNew) one.newCards = 1;
    if (!correct) one.again = 1;
    const delta = { ...one, byM: { [card.m]: { ...one } } };
    let t = this.days.find(d => d.key === key);
    if (!t) { t = { key, byM: {} }; this.days.push(t); }
    addDelta(t, delta);
    this.emit();
    await this.backend.saveReview(this.user.uid, this.profile.id, card.id, state,
      { ...log, durationMs: studyMs, mode: extra.mode || 'card', direction: extra.direction || 'en-ja' }, key, delta);
    return state;
  }

  // ---- 覚え具合・進捗 ----
  mastery(mid) {
    const out = { total: 0, new: 0, shaky: 0, known: 0, solid: 0, ok: 0, n: 0, decks: new Map() };
    for (const c of this.cards.get(mid) || []) {
      const s = this.states.get(c.id);
      const k = masteryOf(s);
      out.total++; out[k]++;
      if (s?.recent) { out.n += s.recent.length; out.ok += [...s.recent].filter(x => x === '1').length; }
      let d = out.decks.get(c.deckNo);
      if (!d) { d = { no: c.deckNo, title: c.deck, total: 0, new: 0, shaky: 0, known: 0, solid: 0 }; out.decks.set(c.deckNo, d); }
      d.total++; d[k]++;
    }
    out.learned = out.known + out.solid;          // 習得
    out.studied = out.shaky + out.known + out.solid;
    out.accuracy = out.n ? out.ok / out.n : null;
    out.deckList = [...out.decks.values()].sort((a, b) => a.no - b.no);
    return out;
  }
  learnedTotal() { return this.enabledMaterialIds().reduce((a, id) => a + this.mastery(id).learned, 0); }

  streak(now = Date.now()) {
    const set = new Set(this.days.filter(d => (d.reviews || 0) > 0).map(d => d.key));
    let n = 0, t = dayStart(now);
    if (!set.has(dayKey(t))) t -= DAY; // 今日まだなら昨日から数える
    while (set.has(dayKey(t))) { n++; t -= DAY; }
    return n;
  }
  longestStreak() {
    const keys = this.days.filter(d => (d.reviews || 0) > 0).map(d => d.key).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      const t = new Date(k + 'T00:00:00').getTime();
      run = prev != null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = t;
    }
    return best;
  }
  totals() {
    let reviews = 0, studyMs = 0;
    for (const d of this.days) { reviews += d.reviews || 0; studyMs += d.studyMs || 0; }
    return { reviews, studyMs, learned: this.learnedTotal(), longest: this.longestStreak(), streak: this.streak(), studiedDays: this.days.filter(d => d.reviews > 0).length };
  }
  /** 直近 n 日（古い順）の日ごとの記録 */
  recentDays(n, now = Date.now()) {
    const out = []; let t = dayStart(now) - (n - 1) * DAY;
    for (let i = 0; i < n; i++, t += DAY) { const k = dayKey(t); out.push(this.days.find(d => d.key === k) || { key: k, reviews: 0, newCards: 0, studyMs: 0 }); }
    return out;
  }

  // ---- バッジ ----
  badgeStatus() {
    const t = this.totals();
    const have = new Map(this.profile.badges.map(b => [b.id, b.at]));
    return BADGES.map(b => {
      const value = b.value(t);
      return { ...b, value, earned: value >= b.goal || have.has(b.id), at: have.get(b.id) || null };
    });
  }
  /** 新しく獲得したバッジを記録して返す */
  async checkBadges(now = Date.now()) {
    const st = this.badgeStatus();
    const have = new Set(this.profile.badges.map(b => b.id));
    const fresh = st.filter(b => b.value >= b.goal && !have.has(b.id));
    if (!fresh.length) return [];
    this.profile.badges = [...this.profile.badges, ...fresh.map(b => ({ id: b.id, at: now }))];
    try { await this.backend.saveBadges(this.user.uid, this.profile.id, this.profile.badges); } catch (e) { console.warn('badges', e); }
    return fresh;
  }
}

export function accuracyOf(s) {
  if (!s?.recent) return s?.reps ? 1 - (s.lapses || 0) / s.reps : 0;
  return [...s.recent].filter(c => c === '1').length / s.recent.length;
}

function addDelta(target, delta) {
  for (const [k, v] of Object.entries(delta)) {
    if (v && typeof v === 'object') { target[k] ||= {}; addDelta(target[k], v); }
    else target[k] = (target[k] || 0) + v;
  }
}

function seededShuffle(arr, seed) {
  let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function normalizeBadges(b) {
  if (!Array.isArray(b)) return [];
  return b.map(x => typeof x === 'string' ? { id: x, at: null } : x).filter(x => x && x.id);
}

// ---- バッジ（種類 cat: first / streak / answers / words / hours） ----
export const BADGES = [
  { id: 'first', cat: 'first', name: 'はじめの一歩', mark: '1', goal: 1, unit: '回', value: t => t.reviews },
  { id: 'streak3', cat: 'streak', name: '3日連続', mark: '3', goal: 3, unit: '日', value: t => Math.max(t.longest, t.streak) },
  { id: 'streak7', cat: 'streak', name: '7日連続', mark: '7', goal: 7, unit: '日', value: t => Math.max(t.longest, t.streak) },
  { id: 'streak30', cat: 'streak', name: '30日連続', mark: '30', goal: 30, unit: '日', value: t => Math.max(t.longest, t.streak) },
  { id: 'streak100', cat: 'streak', name: '100日連続', mark: '100', goal: 100, unit: '日', value: t => Math.max(t.longest, t.streak) },
  { id: 'ans100', cat: 'answers', name: '100回答', mark: '100', goal: 100, unit: '回', value: t => t.reviews },
  { id: 'ans1000', cat: 'answers', name: '1000回答', mark: '1000', goal: 1000, unit: '回', value: t => t.reviews },
  { id: 'ans5000', cat: 'answers', name: '5000回答', mark: '5000', goal: 5000, unit: '回', value: t => t.reviews },
  { id: 'words100', cat: 'words', name: '100語習得', mark: '100', goal: 100, unit: '語', value: t => t.learned },
  { id: 'words500', cat: 'words', name: '500語習得', mark: '500', goal: 500, unit: '語', value: t => t.learned },
  { id: 'hours10', cat: 'hours', name: '10時間', mark: '10', goal: 10, unit: '時間', value: t => Math.floor(t.studyMs / 3600000) },
  { id: 'hours50', cat: 'hours', name: '50時間', mark: '50', goal: 50, unit: '時間', value: t => Math.floor(t.studyMs / 3600000) },
];
