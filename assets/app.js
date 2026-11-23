/* 書籍數位化知識庫 — 前端
   資料：Supabase kb_items（書目）、kb_decks（簡報 JSON）、kb_members（成員與金鑰期限）
   權限：資料表 RLS 只放行「有效成員＋已換初始金鑰＋金鑰未滿 60 天」，前端只是顯示層 */
const SB_URL = 'https://cowljafosekwvxithwjd.supabase.co';
const SB_KEY = 'sb_publishable_YP57cbbDJSP7-PvBgtKivA_25uDcp5n';
const DOMAIN = '@book-kb.example';
const CYCLE = 60, WARN = 7, MIN_KEY = 10;
const sb = supabase.createClient(SB_URL, SB_KEY);
const { esc, cover, render: exhibit, TOPIC_COLOR } = window.KBX;

const $ = (id) => document.getElementById(id);
const S = { me: null, items: [], byId: {}, decks: {}, filter: 'all', loaded: false };
const TOPICS = Object.keys(TOPIC_COLOR);

// ───────────────────────── 登入流程 ─────────────────────────
function showLogin(msg = '') { $('app').hidden = true; $('login').hidden = false; $('loginMsg').textContent = msg; }
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const u = $('user').value.trim();
  $('loginMsg').textContent = '登入中…';
  const { error } = await sb.auth.signInWithPassword({ email: u.includes('@') ? u : u + DOMAIN, password: $('pass').value });
  if (error) { $('loginMsg').textContent = '帳號或金鑰不正確。'; return; }
  $('pass').value = '';
  boot();
};
$('logout').onclick = async () => { await sb.auth.signOut(); Object.assign(S, { me: null, items: [], byId: {}, decks: {}, loaded: false }); location.hash = '#/'; showLogin(); };

async function boot() {
  const { data, error } = await sb.rpc('kb_me');
  if (error) return showLogin('連線失敗，請稍後再試。');
  const me = data && data[0];
  if (!me) { await sb.auth.signOut(); return showLogin('這個帳號尚未開通知識庫，請洽管理者。'); }
  if (!me.active) { await sb.auth.signOut(); return showLogin('這個帳號已停用，請洽管理者。'); }
  S.me = me;
  $('login').hidden = true; $('app').hidden = false;
  $('navAdmin').hidden = me.role !== 'owner';
  banner();
  if (mustRotate()) { location.hash = '#/account'; return route(); }
  await loadData();
  route();
}
const mustRotate = () => S.me && (S.me.must_change || S.me.days_left <= 0);
function banner() {
  const b = $('banner'), me = S.me;
  if (!me) { b.hidden = true; return; }
  if (me.must_change) { b.textContent = '首次登入：請先更換管理者給你的初始金鑰，換完才能閱讀內容。'; b.hidden = false; }
  else if (me.days_left <= 0) { b.textContent = `你的金鑰已超過 ${CYCLE} 天，請先更換金鑰，換完才能閱讀內容。`; b.hidden = false; }
  else if (me.days_left <= WARN) { b.innerHTML = `金鑰將在 <b>${me.days_left}</b> 天後到期，請到 <a href="#/account">我的金鑰</a> 更換。`; b.hidden = false; }
  else b.hidden = true;
}

async function loadData() {
  const [it, dk] = await Promise.all([
    sb.from('kb_items').select('*').order('sort'),
    sb.from('kb_decks').select('item_id,version,verified,minutes,deck,updated_at'),
  ]);
  if (it.error || dk.error) { view(`<div class="empty">讀取失敗：${esc((it.error || dk.error).message)}</div>`); return; }
  S.items = it.data; S.byId = Object.fromEntries(it.data.map((x) => [x.id, x]));
  S.decks = Object.fromEntries(dk.data.map((d) => [d.item_id, d]));
  for (const x of S.items) x._text = norm([x.title, x.author, x.publisher, x.series, x.topic, x.coord, (x.tags || []).join(' '), x.summary, x.priority_note, x.note].join(' '));
  for (const d of dk.data) d._slides = (d.deck.slides || []).map((s) => flat(s).join(' '));
  S.loaded = true;
}

