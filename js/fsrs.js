// FSRS-5 (Free Spaced Repetition Scheduler) — 依存なしの実装。
// 参考: open-spaced-repetition/fsrs4anki, ts-fsrs。既定パラメータは ts-fsrs v4 のもの。

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };

export const DEFAULT_PARAMS = {
  w: [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
      1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621],
  requestRetention: 0.9,
  maximumInterval: 36500,
};

const DECAY = -0.5;
const FACTOR = 19 / 81;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

export function nextInterval(stability, params = DEFAULT_PARAMS) {
  const r = params.requestRetention;
  const t = stability / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
  return clamp(Math.round(t), 1, params.maximumInterval);
}

export function emptyCard(now = Date.now()) {
  return { due: now, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: State.New, lastReview: null };
}

function initStability(w, g) { return Math.max(w[g - 1], 0.1); }
function initDifficulty(w, g) { return clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10); }
function nextDifficulty(w, d, g) {
  const d0 = initDifficulty(w, Rating.Easy);
  const dd = d - w[6] * (g - 3);
  return clamp(w[7] * d0 + (1 - w[7]) * dd, 1, 10);
}
function recallStability(w, d, s, r, g) {
  const hard = g === Rating.Hard ? w[15] : 1;
  const easy = g === Rating.Easy ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy);
}
function forgetStability(w, d, s, r) {
  return Math.min(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)), s);
}
function shortTermStability(w, s, g) { return s * Math.exp(w[17] * (g - 3 + w[18])); }

/**
 * 1 枚のカードに評価 g を与えたときの新しい状態を返す（元のオブジェクトは変えない）。
 * now はミリ秒。戻り値 { card, log }。
 */
export function schedule(card, g, now = Date.now(), params = DEFAULT_PARAMS) {
  const w = params.w;
  const c = { ...card };
  const last = c.lastReview;
  const elapsedDays = last ? Math.max(0, (now - last) / DAY) : 0;
  const prevState = c.state;
  let dueIn; // ms
  let nextState;

  if (c.state === State.New) {
    c.difficulty = initDifficulty(w, g);
    c.stability = initStability(w, g);
    if (g === Rating.Again) { nextState = State.Learning; dueIn = 1 * MIN; }
    else if (g === Rating.Hard) { nextState = State.Learning; dueIn = 5 * MIN; }
    else if (g === Rating.Good) { nextState = State.Learning; dueIn = 10 * MIN; }
    else { nextState = State.Review; dueIn = nextInterval(c.stability, params) * DAY; }
  } else if (c.state === State.Learning || c.state === State.Relearning) {
    c.difficulty = nextDifficulty(w, c.difficulty, g);
    c.stability = shortTermStability(w, c.stability, g);
    if (g === Rating.Again) { nextState = c.state; dueIn = 5 * MIN; }
    else if (g === Rating.Hard) { nextState = c.state; dueIn = 10 * MIN; }
    else { nextState = State.Review; dueIn = nextInterval(c.stability, params) * DAY; }
  } else { // Review
    const r = retrievability(elapsedDays, c.stability);
    const d = c.difficulty;
    const sHard = recallStability(w, d, c.stability, r, Rating.Hard);
    const sGood = recallStability(w, d, c.stability, r, Rating.Good);
    const sEasy = recallStability(w, d, c.stability, r, Rating.Easy);
    c.difficulty = nextDifficulty(w, d, g);
    if (g === Rating.Again) {
      c.stability = forgetStability(w, d, c.stability, r);
      c.lapses += 1;
      nextState = State.Relearning; dueIn = 5 * MIN;
    } else {
      let hardI = nextInterval(sHard, params), goodI = nextInterval(sGood, params), easyI = nextInterval(sEasy, params);
      hardI = Math.min(hardI, goodI); goodI = Math.max(goodI, hardI + 1); easyI = Math.max(easyI, goodI + 1);
      nextState = State.Review;
      if (g === Rating.Hard) { c.stability = sHard; dueIn = hardI * DAY; }
      else if (g === Rating.Good) { c.stability = sGood; dueIn = goodI * DAY; }
      else { c.stability = sEasy; dueIn = easyI * DAY; }
    }
  }
  c.state = nextState;
  c.reps += 1;
  c.elapsedDays = elapsedDays;
  c.scheduledDays = dueIn >= DAY ? Math.round(dueIn / DAY) : 0;
  c.lastReview = now;
  c.due = now + dueIn;
  const log = { rating: g, state: prevState, due: c.due, elapsedDays, scheduledDays: c.scheduledDays, reviewedAt: now };
  return { card: c, log };
}

/** 4 つの評価それぞれの次回間隔（表示用）。 */
export function preview(card, now = Date.now(), params = DEFAULT_PARAMS) {
  const out = {};
  for (const g of [1, 2, 3, 4]) out[g] = schedule(card, g, now, params).card.due - now;
  return out;
}

export function formatInterval(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(1, m)}分`;
  const h = ms / (60 * MIN);
  if (h < 24) return `${Math.round(h)}時間`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)}日`;
  if (d < 365) return `${(d / 30).toFixed(1).replace(/\.0$/, '')}か月`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}年`;
}
