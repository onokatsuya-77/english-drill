import { h, clear, toast } from '../dom.js';
import { parseCSV, ownFromRows, chunk, CSV_TEMPLATE } from '../content.js';
import { icon, coverEl } from './parts.js';

let formOpen = false; // 1語ずつ入力の欄を、足したあとも開いたままにする

/** 教材を追加: 家族の教材の追加・外す、自分の教材（Excel・CSV・1語ずつ） */
export function renderAdd(store, { go }) {
  const main = h('main', {});
  const shared = store.materials.filter(m => !m.own);
  const own = store.materials.filter(m => m.own);
  const unitOf = m => (m.kind === 'idioms' ? '項目' : '語');
  const status = h('div', {});

  const row = m => {
    const on = store.matSettings(m.id).enabled;
    return h('div', { class: 'row', style: { gap: '12px', padding: '12px 14px' } },
      coverEl(m, 34, 46),
      h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
        h('span', { style: { fontSize: '15px', fontWeight: 700 } }, m.title),
        h('span', { class: 'small muted' }, `${m.cardCount}${unitOf(m)} · ${m.deckLabel || 'Section'} ${m.decks?.[0]?.no ?? 1}〜${m.decks?.[m.decks.length - 1]?.no ?? 1}${m.passageCount ? ' · 長文つき' : ''}`)),
      on
        ? h('button', { class: 'btn sm', style: { background: 'transparent', color: 'var(--teal)', gap: '4px' }, 'aria-label': `${m.title}をホームから外す`, onclick: async () => { await store.setStatus(m.id, 'off'); toast('ホームから外しました'); } }, icon('check', 16, 2.4), '追加済み')
        : h('button', { class: 'btn dark sm', style: { minWidth: '64px' }, onclick: async () => { await store.setStatus(m.id, 'later'); toast('「取り掛かる前」に追加しました'); } }, '追加'));
  };

  main.append(
    h('header', { class: 'row', style: { gap: '4px', padding: '14px 12px 6px' } },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': '閉じる', style: { color: 'var(--ink)' } }, icon('close', 22, 2.2)),
      h('h1', { style: { fontSize: '19px', fontWeight: 700 } }, '教材を追加')),
    h('div', { class: 'sec-h', style: { paddingTop: '14px' } },
      h('h2', { style: { fontSize: '16px' } }, '家族の教材'),
      h('span', { class: 'row small muted', style: { gap: '6px' } }, icon('lock', 14), '管理者が登録した教材。家族の学習者なら誰でも追加できます')),
    shared.length ? h('div', { class: 'list' }, ...shared.map(row)) : h('p', { class: 'note' }, 'まだ登録されていません。管理者が「設定 → 管理」から登録します。'),
  );
  if (own.length) main.append(h('div', { class: 'sec-h' }, h('h2', { style: { fontSize: '16px' } }, '自分の教材')), h('div', { class: 'list' }, ...own.map(m => {
    const r = row(m);
    r.append(h('button', { class: 'icon-btn', 'aria-label': `${m.title}を削除`, style: { color: 'var(--muted)' }, onclick: async () => {
      if (!confirm(`「${m.title}」を削除しますか？（この教材の学習の記録は残りますが、語は表示されなくなります）`)) return;
      await store.backend.deleteOwnMaterial(store.user.uid, m.id); await store.refreshMaterials(); toast('削除しました');
    } }, icon('close', 18)));
    return r;
  })));

  // 自分の教材を作る
  const fileInput = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,.xls', class: 'hidden', onchange: e => importFile(e.target.files[0]) });
  main.append(
    h('div', { class: 'sec-h' }, h('h2', { style: { fontSize: '16px' } }, '自分の教材を作る')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px' } },
      bigBtn('file', 'var(--indigoTint)', 'var(--indigoInk)', 'Excel・CSV から取り込む', '「英語」「意味」の列があれば作れます。例文・例文の訳・品詞の列も使えます。', () => fileInput.click()),
      bigBtn('pen', 'var(--orangeTint)', 'var(--orange)', '1語ずつ入力する', '授業や仕事で出会った語を、その場で単語帳に足せます。', () => openForm()),
      h('button', { class: 'btn ghost block', style: { fontSize: '14px', minHeight: '44px' }, onclick: downloadTemplate }, icon('download', 18), '取り込み用のテンプレート（CSV）'),
      fileInput, status),
    h('p', { class: 'note' }, '自分で作った教材は、作った学習者のホームに並びます。ほかの学習者も、ここで「追加」すれば使えます。'),
  );

  async function importFile(f) {
    if (!f) return;
    clear(status); status.append(h('p', { class: 'small muted' }, `${f.name} を読んでいます…`));
    try {
      let rows;
      if (/\.xlsx?$/i.test(f.name)) {
        const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      } else rows = parseCSV(await f.text());
      const title = (prompt('教材の名前', f.name.replace(/\.[^.]+$/, '')) || '').trim() || '自分の単語帳';
      const { material, cards } = ownFromRows(rows, { title, owner: store.profile.id });
      await store.backend.saveOwnMaterial(store.user.uid, material, chunk(cards));
      await store.setStatus(material.id, 'active');
      await store.refreshMaterials();
      toast(`${material.title}（${cards.length}語）を作りました`);
      go(`m/${material.id}`);
    } catch (e) { clear(status); status.append(h('p', { class: 'small', style: { color: 'var(--red)' } }, '取り込めませんでした: ' + e.message)); }
    fileInput.value = '';
  }

  function openForm() {
    formOpen = true;
    clear(status);
    const target = own.find(m => m.owner === store.profile.id) || null;
    const f = { front: h('input', { class: 'input', id: 'f-front', autocomplete: 'off', autocapitalize: 'off' }), meaning: h('input', { class: 'input', id: 'f-meaning' }), exEn: h('input', { class: 'input', id: 'f-ex' }), exJa: h('input', { class: 'input', id: 'f-exja' }) };
    const field = (id, label, el) => h('div', { class: 'field' }, h('label', { for: id }, label), el);
    status.append(h('div', { class: 'card', style: { margin: '6px 0 0' } },
      h('h2', { style: { fontSize: '16px' } }, target ? `「${target.title}」に足す` : '「自分の単語帳」を作って足す'),
      field('f-front', '英語', f.front), field('f-meaning', '意味', f.meaning), field('f-ex', '例文（なくてもよい）', f.exEn), field('f-exja', '例文の訳（なくてもよい）', f.exJa),
      h('button', { class: 'btn primary block', onclick: async e => {
        const front = f.front.value.trim(), meaning = f.meaning.value.trim();
        if (!front || !meaning) { toast('英語と意味を入れてください'); return; }
        e.target.disabled = true;
        try {
          const rows = [['英語', '意味', '例文', '例文の訳', '品詞', '発音']];
          if (target) for (const c of store.cards.get(target.id) || (await store.backend.loadOwnChunks(store.user.uid, target.id, target.cardChunks, target.version))) rows.push([c.front, c.meaning, c.examples?.[0]?.en || '', c.examples?.[0]?.ja || '', c.pos || '', c.pron || '']);
          rows.push([front, meaning, f.exEn.value.trim(), f.exJa.value.trim(), '', '']);
          const { material, cards } = ownFromRows(rows, { title: target?.title || '自分の単語帳', owner: store.profile.id, id: target?.id || null, createdAt: target?.createdAt || null });
          await store.backend.saveOwnMaterial(store.user.uid, material, chunk(cards));
          if (!target) await store.setStatus(material.id, 'active');
          await store.refreshMaterials();
          toast(`「${front}」を足しました`);
        } catch (err) { toast('足せませんでした: ' + err.message); e.target.disabled = false; }
      } }, '足す'),
      h('button', { class: 'btn ghost block', style: { minHeight: '44px', fontSize: '14px' }, onclick: () => { formOpen = false; clear(status); } }, '閉じる')));
    setTimeout(() => f.front.focus(), 50);
  }
  if (formOpen) openForm();
  main.dispose = () => { if (!location.hash.startsWith('#/add')) formOpen = false; };
  return main;
}

function bigBtn(ic, bg, ink, title, desc, onclick) {
  return h('button', { type: 'button', onclick, style: { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', border: '0', borderRadius: '18px', background: '#fff', boxShadow: '0 1px 2px rgba(20,26,51,.06)', textAlign: 'left', cursor: 'pointer' } },
    h('span', { style: { width: '42px', height: '42px', borderRadius: '12px', background: bg, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' } }, icon(ic, 22)),
    h('span', { style: { display: 'flex', flexDirection: 'column', gap: '3px', flex: '1' } },
      h('span', { style: { fontSize: '15px', fontWeight: 700 } }, title),
      h('span', { style: { fontSize: '12px', lineHeight: 1.5, color: 'var(--muted)' } }, desc)));
}
function downloadTemplate() {
  const a = h('a', { href: URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' })), download: '単語帳テンプレート.csv' });
  document.body.append(a); a.click(); a.remove();
}