// ───────────────────────── 路由 ─────────────────────────
window.addEventListener('hashchange', route);
function parse() {
  const [path, qs] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, q: new URLSearchParams(qs || '').get('q') || '' };
}
function route() {
  if (!S.me) return;
  const { parts, q } = parse();
  const p0 = parts[0] || '';
  if (p0 === 'account') return pageAccount();
  if (mustRotate()) { location.hash = '#/account'; return; }
  if (!S.loaded) return;
  if (p0 === 'admin') return pageAdmin();
  if (p0 === 'deck') return pageDeck(parts[1], +parts[2] || 1, q);
  if (p0 === 'item') return pageItem(parts[1]);
  if (p0 === 'search') { const s = decodeURIComponent(parts.slice(1).join('/')); if ($('q').value !== s) $('q').value = s; return pageSearch(s); }
  $('q').value = '';
  pageHome();
}
const view = (html) => { $('view').innerHTML = html; window.scrollTo(0, 0); };

// ───────────────────────── 搜尋 ─────────────────────────
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ');
function flat(o) { const out = []; (function w(v) { if (v == null) return; if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(w); else if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'type' && k !== 'kind' && k !== 'highlight') w(x); }); })(o); return out; }
let qTimer;
$('q').addEventListener('input', () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { const s = $('q').value.trim(); location.hash = s ? '#/search/' + encodeURIComponent(s) : '#/'; }, 220);
});
function search(qs) {
  const terms = norm(qs).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const x of S.items) {
    const d = S.decks[x.id];
    const deckText = d ? norm([d.deck.subtitle, d.deck.one_liner].join(' ') + ' ' + d._slides.join(' ')) : '';
    const all = x._text + ' ' + deckText;
    if (!terms.every((t) => all.includes(t))) continue;
    const hits = [];
    if (d) d._slides.forEach((st, i) => { const n = norm(st); if (terms.some((t) => n.includes(t))) hits.push({ page: i + 1, snip: snippet(st, terms) }); });
    let score = hits.length;
    for (const t of terms) { if (norm(x.title).includes(t)) score += 20; if (norm(x.author).includes(t)) score += 8; if (x._text.includes(t)) score += 3; }
    out.push({ x, hits, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
function snippet(text, terms) {
  const low = text.toLowerCase(); let at = -1;
  for (const t of terms) { at = low.indexOf(t); if (at >= 0) break; }
  const s = Math.max(0, at - 24), e = Math.min(text.length, at + 60);
  return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
}
function markHTML(text, terms) {
  let h = esc(text);
  for (const t of terms) { if (!t) continue; const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); h = h.replace(re, (m) => `<mark>${m}</mark>`); }
  return h;
}
function markDOM(root, terms) {
  if (!terms.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('svg')) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const low = n.nodeValue.toLowerCase();
    if (!terms.some((t) => low.includes(t))) continue;
    const span = document.createElement('span'); span.innerHTML = markHTML(n.nodeValue, terms); n.replaceWith(span);
  }
}

// ───────────────────────── 首頁 ─────────────────────────
function card(x) {
  const d = S.decks[x.id];
  const href = d ? `#/deck/${x.id}/1` : `#/item/${x.id}`;
  const tags = [`<span class="tag">${esc(x.topic)}</span>`];
  if (d) tags.push(`<span class="tag deck">簡報 ${d.deck.slides.length} 頁</span>`);
  if (d && !d.verified) tags.push('<span class="tag warn">未驗證</span>');
  if (x.id_status && x.id_status !== '確認') tags.push('<span class="tag warn">待確認</span>');
  return `<a class="card" href="${href}"><div class="cover">${cover(x)}</div><h3>${esc(x.title)}</h3><div class="by">${esc(x.author || '—')}</div><div class="tagrow">${tags.join('')}</div></a>`;
}
function pageHome() {
  const items = S.items, nDeck = Object.keys(S.decks).length;
  const count = (t) => items.filter((x) => x.topic === t).length;
  const chips = [['all', '全部', items.length], ['deck', '有簡報', nDeck], ...TOPICS.filter(count).map((t) => [t, t, count(t)])]
    .map(([k, l, n]) => `<button class="chip" data-f="${esc(k)}" aria-pressed="${S.filter === k}">${esc(l)}<small>${n}</small></button>`).join('');
  let body = '';
  if (S.filter === 'all') {
    // 有簡報的先排一區，其餘依主題分組
    const withDeck = items.filter((x) => S.decks[x.id]);
    if (withDeck.length) body += `<div class="group-h">已完成簡報<small>${withDeck.length} 本 · 每本約 10 分鐘</small></div><div class="grid">${withDeck.map(card).join('')}</div>`;
    for (const t of TOPICS) { const g = items.filter((x) => x.topic === t); if (g.length) body += `<div class="group-h">${esc(t)}<small>${g.length} 本 · ${esc(g[0].coord || '')}</small></div><div class="grid">${g.map(card).join('')}</div>`; }
  } else {
    const g = S.filter === 'deck' ? items.filter((x) => S.decks[x.id]) : items.filter((x) => x.topic === S.filter);
    body = g.length ? `<div class="grid">${g.map(card).join('')}</div>` : '<div class="empty">這個分類還沒有書。</div>';
  }
  view(`<section class="hero"><div><h1>把書讀成判斷框架</h1><p>每本書濃縮成 10 分鐘顧問簡報：結論先行、框架圖解、對進能服的意涵與可執行規則。</p></div>
    <div class="stats"><div class="stat"><b>${items.length}</b><span>本書目</span></div><div class="stat accent"><b>${nDeck}</b><span>份簡報</span></div><div class="stat"><b>${TOPICS.filter((t) => t !== '待確認' && count(t)).length}</b><span>個主題</span></div></div></section>
    <div class="chips">${chips}</div>${body}`);
  $('view').querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { S.filter = b.dataset.f; pageHome(); }));
}

