/* 圖解引擎：簡報 JSON 只描述「結構」，SVG 由這裡統一繪製。
   新增書籍只要選圖解類型填內容，風格自動一致（灰階＋單一焦點色）。
   類型：pyramid / steps / matrix / cycle / funnel / compare / ladder / bars / equation / grid
   另含 cover()：依書名與主題重新繪製的抽象書封（不使用原書封面圖）。 */
(function () {
  const C = { ink: '#051C2C', ink2: '#2B3A45', gray: '#5B6770', mid: '#A7B0B7', line: '#C9D0D6',
    light: '#E9EDF0', soft: '#F3F5F7', accent: '#0E7C7B', accentL: '#D5ECEA', white: '#FFFFFF' };

  const TOPIC_COLOR = {
    '決策思考': '#0E7C7B', '策略經營': '#1F3A5F', '領導與人資': '#7A4E2D', '業務銷售': '#B5523B',
    '行銷': '#B07D22', '財務採購': '#4E5D3A', 'AI與科技': '#3B4C8C', '產業趨勢': '#2F6B4F',
    '能源技術': '#3E5F75', '創新與表達': '#8C4A6B', '個人成長': '#5E6F2E', '財富': '#8A6D1F',
    '傳記': '#5A4A6E', '藝術與在地': '#9A5B3F', '待確認': '#8A9097' };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 中英混排斷行：英數連成一個詞，中文逐字；寬度以「中文字＝1、英數＝0.55」估算
  function wrap(text, n) {
    const toks = String(text ?? '').match(/[A-Za-z0-9%$#.,:;'"()\-+\/&_]+\s?|\s+|./gu) || [];
    const out = []; let line = '', w = 0;
    for (const t of toks) {
      const tw = /^[\x00-\xff]+$/.test(t) ? t.length * 0.55 : t.length;
      if (w + tw > n && line.trim()) { out.push(line.trim()); line = ''; w = 0; if (!t.trim()) continue; }
      line += t; w += tw;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  }

  // 多行文字；回傳 [svg, 實際高度]
  function txt(x, y, text, o = {}) {
    const size = o.size || 15, lh = size * (o.lh || 1.38), n = o.n || 12, max = o.max || 5;
    let lines = wrap(text, n);
    if (lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].replace(/.$/, '…'); }
    const vy = o.valign === 'middle' ? y - ((lines.length - 1) * lh) / 2 : y;
    const attrs = `font-size="${size}" font-weight="${o.weight || 400}" fill="${o.fill || C.ink}" text-anchor="${o.anchor || 'start'}"${o.serif ? ' class="serif"' : ''}`;
    const sp = lines.map((l, i) => `<tspan x="${x}" y="${(vy + i * lh).toFixed(1)}">${esc(l)}</tspan>`).join('');
    return [`<text ${attrs} dominant-baseline="middle">${sp}</text>`, lines.length * lh];
  }
  const T = (...a) => txt(...a)[0];
  const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
  const hi = (e, i) => (e.highlight ?? -1) === i;

  // ───── 金字塔（執行摘要）：一個結論＋三個支柱 ─────
  function pyramid(e, W = 1200, H = 440) {
    const ps = e.pillars || []; const n = ps.length || 3; const gap = 22;
    const pw = (W - gap * (n - 1)) / n;
    let b = `<rect x="0" y="0" width="${W}" height="110" fill="${C.ink}"/>`;
    b += T(W / 2, 55, e.top, { size: 26, n: 40, weight: 700, fill: C.white, anchor: 'middle', valign: 'middle', serif: 1, max: 2 });
    ps.forEach((p, i) => {
      const x = i * (pw + gap);
      b += `<path d="M${W / 2} 110 V128 H${x + pw / 2} V146" fill="none" stroke="${C.mid}" stroke-width="1.5"/>`;
      b += `<rect x="${x}" y="146" width="${pw}" height="${H - 146}" fill="${C.soft}" stroke="${C.line}"/>`;
      b += `<rect x="${x}" y="146" width="${pw}" height="6" fill="${hi(e, i) ? C.accent : C.ink}"/>`;
      b += T(x + 22, 186, `${i + 1}`, { size: 30, weight: 700, fill: C.accent, serif: 1 });
      b += T(x + 22, 236, p.h, { size: 24, n: (pw - 44) / 24, weight: 700, max: 2 });
      b += T(x + 22, 306, p.d, { size: 19, n: (pw - 44) / 19, fill: C.ink2, max: 6 });
    });
    return svg(W, H, b);
  }

  // ───── 流程步驟：≤4 橫向箭頭，>4 改直向 ─────
  function steps(e, W = 640, H = 440) {
    const it = e.items || []; const n = it.length;
    let b = '';
    if (n <= 4) {
      const w = W / n;
      it.forEach((s, i) => {
        const x = i * w, on = hi(e, i), tip = 18;
        const pts = `${x},20 ${x + w - tip},20 ${x + w},60 ${x + w - tip},100 ${x},100 ${i ? x + tip : x},60`;
        b += `<polygon points="${pts}" fill="${on ? C.accent : (i % 2 ? C.light : '#DDE3E7')}" stroke="#fff" stroke-width="3"/>`;
        b += T(x + w / 2 + (i ? 6 : 0), 60, s.h, { size: 17, n: (w - 44) / 17, weight: 700, anchor: 'middle', valign: 'middle', fill: on ? C.white : C.ink, max: 2 });
        b += `<text x="${x + 10}" y="138" font-size="13" fill="${C.accent}" font-weight="700">STEP ${i + 1}</text>`;
        b += T(x + 10, 168, s.d, { size: 15, n: (w - 20) / 15, fill: C.ink2, max: 9 });
      });
    } else {
      const rh = H / n;
      it.forEach((s, i) => {
        const y = i * rh, on = hi(e, i);
        b += `<rect x="0" y="${y + 4}" width="${W}" height="${rh - 8}" fill="${on ? C.accentL : C.soft}"/>`;
        b += `<circle cx="30" cy="${y + rh / 2}" r="17" fill="${on ? C.accent : C.ink}"/>`;
        b += `<text x="30" y="${y + rh / 2}" font-size="15" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`;
        b += T(62, y + rh / 2, s.h, { size: 16, n: 9, weight: 700, valign: 'middle', max: 2 });
        b += T(220, y + rh / 2, s.d, { size: 14, n: (W - 236) / 14, fill: C.ink2, valign: 'middle', max: 2 });
      });
    }
    return svg(W, H, b);
  }

  // ───── 2×2 矩陣：quads 依序為 左上、右上、左下、右下 ─────
  function matrix(e, W = 640, H = 440) {
    const ox = 46, oy = 10, gw = W - ox - 6, gh = H - oy - 40, cw = gw / 2 - 4, ch = gh / 2 - 4;
    let b = '';
    (e.quads || []).forEach((q, i) => {
      const x = ox + (i % 2) * (cw + 8), y = oy + Math.floor(i / 2) * (ch + 8), on = hi(e, i);
      b += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${on ? C.accent : C.soft}" stroke="${on ? C.accent : C.line}"/>`;
      b += T(x + 18, y + 30, q.h, { size: 18, n: (cw - 36) / 18, weight: 700, fill: on ? C.white : C.ink, max: 2 });
      b += T(x + 18, y + 84, q.d, { size: 14, n: (cw - 36) / 14, fill: on ? '#E6F4F3' : C.ink2, max: 6 });
    });
    b += `<path d="M${ox - 14} ${oy + gh} V${oy}" stroke="${C.gray}" stroke-width="1.5" marker-end="url(#ar)"/>`;
    b += `<path d="M${ox} ${oy + gh + 14} H${ox + gw}" stroke="${C.gray}" stroke-width="1.5" marker-end="url(#ar)"/>`;
    b += `<text transform="translate(${ox - 24} ${oy + gh / 2}) rotate(-90)" font-size="13" fill="${C.gray}" text-anchor="middle">${esc(e.y || '')}</text>`;
    b += `<text x="${ox + gw / 2}" y="${oy + gh + 32}" font-size="13" fill="${C.gray}" text-anchor="middle">${esc(e.x || '')}</text>`;
    const defs = `<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.gray}"/></marker></defs>`;
    return svg(W, H, defs + b);
  }

  // ───── 循環 ─────
  function cycle(e, W = 640, H = 440) {
    const it = e.items || []; const n = it.length; const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 70;
    let b = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 6"/>`;
    if (e.center) b += T(cx, cy, e.center, { size: 18, n: 6, weight: 700, anchor: 'middle', valign: 'middle', fill: C.accent, serif: 1, max: 3 });
    it.forEach((s, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), on = hi(e, i);
      b += `<circle cx="${x}" cy="${y}" r="44" fill="${on ? C.accent : C.ink}"/>`;
      b += T(x, y, s.h, { size: 15, n: 5, weight: 700, anchor: 'middle', valign: 'middle', fill: C.white, max: 2 });
      if (s.d) {
        // 頂端節點的說明放右側，避免超出畫布
        const top = Math.sin(a) < -0.9, right = top || Math.cos(a) > 0.3, left = !top && Math.cos(a) < -0.3;
        const tx = right ? x + 54 : left ? x - 54 : x, ty = top ? y : Math.sin(a) < -0.5 ? y - 64 : Math.sin(a) > 0.5 ? y + 64 : y;
        b += T(tx, ty, s.d, { size: 13, n: 9, fill: C.ink2, anchor: right ? 'start' : left ? 'end' : 'middle', valign: 'middle', max: 3 });
      }
    });
    return svg(W, H, b);
  }

  // ───── 漏斗 ─────
  function funnel(e, W = 640, H = 440) {
    const it = e.items || []; const n = it.length, rh = H / n, fw = W * 0.55;
    let b = '';
    it.forEach((s, i) => {
      const t = fw * (1 - (i * 0.55) / n), bt = fw * (1 - ((i + 1) * 0.55) / n), y = i * rh, on = hi(e, i);
      const x0 = (fw - t) / 2, x1 = (fw - bt) / 2;
      b += `<polygon points="${x0},${y + 3} ${x0 + t},${y + 3} ${x1 + bt},${y + rh - 3} ${x1},${y + rh - 3}" fill="${on ? C.accent : i % 2 ? '#C3CCD3' : '#DDE3E7'}"/>`;
      b += T(fw / 2, y + rh / 2, s.h, { size: 16, n: 8, weight: 700, anchor: 'middle', valign: 'middle', fill: on ? C.white : C.ink, max: 2 });
      b += T(fw + 18, y + rh / 2, s.d, { size: 14, n: (W - fw - 18) / 14, fill: C.ink2, valign: 'middle', max: 3 });
    });
    return svg(W, H, b);
  }

  // ───── 左右對照（左＝舊／一般做法，右＝建議做法） ─────
  function compare(e, W = 640, H = 440) {
    const cw = W / 2 - 10; let b = '';
    [e.left, e.right].forEach((col, k) => {
      if (!col) return; const x = k * (cw + 20), on = k === 1;
      b += `<rect x="${x}" y="0" width="${cw}" height="52" fill="${on ? C.accent : '#8E99A2'}"/>`;
      b += T(x + cw / 2, 26, col.h, { size: 18, n: cw / 18, weight: 700, anchor: 'middle', valign: 'middle', fill: C.white, max: 1 });
      b += `<rect x="${x}" y="52" width="${cw}" height="${H - 52}" fill="${on ? C.accentL : C.soft}"/>`;
      let y = 84;
      (col.items || []).forEach((t) => {
        b += `<rect x="${x + 16}" y="${y - 5}" width="8" height="8" fill="${on ? C.accent : C.mid}"/>`;
        const [s, h] = txt(x + 34, y, t, { size: 15, n: (cw - 50) / 15, fill: C.ink, max: 3 });
        b += s; y += h + 16;
      });
    });
    return svg(W, H, b);
  }

  // ───── 階梯（由低到高的層級／成熟度） ─────
  function ladder(e, W = 640, H = 440) {
    const it = e.items || []; const n = it.length, w = W / n, base = H - 150;
    let b = '';
    it.forEach((s, i) => {
      const h = 70 + (i * (base - 80)) / Math.max(1, n - 1), x = i * w, y = base - h + 20, on = hi(e, i);
      b += `<rect x="${x + 4}" y="${y}" width="${w - 8}" height="${h}" fill="${on ? C.accent : i % 2 ? '#C3CCD3' : '#DDE3E7'}"/>`;
      b += T(x + w / 2, y + 26, s.h, { size: 16, n: (w - 20) / 16, weight: 700, anchor: 'middle', fill: on ? C.white : C.ink, max: 2 });
      b += T(x + 8, base + 46, s.d, { size: 13, n: (w - 14) / 13, fill: C.ink2, max: 6 });
    });
    return svg(W, H, b);
  }

  // ───── 橫條圖 ─────
  function bars(e, W = 640, H = 440) {
    const it = e.items || []; const n = it.length, rh = Math.min(64, (H - 20) / n), max = Math.max(...it.map((d) => +d.value || 0), 1), lw = 170;
    let b = '';
    it.forEach((d, i) => {
      const y = 10 + i * rh, bw = ((W - lw - 70) * (+d.value || 0)) / max, on = hi(e, i);
      b += T(lw - 12, y + rh / 2, d.label, { size: 14, n: 11, anchor: 'end', valign: 'middle', fill: C.ink2, max: 2 });
      b += `<rect x="${lw}" y="${y + rh * 0.2}" width="${bw}" height="${rh * 0.6}" fill="${on ? C.accent : '#B9C3CA'}"/>`;
      b += `<text x="${lw + bw + 8}" y="${y + rh / 2}" font-size="14" font-weight="700" fill="${on ? C.accent : C.ink}" dominant-baseline="central">${esc(d.value)}${esc(e.unit || '')}</text>`;
    });
    return svg(W, H, b);
  }

  // ───── 公式：A ＋ B ＝ C ─────
  function equation(e, W = 640, H = 440) {
    const it = e.items || []; const n = it.length, op = 34, bw = (W - op * (n - 1)) / n;
    let b = '';
    it.forEach((s, i) => {
      const x = i * (bw + op), last = i === n - 1;
      b += `<rect x="${x}" y="60" width="${bw}" height="150" fill="${last ? C.accent : C.soft}" stroke="${last ? C.accent : C.line}"/>`;
      b += T(x + bw / 2, 135, s.h, { size: 22, n: (bw - 20) / 22, weight: 700, anchor: 'middle', valign: 'middle', fill: last ? C.white : C.ink, serif: 1, max: 2 });
      b += T(x + bw / 2, 250, s.d, { size: 14, n: (bw - 8) / 14, anchor: 'middle', fill: C.ink2, max: 6 });
      if (!last) b += `<text x="${x + bw + op / 2}" y="135" font-size="30" font-weight="700" fill="${C.gray}" text-anchor="middle" dominant-baseline="central">${i === n - 2 ? '＝' : '＋'}</text>`;
    });
    return svg(W, H, b);
  }

  // ───── 字母卡（如 MEDDIC 六個字母） ─────
  function grid(e, W = 640, H = 440) {
    const it = e.items || []; const n = it.length, cols = e.cols || (n <= 4 ? 2 : 3), rows = Math.ceil(n / cols), g = 10;
    const cw = (W - g * (cols - 1)) / cols, ch = (H - g * (rows - 1)) / rows;
    let b = '';
    it.forEach((s, i) => {
      const x = (i % cols) * (cw + g), y = Math.floor(i / cols) * (ch + g), on = hi(e, i);
      b += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${on ? C.accentL : C.soft}" stroke="${on ? C.accent : C.line}"/>`;
      if (s.k) b += `<text x="${x + 16}" y="${y + 40}" font-size="34" font-weight="700" fill="${C.accent}" class="serif">${esc(s.k)}</text>`;
      b += T(x + (s.k ? 56 : 16), y + 28, s.h, { size: 15, n: (cw - (s.k ? 66 : 26)) / 15, weight: 700, max: 2 });
      b += T(x + 16, y + 72, s.d, { size: 13, n: (cw - 26) / 13, fill: C.ink2, max: Math.max(2, Math.floor((ch - 80) / 18)) });
    });
    return svg(W, H, b);
  }

  const TYPES = { pyramid, steps, matrix, cycle, funnel, compare, ladder, bars, equation, grid };
  function render(e, full) {
    const f = TYPES[e && e.type];
    if (!f) return '';
    // 半版圖解用較小的畫布，字在投影時才夠大
    return e.type === 'pyramid' ? f(e) : full ? f(e, 1000, 400) : f(e, 540, 420);
  }

  // ───── 重新繪製的抽象書封 ─────
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function cover(item, o = {}) {
    const col = TOPIC_COLOR[item.topic] || C.ink, h = hash(item.id + item.title), W = 300, H = 420;
    const motif = h % 4; let m = '';
    if (motif === 0) for (let i = 0; i < 5; i++) m += `<circle cx="${230 - i * 8}" cy="${120 + i * 6}" r="${90 - i * 16}" fill="none" stroke="#fff" stroke-opacity="${0.12 + i * 0.05}" stroke-width="2"/>`;
    if (motif === 1) for (let i = 0; i < 7; i++) { const k = (h >>> i) % 5; m += `<rect x="${30 + i * 36}" y="${210 - k * 22}" width="22" height="${30 + k * 22}" fill="#fff" fill-opacity="${0.1 + (i % 3) * 0.06}"/>`; }
    if (motif === 2) for (let i = 0; i < 9; i++) m += `<path d="M${-20 + i * 40} 260 L${60 + i * 40} 40" stroke="#fff" stroke-opacity=".16" stroke-width="10"/>`;
    if (motif === 3) m = `<polygon points="150,40 260,230 40,230" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3"/><polygon points="150,95 215,205 85,205" fill="#fff" fill-opacity=".14"/>`;
    const title = String(item.title || '').replace(/^［待確認］/, '');
    const [tt] = txt(28, 292, title, { size: title.length > 14 ? 22 : 27, n: title.length > 14 ? 11.5 : 9.2, weight: 700, fill: '#fff', serif: 1, max: 3 });
    const au = (item.author || '').replace(/［待確認］/, '');
    return svg(W, H,
      `<rect width="${W}" height="${H}" fill="${col}"/>` +
      `<rect width="${W}" height="${H}" fill="url(#g${h})"/>` +
      `<defs><linearGradient id="g${h}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs>` +
      m + `<rect x="28" y="262" width="36" height="3" fill="#fff"/>` + tt +
      (au ? `<text x="28" y="396" font-size="13" fill="#fff" fill-opacity=".85">${esc(au.length > 20 ? au.slice(0, 19) + '…' : au)}</text>` : '') +
      `<text x="272" y="28" font-size="11" fill="#fff" fill-opacity=".7" text-anchor="end">${esc(item.topic || '')}</text>`);
  }

  window.KBX = { render, cover, esc, wrap, TOPIC_COLOR, C };
})();
