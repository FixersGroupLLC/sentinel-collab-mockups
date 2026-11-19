/* review-notes.js - drop-in click-to-pin review notes for any static page.
   Written fresh (CRAFT's repo has no license); same mechanism: link token, name once, numbered pins.

   Attach:  <script src="review-notes.js" data-page="pdp-v1"
              data-supabase-url="https://xxxx.supabase.co" data-supabase-key="sb_publishable_..."></script>
   Reviewer link:  page.html?r=<token>   (token from schema.sql; one token = one page's notes)
   No supabase attrs or no ?r= token -> notes live in this browser only, with Email notes (mailto dillon@sav-tac.com, override with data-email) to send them. */
(() => {
  const me = document.currentScript, cfg = me.dataset;
  const page = cfg.page || location.pathname;
  const token = new URLSearchParams(location.search).get('r');
  const remote = cfg.supabaseUrl && cfg.supabaseKey && token;

  // ---- store: Supabase RPCs (token-gated, see schema.sql) or localStorage ----
  const rpc = (fn, body) => fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => { if (!r.ok) throw new Error(`${fn} ${r.status}`); return r.json(); });
  const LK = `rn:${page}`;
  const local = () => { try { return JSON.parse(localStorage.getItem(LK)) || []; } catch { return []; } };
  const save = a => { try { localStorage.setItem(LK, JSON.stringify(a)); } catch {} };
  const store = remote ? {
    list: () => rpc('rn_get_notes', { p_token: token, p_page: page }),
    put: n => rpc('rn_put_note', { p_token: token, p_page: page, p: n }),
    del: id => rpc('rn_del_note', { p_token: token, p_id: id })
  } : {
    list: async () => local(),
    put: async n => save([...local().filter(x => x.id !== n.id), n]),
    del: async id => save(local().filter(x => x.id !== id))
  };

  // ---- anchor: element path + fractional offset, so pins survive resize and phone layout ----
  const pathOf = el => {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); return parts.join(' > '); }
      let i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
      parts.unshift(`${el.tagName.toLowerCase()}:nth-of-type(${i})`);
      el = el.parentElement;
    }
    return parts.length ? 'body > ' + parts.join(' > ') : 'body';
  };
  const where = n => {
    let el; try { el = document.querySelector(n.sel); } catch {}
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + n.fx * r.width, y: r.top + n.fy * r.height };
  };

  // ---- UI ----
  const css = `
  .rn-ui{font:14px/1.4 system-ui,sans-serif;color:#111;position:relative;z-index:2147483000}
  .rn-btn{position:fixed;right:8px;top:50%;transform:translateY(-50%);max-width:120px;min-height:44px;padding:10px 14px;border:0;border-radius:22px;background:#111;color:#fff;cursor:pointer;box-shadow:0 2px 8px #0004}
  .rn-btn.on{background:#d33}
  .rn-pin{position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:#d33;color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 0 2px #fff,0 2px 6px #0006}
  .rn-pin.done{background:#2a8a3e}
  .rn-pop{position:fixed;width:min(280px,calc(100vw - 32px));background:#fff;border:1px solid #ccc;border-radius:8px;padding:10px;box-shadow:0 4px 16px #0003}
  .rn-pop textarea{width:100%;box-sizing:border-box;min-height:80px;font:inherit;border:1px solid #bbb;border-radius:4px;padding:6px}
  .rn-pop .rn-row{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
  .rn-ui button.rn-s{border:1px solid #bbb;background:#f4f4f4;border-radius:4px;padding:4px 10px;cursor:pointer;font:inherit}
  .rn-ui button.rn-p{background:#111;color:#fff;border-color:#111}
  .rn-panel{position:fixed;top:0;right:0;width:320px;height:100vh;background:#fafafa;border-left:1px solid #ddd;overflow:auto;padding:12px;box-sizing:border-box;display:none}
  .rn-panel.open{display:block}
  .rn-panel{z-index:2}.rn-btn{z-index:3}.rn-pop{z-index:4}
  .rn-panel h3{margin:0 0 4px;font-size:15px}
  .rn-item{background:#fff;border:1px solid #e2e2e2;border-radius:6px;padding:8px;margin:8px 0;cursor:pointer}
  .rn-item.done{opacity:.55}
  .rn-meta{font-size:12px;color:#666}
  .rn-body{white-space:pre-wrap;margin:4px 0}
  .rn-mode *{cursor:crosshair !important}
  @media (max-width:700px){.rn-panel{width:100vw;height:55vh;top:auto;bottom:0;border-left:0;border-top:1px solid #ddd}}`;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const ui = Object.assign(document.createElement('div'), { className: 'rn-ui' });
  document.body.append(ui);
  const mk = (tag, cls, text, parent = ui) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; parent.append(e); return e; };

  const btn = mk('button', 'rn-btn', 'Notes');
  const panel = mk('div', 'rn-panel');
  let notes = [], mode = false, pop = null;

  const author = () => {
    let a = ''; try { a = localStorage.getItem('rn:author') || ''; } catch {}
    if (!a) { a = (prompt('Your name for review notes:') || '').trim() || 'Reviewer'; try { localStorage.setItem('rn:author', a); } catch {} }
    return a;
  };
  const closePop = () => { pop && pop.remove(); pop = null; };
  const placePop = (p, x, y) => {
    p.style.left = Math.max(16, Math.min(x + 14, innerWidth - p.offsetWidth - 16)) + 'px';
    p.style.top = Math.max(16, Math.min(y + 14, innerHeight - p.offsetHeight - 16)) + 'px';
  };

  const render = () => {
    ui.querySelectorAll('.rn-pin').forEach(p => p.remove());
    panel.textContent = '';
    const open = notes.filter(n => n.state !== 'done').length;
    btn.textContent = mode ? 'Tap the page. Tap here to stop' : `Notes (${open})`;
    btn.classList.toggle('on', mode);
    const head = mk('div', null, null, panel);
    mk('h3', null, `Review notes - ${notes.length}`, head);
    mk('div', 'rn-meta', remote ? 'Shared: everyone with this link sees these.' : 'Saved on this device only. Tap Email notes to send them to SavTac.', head);
    const bar = mk('div', 'rn-row', null, head); bar.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    const add = mk('button', 'rn-s rn-p', mode ? 'Stop adding' : 'Add note', bar); add.onclick = () => setMode(!mode);
    mk('button', 'rn-s', 'Email notes', bar).onclick = emailNotes;
    mk('button', 'rn-s', 'Download', bar).onclick = exportNotes;
    const cl = mk('button', 'rn-s', 'Close', bar); cl.onclick = () => panel.classList.remove('open');

    notes.sort((a, b) => a.n - b.n).forEach(n => {
      const pos = where(n);
      if (pos) {
        const pin = mk('div', 'rn-pin' + (n.state === 'done' ? ' done' : ''), n.n);
        pin.dataset.id = n.id; pin.title = n.body;
        pin.onclick = e => { e.stopPropagation(); showNote(n, pos); };
      }
      const it = mk('div', 'rn-item' + (n.state === 'done' ? ' done' : ''), null, panel);
      mk('div', 'rn-meta', `#${n.n} ${n.author} - ${new Date(n.at).toLocaleString()}${pos ? '' : ' - spot moved, page changed'}`, it);
      mk('div', 'rn-body', n.body, it);
      if (n.snip) mk('div', 'rn-meta', `near: "${n.snip}"`, it);
      it.onclick = () => { const el = document.querySelector(n.sel); el && el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    });
    position();
  };
  const position = () => ui.querySelectorAll('.rn-pin').forEach(p => {
    const pos = where(notes.find(n => n.id === p.dataset.id));
    p.style.display = pos ? '' : 'none';
    if (pos) { p.style.left = pos.x + 'px'; p.style.top = pos.y + 'px'; }
  });

  const showNote = (n, pos) => {
    closePop();
    pop = mk('div', 'rn-pop');
    mk('div', 'rn-meta', `#${n.n} ${n.author} - ${new Date(n.at).toLocaleString()}`, pop);
    mk('div', 'rn-body', n.body, pop);
    const row = mk('div', 'rn-row', null, pop);
    mk('button', 'rn-s', n.state === 'done' ? 'Reopen' : 'Resolve', row).onclick = () => commit({ ...n, state: n.state === 'done' ? 'open' : 'done' });
    mk('button', 'rn-s', 'Delete', row).onclick = async () => { if (confirm(`Delete note #${n.n}?`)) { await store.del(n.id).catch(fail); closePop(); refresh(); } };
    mk('button', 'rn-s', 'Close', row).onclick = closePop;
    placePop(pop, pos.x, pos.y);
  };

  const drafting = () => pop && pop.querySelector('textarea') && pop.querySelector('textarea').value.trim();
  const newNote = (target, x, y) => {
    if (drafting() && !confirm('Discard the note you are writing?')) return;
    closePop();
    const r = target.getBoundingClientRect();
    const draft = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random(),
      sel: pathOf(target),
      fx: r.width ? (x - r.left) / r.width : 0, fy: r.height ? (y - r.top) / r.height : 0,
      snip: (target.innerText || target.alt || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      url: location.pathname
    };
    pop = mk('div', 'rn-pop');
    const ta = mk('textarea', null, null, pop); ta.placeholder = 'What should change here?';
    const row = mk('div', 'rn-row', null, pop);
    mk('button', 'rn-s', 'Cancel', row).onclick = closePop;
    const ok = mk('button', 'rn-s rn-p', 'Save', row);
    ok.onclick = () => { const body = ta.value.trim(); if (!body) return ta.focus(); commit({ ...draft, body, author: author(), at: new Date().toISOString(), state: 'open', n: Math.max(0, ...notes.map(n => n.n)) + 1 }); };
    placePop(pop, x, y); ta.focus();
  };

  const fail = e => alert('Note did not save: ' + e.message);
  const commit = async n => { try { await store.put(n); closePop(); refresh(); } catch (e) { fail(e); } };
  const refresh = async () => { try { notes = await store.list(); } catch (e) { notes = []; console.warn('review-notes', e); } render(); };
  const setMode = on => { mode = on; if (on) panel.classList.remove('open'); document.documentElement.classList.toggle('rn-mode', on); closePop(); render(); };
  const fmt = (list, pg) => list.slice().sort((a, b) => a.n - b.n).map(n => `#${n.n} [${n.state}] ${n.author}, ${new Date(n.at).toLocaleString()}\nPage: ${pg}  near: "${n.snip}"\n${n.body}\n`).join('\n');
  // Local mode: every page on this site that carries the script, so one email covers all tabs.
  const allPages = () => {
    if (remote) return [[page, notes]];
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k.startsWith('rn:') || k === 'rn:author') continue;
        try { const arr = JSON.parse(localStorage.getItem(k)); if (Array.isArray(arr) && arr.length) out.push([k.slice(3), arr]); } catch {}
      }
    } catch {}
    return out.sort((x, y) => x[0].localeCompare(y[0]));
  };
  const allText = groups => groups.map(([pg, list]) => `===== ${pg} (${list.length}) =====\n${fmt(list, pg)}`).join('\n');
  const exportNotes = () => { // download fallback
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([allText(allPages())], { type: 'text/plain' })), download: `review-notes-${page.replace(/\W+/g, '-')}.txt` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // Static page can't send mail: copy the full list, open the reviewer's mail app addressed to us.
  // ponytail: mailto caps out near 2k chars in some mail apps, so long lists ride the clipboard.
  const emailNotes = async () => {
    const groups = allPages(), count = groups.reduce((t, g) => t + g[1].length, 0);
    if (!count) return alert('No notes yet.');
    const full = allText(groups), to = cfg.email || 'dillon@sav-tac.com';
    let copied = false; try { await navigator.clipboard.writeText(full); copied = true; } catch {}
    let body = full;
    if (encodeURIComponent(body).length > 1800) {
      body = full.slice(0, 900) + (copied ? '\n\n[List cut short here. The full list is copied: select this line and paste.]' : '\n\n[List cut short. Use Download on the page and attach the file.]');
    }
    const subject = `Review notes (${count}) - ${groups.map(g => g[0]).join(', ')}`.slice(0, 150);
    const a = Object.assign(document.createElement('a'), { href: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, target: '_top' });
    document.body.append(a); a.click(); a.remove();
  };
  btn.onclick = () => { if (mode) return setMode(false); panel.classList.toggle('open'); };
  // Capture phase: in note mode, clicks place a note instead of following links/buttons.
  document.addEventListener('click', e => {
    if (!mode || e.target.closest('.rn-ui')) return;
    e.preventDefault(); e.stopPropagation();
    newNote(e.target === document.documentElement ? document.body : e.target, e.clientX, e.clientY);
  }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (drafting()) return; closePop(); if (mode) setMode(false); } });
  addEventListener('scroll', () => requestAnimationFrame(position), { passive: true, capture: true });
  addEventListener('resize', () => requestAnimationFrame(position));
  addEventListener('focus', refresh); // ponytail: refresh on focus, add realtime only if two people edit live
  refresh();
})();
