// 端末の読み上げ（Web Speech API）で英語を発音する。録音した音声を入れるまでの代わり。
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

let voice = null;
function pickVoice() {
  if (!canSpeak) return null;
  const vs = speechSynthesis.getVoices();
  const en = vs.filter(v => /^en[-_]/i.test(v.lang));
  return en.find(v => /en[-_]US/i.test(v.lang) && v.localService) || en.find(v => /en[-_]US/i.test(v.lang)) || en.find(v => /en[-_]GB/i.test(v.lang)) || en[0] || null;
}
if (canSpeak) {
  voice = pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', () => { voice = pickVoice(); });
}

/** 英語を読み上げる。rate: 1=ふつう、0.7=ゆっくり */
export function speak(text, { rate = 1 } = {}) {
  if (!canSpeak || !text) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[～~]/g, ' something ').replace(/\(([^)]*)\)/g, '$1'));
  u.lang = voice?.lang || 'en-US';
  if (voice) u.voice = voice;
  u.rate = rate;
  speechSynthesis.speak(u);
  return true;
}
export function stopSpeaking() { if (canSpeak) speechSynthesis.cancel(); }
