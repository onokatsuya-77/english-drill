// アプリの状態と、学習セッション・進捗・バッジの計算。
import { schedule, emptyCard, State, Rating } from './fsrs.js';

const DAY = 86400000;
export const MATURE_DAYS = 21; // この日数以上の間隔で復習に回っているカードを「定着」とみなす

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayStart(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

export const DEFAULT_SETTINGS = { newPerDay: 10, direction: 'en-ja', materials: {} };

/** アプリ全体の状態。UI は store.on('change') で再描画する。 */
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
  }
  emit() { this.dispatchEvent(new Event('change')); }

  async start() {
    this.backend.onAuth(async user => {
      this.user = user; this.profiles = []; this.profile = null; this.ready = false; this.isAdmin = false;
      this.unsubs.forEach(f => f()); this.unsubs = []; this.states = new Map(); this.days = [];
      if (user) {
        this.loading = '読み込み中';
        this.emit();
        try {
          await this.backend.ensureUser(user);
          this.isAdmin = await (this.backend.checkAdmin?.() ?? false);
          this.materials = await this.backend.listMaterials();
          this.profiles = await this.backend.listProfiles(user.uid);
          const last = localStorage.getItem(`ed-profile:${user.uid}`);
          const p = this.profiles.find(x => x.id === last) || (this.profiles.length === 1 ? this.profiles[0] : null);
          if (p) await this.selectProfile(p.id);
        } catch (e) { console.error(e); this.error = e.message; }
        this.loading = '';
      }
      this.ready = true; this.emit();
    });
  }

  async selectProfile(pid) {
    const p = this.profiles.find(x => x.id === pid); if (!p) return;
    this.profile = p; p.settings = { ...DEFAULT_SETTINGS, ...(p.settings || {}) };
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
    const id = await this.backend.createProfile(this.user.uid, { name, settings: { ...DEFAULT_SETTINGS, materials: Object.fromEntries(this.materials.map(m => [m.id, { enabled: true }])) }, badges: [] });
    this.profiles = await this.backend.listProfiles(this.user.uid);
    await this.selectProfile(id);
  }
  async saveSettings(patch) {
    this.profile.settings = { ...this.profile.settings, ...patch };
    await this.backend.updateProfile(this.user.uid, this.profile.id, { settings: this.profile.settings });
    await this.loadEnabledMaterials(); this.emit();
  }
  async renameProfile(name) { this.profile.name = name; await this.backend.updateProfile(this.user.uid, this.profile.id, { name }); this.emit(); }

  enabledMaterialIds() {
    return this.materials.filter(m => this.profile?.settings.materials[m.id]?.enabled !== false).map(m => m.id);
  }
  async loadEnabledMaterials() {
    for (const m of this.materials) {
      if (this.profile.settings.materials[m.id]?.enabled === false || this.cards.has(m.id)) continue;
      const cards = await this.backend.loadChunks(m.id, 'cards', m.cardChunks, m.version);
      this.cards.set(m.id, cards); cards.forEach(c => this.cardIndex.set(c.id, c));
    }
  }
  async loadPassages(materialId) {
    if (this.passages.has(materialId)) return this.passages.get(materialId);
    const m = this.materials.find(x => x.id === materialId);
    const p = m?.passageChunks ? await this.backend.loadChunks(materialId, 'passages', m.passageChunks, m.version) : [];
    this.passages.set(materialId, p); return p;
  }
  async refreshMaterials() { this.materials = await this.backend.listMaterials(); this.cards.clear(); this.cardIndex.clear(); this.passages.clear(); if (this.profile) await this.loadEnabledMaterials(); this.emit(); }

  // ---- 今日の状況 ----
  today() { return this.days.find(d => d.key === dayKey()) || { key: dayKey(), reviews: 0, newCards: 0, studyMs: 0 }; }
  stateOf(cardId) { return this.states.get(cardId) || null; }

  /** 期限の来た復習カードと、今日の新規枠 */
  queueCounts(now = Date.now()) {
    const ids = new Set(this.enabledMaterialIds());
    let due = 0, learning = 0;
    for (const [id, s] of this.states) {
      const c = this.cardIndex.get(id); if (!c || !ids.has(c.m)) continue;
      if (s.due <= now) { if (s.state === State.Review) due++; else learning++; }
    }
    const t = this.today();
    const newLeft = Math.max(0, this.profile.settings.newPerDay - (t.newCards || 0));
    const newAvail = this.newCandidates(newLeft).length;
    return { due, learning, newLeft: Math.min(newLeft, newAvail), newAvail };
  }
  newCandidates(limit) {
    const out = [];
    if (limit <= 0) return out;
    for (const mid of this.enabledMaterialIds()) {
      const sel = this.profile.settings.materials[mid]?.decks; // undefined = 全部
      for (const c of this.cards.get(mid) || []) {
        if (this.states.has(c.id)) continue;
        if (sel && !sel.includes(c.deckNo)) continue;
        out.push(c); if (out.length >= limit) return out;
      }
    }
    return out;
  }
  /** 学習セッションのキュー（復習 → 学習中 → 新規） */
  buildQueue(now = Date.now()) {
    const ids = new Set(this.enabledMaterialIds());
    const due = [], learning = [];
    for (const [id, s] of this.states) {
      const c = this.cardIndex.get(id); if (!c || !ids.has(c.m)) continue;
      if (s.due <= now) (s.state === State.Review ? due : learning).push(c);
    }
    const byDue = (a, b) => this.states.get(a.id).due - this.states.get(b.id).due;
    due.sort(byDue); learning.sort(byDue);
    const { newLeft } = this.queueCounts(now);
    return [...learning, ...due, ...this.newCandidates(newLeft)];
  }

  /** 評価を記録する。戻り値は新しい状態。 */
  async review(card, rating, durationMs, now = Date.now()) {
    const prev = this.states.get(card.id) || emptyCard(now);
    const wasNew = prev.state === State.New && !this.states.has(card.id);
    const { card: next, log } = schedule(prev, rating, now);
    const state = { ...next, m: card.m, deck: card.deckNo };
    this.states.set(card.id, state);
    const key = dayKey(now);
    const delta = { reviews: 1, studyMs: Math.min(durationMs, 60000) };
    if (wasNew) delta.newCards = 1;
    if (rating === Rating.Again) delta.again = 1;
    const t = this.days.find(d => d.key === key);
    if (t) { for (const [k, v] of Object.entries(delta)) t[k] = (t[k] || 0) + v; } else this.days.push({ key, ...delta });
    this.emit();
    await this.backend.saveReview(this.user.uid, this.profile.id, card.id, state, { ...log, durationMs: delta.studyMs, direction: this.profile.settings.direction }, key, delta);
    return state;
  }

  // ---- 進捗 ----
  progress(materialId) {
    const cards = this.cards.get(materialId) || [];
    const counts = { total: cards.length, new: 0, learning: 0, young: 0, mature: 0 };
    const perDeck = new Map();
    for (const c of cards) {
      const s = this.states.get(c.id);
      let k;
      if (!s) k = 'new';
      else if (s.state === State.Review) k = s.scheduledDays >= MATURE_DAYS ? 'mature' : 'young';
      else k = 'learning';
      counts[k]++;
      const d = perDeck.get(c.deckNo) || { no: c.deckNo, title: c.deck, total: 0, new: 0, learning: 0, young: 0, mature: 0 };
      d.total++; d[k]++; perDeck.set(c.deckNo, d);
    }
    return { counts, decks: [...perDeck.values()] };
  }
  streak(now = Date.now()) {
    const set = new Set(this.days.filter(d => (d.reviews || 0) > 0).map(d => d.key));
    let n = 0, t = dayStart(now);
    if (!set.has(dayKey(t))) t -= DAY; // 今日まだなら昨日から数える
    while (set.has(dayKey(t))) { n++; t -= DAY; }
    return n;
  }
  totals() {
    let reviews = 0, studyMs = 0;
    for (const d of this.days) { reviews += d.reviews || 0; studyMs += d.studyMs || 0; }
    let mature = 0; for (const s of this.states.values()) if (s.state === State.Review && s.scheduledDays >= MATURE_DAYS) mature++;
    return { reviews, studyMs, mature, studiedDays: this.days.filter(d => d.reviews > 0).length };
  }
}

