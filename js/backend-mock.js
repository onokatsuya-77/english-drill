// 動作確認用のデータ層（Firebase なし。localStorage に保存）。index.html?mock=1 で使う。
const LS = 'ed-mock';
const load = () => JSON.parse(localStorage.getItem(LS) || '{"materials":{},"chunks":{},"users":{}}');
const save = s => localStorage.setItem(LS, JSON.stringify(s));
let authCb = null;
const user = { uid: 'mock-uid', email: 'test@example.com', name: 'テスト利用者', photo: '' };
const subs = { cards: [], days: [] };
const emit = (uid, pid) => {
  const s = load(); const p = s.users[uid]?.profiles?.[pid]; if (!p) return;
  subs.cards.forEach(f => f(Object.entries(p.cards || {}).map(([id, data]) => ({ type: 'added', id, data })), false));
  subs.days.forEach(f => f(Object.entries(p.days || {}).map(([key, d]) => ({ key, ...d }))));
};
const addDeep = (t, d) => { for (const [k, v] of Object.entries(d)) { if (v && typeof v === 'object') { t[k] ||= {}; addDeep(t[k], v); } else t[k] = (t[k] || 0) + v; } };

export const backend = {
  name: 'mock',
  async signIn() { localStorage.setItem(LS + ':signed', '1'); authCb?.(user); },
  async signOut() { localStorage.removeItem(LS + ':signed'); authCb?.(null); },
  onAuth(cb) { authCb = cb; setTimeout(() => cb(localStorage.getItem(LS + ':signed') ? user : null), 0); return () => { authCb = null; }; },
  async listMaterials() { return Object.values(load().materials).sort((a, b) => (a.order || 0) - (b.order || 0)); },
  async loadChunks(materialId, kind) { return (load().chunks[`${materialId}/${kind}`] || []).flatMap(c => c.items); },
  async saveMaterial(material, cardChunks, passageChunks, onProgress, imageChunks = [], extraChunks = []) {
    const s = load(); const version = Date.now();
    s.materials[material.id] = { ...material, version, cardChunks: cardChunks.length, passageChunks: passageChunks.length, imageChunks: imageChunks.length, extraChunks: extraChunks.length };
    s.chunks[`${material.id}/images`] = imageChunks.map((items, i) => ({ i, items }));
    s.chunks[`${material.id}/extras`] = extraChunks.map((items, i) => ({ i, items }));
    s.chunks[`${material.id}/cards`] = cardChunks.map((items, i) => ({ i, items }));
    s.chunks[`${material.id}/passages`] = passageChunks.map((items, i) => ({ i, items }));
    save(s); onProgress?.(1); return version;
  },
  async checkAdmin() { return true; },
  async ensureUser(u) { const s = load(); s.users[u.uid] ||= { profiles: {} }; save(s); },
  async listProfiles(uid) { const s = load(); return Object.entries(s.users[uid]?.profiles || {}).map(([id, p]) => ({ id, ...p.meta })).sort((a, b) => a.createdAt - b.createdAt); },
  async createProfile(uid, data) { const s = load(); const id = 'p' + Date.now(); s.users[uid].profiles[id] = { meta: { ...data, createdAt: Date.now() }, cards: {}, days: {} }; save(s); return id; },
  async updateProfile(uid, pid, patch) { const s = load(); Object.assign(s.users[uid].profiles[pid].meta, patch); save(s); },
  async deleteProfile(uid, pid) { const s = load(); delete s.users[uid].profiles[pid]; save(s); },
  subscribeCardStates(uid, pid, cb) { subs.cards.push(cb); setTimeout(() => emit(uid, pid), 0); return () => { subs.cards = subs.cards.filter(f => f !== cb); }; },
  subscribeDays(uid, pid, cb) { subs.days.push(cb); setTimeout(() => emit(uid, pid), 0); return () => { subs.days = subs.days.filter(f => f !== cb); }; },
  async saveReview(uid, pid, cardId, state, log, dayKey, delta) {
    const s = load(); const p = s.users[uid].profiles[pid];
    p.cards[cardId] = state; (p.logs ||= []).push({ cardId, ...log });
    const d = (p.days[dayKey] ||= { date: dayKey }); addDeep(d, delta);
    save(s);
    subs.cards.forEach(f => f([{ type: 'modified', id: cardId, data: state }], false));
    subs.days.forEach(f => f(Object.entries(p.days).map(([key, x]) => ({ key, ...x }))));
  },
  async saveBadges(uid, pid, badges) { await this.updateProfile(uid, pid, { badges }); },

  // 自分の教材
  async listOwnMaterials(uid) { const s = load(); return Object.values(s.users[uid]?.materials || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
  async loadOwnChunks(uid, mid) { const s = load(); return (s.users[uid]?.ownChunks?.[mid] || []).flatMap(c => c.items); },
  async saveOwnMaterial(uid, material, cardChunks) {
    const s = load(); const u = s.users[uid]; const version = Date.now();
    (u.materials ||= {})[material.id] = { ...material, version, cardChunks: cardChunks.length, createdAt: material.createdAt || Date.now() };
    (u.ownChunks ||= {})[material.id] = cardChunks.map((items, i) => ({ i, items }));
    save(s); return version;
  },
  async deleteOwnMaterial(uid, mid) { const s = load(); const u = s.users[uid]; delete u.materials?.[mid]; delete u.ownChunks?.[mid]; save(s); },
};