// ───────────────────────── 搜尋結果頁 ─────────────────────────
function pageSearch(qs) {
  const terms = norm(qs).split(' ').filter(Boolean), res = search(qs);
  const q = encodeURIComponent(qs);
  const rows = res.map(({ x, hits }) => `<div class="result"><a class="cover" href="#/${S.decks[x.id] ? 'deck/' + x.id + '/1?q=' + q : 'item/' + x.id}">${cover(x)}</a><div>
    <h3><a href="#/${S.decks[x.id] ? 'deck/' + x.id + '/1?q=' + q : 'item/' + x.id}">${markHTML(x.title, terms)}</a></h3>
    <div class="meta">${markHTML([x.author, x.publisher, x.topic].filter(Boolean).join('　·　'), terms)}${S.decks[x.id] ? '' : '　·　尚無簡報'}</div>
    ${hits.length ? `<ul class="hits">${hits.slice(0, 6).map((h) => `<li><a href="#/deck/${x.id}/${h.page}?q=${q}"><span class="pg">第 ${h.page} 頁</span>${markHTML(h.snip, terms)}</a></li>`).join('')}${hits.length > 6 ? `<li class="muted">…另有 ${hits.length - 6} 頁</li>` : ''}</ul>` : ''}
  </div></div>`).join('');
  view(`<section class="results"><h2>「${esc(qs)}」共 ${res.length} 本</h2>${rows || '<div class="empty">找不到符合的內容。試試較短的關鍵字，或用空白分開多個詞。</div>'}</section>`);
}