// ---- バッジ ----
export const BADGES = [
  { id: 'first', icon: '🌱', title: 'はじめの一歩', desc: '初めて学習した', test: t => t.reviews >= 1 },
  { id: 'streak3', icon: '🔥', title: '3日連続', desc: '3日続けて学習', test: (t, s) => s >= 3 },
  { id: 'streak7', icon: '🔥', title: '1週間連続', desc: '7日続けて学習', test: (t, s) => s >= 7 },
  { id: 'streak30', icon: '🏅', title: '30日連続', desc: '30日続けて学習', test: (t, s) => s >= 30 },
  { id: 'streak100', icon: '🏆', title: '100日連続', desc: '100日続けて学習', test: (t, s) => s >= 100 },
  { id: 'rev100', icon: '📘', title: '100回', desc: '復習 100 回', test: t => t.reviews >= 100 },
  { id: 'rev1000', icon: '📗', title: '1,000回', desc: '復習 1,000 回', test: t => t.reviews >= 1000 },
  { id: 'rev5000', icon: '📕', title: '5,000回', desc: '復習 5,000 回', test: t => t.reviews >= 5000 },
  { id: 'mat100', icon: '🧠', title: '定着 100', desc: '100 枚を定着（間隔 3 週間以上）', test: t => t.mature >= 100 },
  { id: 'mat500', icon: '🧠', title: '定着 500', desc: '500 枚を定着', test: t => t.mature >= 500 },
  { id: 'mat1000', icon: '💎', title: '定着 1,000', desc: '1,000 枚を定着', test: t => t.mature >= 1000 },
  { id: 'hour10', icon: '⏱️', title: '10時間', desc: '学習時間 10 時間', test: t => t.studyMs >= 10 * 3600000 },
  { id: 'hour50', icon: '⏱️', title: '50時間', desc: '学習時間 50 時間', test: t => t.studyMs >= 50 * 3600000 },
];
export function earnedBadges(store) {
  const t = store.totals(), s = store.streak();
  return BADGES.filter(b => b.test(t, s)).map(b => b.id);
}
