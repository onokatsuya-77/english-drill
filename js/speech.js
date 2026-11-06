// 端末の読み上げ（Web Speech API）。英語の発音と、連続再生の日本語・英語。録音した音声を入れるまでの代わり。
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

let voice = null, voiceJa = null;
function pickVoice() {
  if (!canSpeak) return null;
  const vs = speechSynthesis.getVoices();
  const en = vs.filter(v => /^en[-_]/i.test(v.lang));
  return en.find(v => /en[-_]US/i.test(v.lang) && v.localService) || en.find(v => /en[-_]US/i.test(v.lang)) || en.find(v => /en[-_]GB/i.test(v.lang)) || en[0] || null;
}
function pickJa() {
  if (!canSpeak) return null;
  const ja = speechSynthesis.getVoices().filter(v => /^ja[-_]/i.test(v.lang));
  return ja.find(v => v.localService && /Kyoko|O-ren|Otoya|Hattori/i.test(v.name)) || ja.find(v => v.localService) || ja[0] || null;
}
if (canSpeak) {
  voice = pickVoice(); voiceJa = pickJa();
  speechSynthesis.addEventListener?.('voiceschanged', () => { voice = pickVoice(); voiceJa = pickJa(); });
}

/** 読み上げ用に英語を整える（～ → something、[ ] の言い換えは外す、( ) は中身だけ読む） */
export function cleanEn(text) {
  return String(text || '').replace(/\s*\[[^\]]*\]/g, '').replace(/[～~]/g, ' something ').replace(/\(([^)]*)\)/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
/** 読み上げ用に日本語を整える（～ や記号を外し、（＝…）などの補足は読まない） */
export function cleanJa(text) {
  return String(text || '')
    .replace(/[（(]\s*(?:⇔|≒|＝|=|→|cf\.)[^）)]*[）)]/g, '')
    .replace(/［[^］]*］|\[[^\]]*\]|〔[^〕]*〕/g, '')
    .replace(/[（）()「」『』～~]/g, '').replace(/[①-⑳]/g, '').replace(/[；;／/]/g, '、')
    .replace(/\s{2,}/g, ' ').trim();
}

/** 英語を読み上げる（発音を聞くボタン用）。rate: 1=ふつう、0.7=ゆっくり */
export function speak(text, { rate = 1 } = {}) {
  if (!canSpeak || !text) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanEn(text));
  u.lang = voice?.lang || 'en-US';
  if (voice) u.voice = voice;
  u.rate = rate;
  speechSynthesis.speak(u);
  return true;
}

let current = null; // 読み上げ中の発話（参照を持っていないと、iPhone で終わりの知らせが来ないことがある）
/** 読み上げて、終わったら true（読めなかった・止めたときは false）。lang: 'en' | 'ja' */
export function say(text, { lang = 'en', rate = 1 } = {}) {
  return new Promise(resolve => {
    const t = lang === 'ja' ? cleanJa(text) : cleanEn(text);
    if (!canSpeak || !t) { resolve(false); return; }
    const u = new SpeechSynthesisUtterance(t);
    const v = lang === 'ja' ? voiceJa : voice;
    u.lang = v?.lang || (lang === 'ja' ? 'ja-JP' : 'en-US');
    if (v) u.voice = v;
    u.rate = rate;
    let done = false, timer = null;
    const fin = ok => { if (done) return; done = true; clearTimeout(timer); if (current === u) current = null; resolve(ok); };
    u.onend = () => fin(true);
    u.onerror = () => fin(false);
    // 終わりの知らせが来ない端末のための見込み時間（日本語は 1 字 0.2 秒、英語は 1 字 0.08 秒ほど）
    timer = setTimeout(() => fin(true), ((lang === 'ja' ? 230 : 90) * t.length) / rate + 4000);
    current = u;
    speechSynthesis.resume?.();
    speechSynthesis.speak(u);
  });
}
export function stopSpeaking() { if (canSpeak) { current = null; speechSynthesis.cancel(); } }
/** 日本語の声があるか（連続再生の案内に使う） */
export const hasJaVoice = () => !!voiceJa || (canSpeak && speechSynthesis.getVoices().some(v => /^ja[-_]/i.test(v.lang)));