// ───────────────────────── 單書頁（尚無簡報） ─────────────────────────
function pageItem(id) {
  const x = S.byId[id]; if (!x) return view('<div class="empty">找不到這本書。</div>');
  const d = S.decks[id];
  const kv = [['作者', x.author], ['出版社', x.publisher], ['書系', x.series], ['版本', x.edition], ['主題', x.topic], ['座標', x.coord], ['位置', x.shelf], ['辨識狀態', x.id_status], ['備註', x.note]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  view(`<a class="back" href="#/">← 回到書庫</a><div class="detail"><div class="cover">${cover(x)}</div><div>
    <h1>${esc(x.title)}</h1>${x.priority_note ? `<p><span class="tag deck">建議優先做讀書卡</span> ${esc(x.priority_note)}</p>` : ''}
    <dl class="kv">${kv}</dl>${d ? `<a class="btn" href="#/deck/${id}/1">開啟 10 分鐘簡報 →</a>` : '<div class="empty">這本書還沒有簡報。</div>'}</div></div>`);
}

// ───────────────────────── 簡報播放器 ─────────────────────────
function foot(d, s, i, n) {
  const src = s.source ? `資料來源：${esc(s.source)}` : '';
  const unv = d.verified ? '' : '<span class="unv">［未驗證］依公開知識整理，尚未逐頁核對原書</span>';
  return `<div class="foot"><span>${src}${src && unv ? '　' : ''}${unv}</span><span>${i} / ${n}</span></div>`;
}
function slideHTML(x, d, s, i, n) {
  const deck = d.deck;
  if (s.kind === 'cover') {
    return `<div class="slide cover"><div class="in"><div class="art">${cover(x)}</div><div>
      <div class="kick">10 分鐘導讀 · ${esc(x.topic)}</div><h1>${esc(deck.title || x.title)}</h1>
      ${deck.subtitle ? `<p class="sub">${esc(deck.subtitle)}</p>` : ''}
      <p class="by">${esc([x.author, x.publisher].filter(Boolean).join('　·　'))}</p>
      ${deck.one_liner ? `<div class="one">${esc(deck.one_liner)}</div>` : ''}
      <div class="meta"><span>${n} 頁 · 約 ${d.minutes} 分鐘</span><span>${esc(x.coord || '')}</span>${d.verified ? '' : '<span class="unv">未驗證</span>'}</div>
    </div></div></div>`;
  }
  const head = `<div class="sec">${esc(s.section || '')}</div><h2>${esc(s.title || '')}</h2><div class="rule"></div>`;
  let body = '';
  if (s.kind === 'exec') {
    body = `<div class="body full"><div class="ex">${exhibit({ type: 'pyramid', ...s.pyramid })}</div></div>`;
  } else if (s.kind === 'rules') {
    body = `<div class="body full"><table class="rules"><thead><tr><th></th><th>如果（情境）</th><th>就（行動）</th></tr></thead><tbody>${(s.rules || []).map((r, k) => `<tr><td>${k + 1}</td><td>${esc(r.if)}</td><td>${esc(r.then)}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (s.kind === 'close') {
    const rel = (s.related || deck.related || []).map((id) => S.byId[id]).filter(Boolean);
    body = `<div class="body full"><div>${s.lead ? `<p class="lead">${esc(s.lead)}</p>` : ''}<ul class="pts">${(s.points || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      ${rel.length ? `<p class="lead" style="margin-top:1.6cqw">延伸閱讀（書庫內）</p><div class="related">${rel.map((r) => `<a href="#/${S.decks[r.id] ? 'deck/' + r.id + '/1' : 'item/' + r.id}">${cover(r)}<span>${esc(r.title)}</span></a>`).join('')}</div>` : ''}</div></div>`;
  } else {
    const pts = s.points && s.points.length, ex = s.exhibit && s.exhibit.type;
    const left = `<div>${s.lead ? `<p class="lead">${esc(s.lead)}</p>` : ''}${pts ? `<ul class="pts">${s.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>`;
    const right = ex ? `<div class="ex">${s.exhibit.caption ? `<div class="exh"><b>圖 ${i - 1}</b>　${esc(s.exhibit.caption)}</div>` : ''}${exhibit(s.exhibit, !(pts || s.lead))}</div>` : '';
    body = `<div class="body${ex && (pts || s.lead) ? '' : ' full'}">${pts || s.lead ? left : ''}${right}</div>`;
  }
  return `<div class="slide"><div class="in">${head}${body}${foot(d, s, i, n)}</div></div>`;
}
let deckKeys = null;
function pageDeck(id, page, qs) {
  const x = S.byId[id], d = S.decks[id];
  if (!x || !d) return pageItem(id);
  const slides = d.deck.slides, n = slides.length; page = Math.min(Math.max(1, page), n);
  const q = qs ? '?q=' + encodeURIComponent(qs) : '';
  const toc = slides.map((s, k) => `<a href="#/deck/${id}/${k + 1}${q}" aria-current="${k + 1 === page}"><span>${k + 1}</span><span>${esc(s.kind === 'cover' ? '封面' : s.title || s.section || '')}</span></a>`).join('');
  view(`<div class="deckbar"><a class="back" style="margin:0" href="#/">← 書庫</a><span class="t">${esc(x.title)}</span><span class="pg">${page} / ${n}</span><button class="btn small" id="fsBtn">全螢幕</button></div>
    <div class="deckwrap"><div><div class="stage fsbox" id="fsbox">${slideHTML(x, d, slides[page - 1], page, n)}</div>
      <div class="progress"><i style="width:${(page / n) * 100}%"></i></div>
      <div class="navbtns"><button class="btn small" id="prev" ${page === 1 ? 'disabled' : ''}>← 上一頁</button><span class="muted" style="font-size:12px">鍵盤 ← → 翻頁</span><button class="btn small" id="next" ${page === n ? 'disabled' : ''}>下一頁 →</button></div></div>
      <nav class="toc" aria-label="簡報目錄">${toc}</nav></div>`);
  const go = (p) => { if (p >= 1 && p <= n) location.hash = `#/deck/${id}/${p}${q}`; };
  $('prev').onclick = () => go(page - 1); $('next').onclick = () => go(page + 1);
  $('fsBtn').onclick = () => { const b = $('fsbox'); document.fullscreenElement ? document.exitFullscreen() : b.requestFullscreen && b.requestFullscreen(); };
  deckKeys = { go, page };
  if (qs) markDOM($('fsbox'), norm(qs).split(' ').filter(Boolean));
  const cur = document.querySelector('.toc a[aria-current="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('keydown', (e) => {
  if (!location.hash.startsWith('#/deck/') || !deckKeys || /input|textarea/i.test(e.target.tagName)) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); deckKeys.go(deckKeys.page + 1); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); deckKeys.go(deckKeys.page - 1); }
});
document.addEventListener('fullscreenchange', () => { /* 全螢幕時保留翻頁：重繪會跳出全螢幕，故只更新內容 */ });

// ───────────────────────── 我的金鑰（60 天更換） ─────────────────────────
const fmtDate = (s) => new Date(s).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
function randomKey() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint32Array(12));
  const s = Array.from(b, (v) => a[v % a.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
function pageAccount() {
  const me = S.me, due = new Date(new Date(me.key_rotated_at).getTime() + CYCLE * 864e5);
  const state = me.must_change ? '<span class="pill bad">須更換初始金鑰</span>' : me.days_left <= 0 ? '<span class="pill bad">已過期</span>' : me.days_left <= WARN ? `<span class="pill bad">剩 ${me.days_left} 天</span>` : `<span class="pill ok">剩 ${me.days_left} 天</span>`;
  view(`<section class="panel narrow"><h1>我的金鑰</h1><p class="muted">金鑰每 ${CYCLE} 天必須更換一次，到期後只能登入換金鑰，不能閱讀內容。</p>
    <dl class="kv"><dt>帳號</dt><dd>${esc(me.username)}</dd><dt>名稱</dt><dd>${esc(me.display_name)}</dd><dt>上次更換</dt><dd>${fmtDate(me.key_rotated_at)}</dd><dt>到期日</dt><dd>${fmtDate(due)}　${state}</dd></dl>
    <h2>更換金鑰</h2><form id="rotForm">
      <label>目前金鑰<input id="curKey" type="password" autocomplete="current-password" required></label>
      <label>新金鑰（至少 ${MIN_KEY} 個字元）<div class="keybox"><input id="newKey" type="text" autocomplete="new-password" required><button type="button" class="btn small" id="genKey">產生</button></div></label>
      <label>再輸入一次新金鑰<input id="newKey2" type="text" autocomplete="new-password" required></label>
      <button class="btn primary" type="submit">更換金鑰</button><p id="rotMsg" class="msg" role="alert"></p></form></section>`);
  $('genKey').onclick = () => { const k = randomKey(); $('newKey').value = k; $('newKey2').value = k; };
  $('rotForm').onsubmit = async (e) => {
    e.preventDefault();
    const cur = $('curKey').value, nk = $('newKey').value, nk2 = $('newKey2').value, msg = $('rotMsg');
    msg.className = 'msg';
    if (nk.length < MIN_KEY) return (msg.textContent = `新金鑰至少 ${MIN_KEY} 個字元。`);
    if (nk !== nk2) return (msg.textContent = '兩次輸入的新金鑰不一致。');
    if (nk === cur) return (msg.textContent = '新金鑰不能和目前金鑰相同。');
    msg.textContent = '驗證中…';
    const { data: { session } } = await sb.auth.getSession();
    const chk = await sb.auth.signInWithPassword({ email: session.user.email, password: cur });
    if (chk.error) return (msg.textContent = '目前金鑰不正確。');
    const { error } = await sb.auth.updateUser({ password: nk });
    if (error) return (msg.textContent = '更換失敗：' + error.message);
    const { data } = await sb.rpc('kb_me'); S.me = data[0]; banner();
    msg.className = 'msg ok'; msg.textContent = `已更換。下次到期日：${fmtDate(new Date(Date.now() + CYCLE * 864e5))}`;
    if (!S.loaded) { await loadData(); }
    setTimeout(() => { location.hash = '#/'; route(); }, 1200);
  };
}

// ───────────────────────── 帳號管理（只有管理者） ─────────────────────────
async function adminCall(body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(SB_URL + '/functions/v1/kb-account-admin', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + (session?.access_token || '') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function pageAdmin() {
  if (S.me.role !== 'owner') return view('<div class="empty">只有管理者可以進入。</div>');
  view(`<section class="panel"><h1>帳號管理</h1><p class="muted">每位成員一個帳號＋個人金鑰。新帳號第一次登入必須自行更換金鑰；之後每 ${CYCLE} 天強制更換。</p>
    <h2>新增成員</h2><form id="addForm" class="form-row">
      <label>帳號（英數）<input id="aUser" required pattern="[A-Za-z0-9._@\\-]{3,60}"></label>
      <label>顯示名稱<input id="aName" required></label>
      <label>初始金鑰<div class="keybox"><input id="aKey" required><button type="button" class="btn small" id="aGen">產生</button></div></label>
      <button class="btn" type="submit">新增</button></form><p id="aMsg" class="msg" role="alert"></p>
    <h2>成員名單</h2><div id="aList" class="muted">讀取中…</div></section>`);
  $('aGen').onclick = () => ($('aKey').value = randomKey());
  $('addForm').onsubmit = async (e) => {
    e.preventDefault(); const m = $('aMsg'); m.className = 'msg'; m.textContent = '建立中…';
    const u = $('aUser').value.trim(), k = $('aKey').value;
    try {
      const r = await adminCall({ action: 'create', username: u, display_name: $('aName').value.trim(), key: k });
      m.className = 'msg ok';
      m.textContent = r.linked ? `已把既有帳號 ${u} 加入知識庫（沿用原密碼）。` : `已建立。請把帳號「${u}」和初始金鑰「${k}」私下交給對方（金鑰只顯示這一次）；對方第一次登入要自行更換。`;
      $('addForm').reset(); loadMembers();
    } catch (err) { m.textContent = err.message; }
  };
  loadMembers();
}
async function loadMembers() {
  try {
    const { members, me } = await adminCall({ action: 'list' });
    const now = Date.now();
    $('aList').innerHTML = `<table class="list"><thead><tr><th>名稱</th><th>帳號</th><th>角色</th><th>金鑰狀態</th><th>上次更換</th><th>操作</th></tr></thead><tbody>${members.map((m) => {
      const left = CYCLE - Math.floor((now - new Date(m.key_rotated_at)) / 864e5);
      const st = !m.active ? '<span class="pill">已停用</span>' : m.must_change ? '<span class="pill bad">待更換初始金鑰</span>' : left <= 0 ? '<span class="pill bad">已過期</span>' : left <= WARN ? `<span class="pill bad">剩 ${left} 天</span>` : `<span class="pill ok">剩 ${left} 天</span>`;
      const self = m.user_id === me;
      return `<tr><td>${esc(m.display_name)}${self ? ' <small class="muted">（你）</small>' : ''}</td><td class="nw">${esc(m.username)}</td><td class="nw">${m.role === 'owner' ? '管理者' : '成員'}</td><td class="nw">${st}</td><td class="nw">${fmtDate(m.key_rotated_at)}</td>
        <td class="nw">${self ? '' : `<button class="link" data-reset="${m.user_id}" data-name="${esc(m.display_name)}">重設金鑰</button>　<button class="link" data-act="${m.user_id}" data-on="${m.active ? 0 : 1}">${m.active ? '停用' : '啟用'}</button>　<button class="link" data-rm="${m.user_id}" data-name="${esc(m.display_name)}">移除</button>`}</td></tr>`;
    }).join('')}</tbody></table>`;
    $('aList').onclick = async (e) => {
      const t = e.target, m = $('aMsg'); m.className = 'msg';
      try {
        if (t.dataset.reset) {
          const k = randomKey();
          if (!confirm(`重設「${t.dataset.name}」的金鑰？對方下次登入要再自行更換。`)) return;
          await adminCall({ action: 'reset', user_id: t.dataset.reset, key: k });
          m.className = 'msg ok'; m.textContent = `已重設。新的初始金鑰：${k}（只顯示這一次，請私下交給對方）`;
        } else if (t.dataset.act) {
          await adminCall({ action: 'set_active', user_id: t.dataset.act, active: t.dataset.on === '1' });
        } else if (t.dataset.rm) {
          if (!confirm(`從知識庫移除「${t.dataset.name}」？`)) return;
          await adminCall({ action: 'remove', user_id: t.dataset.rm });
        } else return;
        loadMembers();
      } catch (err) { m.textContent = err.message; }
    };
  } catch (err) { $('aList').textContent = '讀取失敗：' + err.message; }
}

// ───────────────────────── 啟動 ─────────────────────────
sb.auth.getSession().then(({ data }) => (data.session ? boot() : showLogin()));
