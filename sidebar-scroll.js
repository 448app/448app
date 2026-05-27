/* sidebar-scroll.js
   Shared UX utilities — โหลดในทุกหน้าที่มี sidebar
   1. จำตำแหน่ง scroll ของ .app-sidebar ระหว่างหน้า
   2. ป้องกัน mouse wheel เปลี่ยนค่าใน <input type="number"> โดยไม่ตั้งใจ
   3. Register Service Worker — auto cache busting (ไม่ต้องกด Ctrl+Shift+R) */

/* Register Service Worker — network-first strategy
   ข้าม SW เมื่อโหลดผ่าน file:// (double-click เปิดไฟล์) — browser security ห้าม
   หรือเมื่อ origin เป็น null (sandboxed iframe) */
if ('serviceWorker' in navigator
    && (location.protocol === 'https:' || location.protocol === 'http:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      /* Force check update ทุกครั้งที่หน้าเปิด */
      reg.update();
      /* ถ้ามี update ใหม่ — บังคับ activate + reload ครั้งเดียว */
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'activated' && navigator.serviceWorker.controller) {
            /* SW ใหม่ activate แล้ว — reload เพื่อให้ controller คุมหน้า */
            window.location.reload();
          }
        });
      });
    }).catch(() => { /* SW register ล้มเหลว — ignore */ });
  });
}

(function () {
  const KEY = 'aia_sidebar_scroll';

  function restore() {
    const sb = document.querySelector('.app-sidebar');
    if (!sb) return;
    const y = sessionStorage.getItem(KEY);
    if (y !== null) sb.scrollTop = parseFloat(y) || 0;
  }

  function save() {
    const sb = document.querySelector('.app-sidebar');
    if (sb) sessionStorage.setItem(KEY, String(sb.scrollTop));
  }

  /* แสดงรูปลูกค้าใน mini-avatar ของ client picker (ใช้ในทุกหน้า) */
  function updateClientMiniAvatar() {
    const av = document.getElementById('cp-mini-avatar');
    const sel = document.getElementById('client-select');
    if (!av) return;
    const cid = sel ? sel.value : null;
    if (!cid) { av.innerHTML = '👤'; return; }
    try {
      const uid = localStorage.getItem('aia_currentUser');
      const users = JSON.parse(localStorage.getItem('aia_users') || '[]');
      const u = users.find(x => x.id === uid);
      const c = (u && u.data && u.data.clients || []).find(x => x.id === cid);
      if (c && c.photo) {
        av.innerHTML = `<img src="${c.photo}" alt="">`;
      } else if (c) {
        av.textContent = (c.firstName || '?').charAt(0).toUpperCase();
      } else {
        av.innerHTML = '👤';
      }
    } catch (e) { av.innerHTML = '👤'; }
  }

  /* ════════════════════════════════════════════
     COLLAPSE / EXPAND sidebar — Option A (slide out fully)
     - บันทึก state ใน localStorage (sync ทุกหน้า)
     - inject ปุ่ม toggle + reopen handle ลงในทุกหน้า
  ═══════════════════════════════════════════ */
  const COLLAPSE_KEY = 'aia_sidebar_collapsed';

  function applyCollapseState() {
    const collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
    /* sync html attribute (set by inline <head> script BEFORE first paint) */
    if (collapsed) document.documentElement.setAttribute('data-sb-collapsed', '1');
    else            document.documentElement.removeAttribute('data-sb-collapsed');
    const sb = document.querySelector('.app-sidebar');
    const main = document.querySelector('.app-main');
    if (!sb || !main) return;
    sb.classList.toggle('collapsed', collapsed);
    main.classList.toggle('expanded', collapsed);
    const handle = document.getElementById('sb-reopen-handle');
    if (handle) handle.classList.toggle('visible', collapsed);
  }

  /* Enable transitions AFTER initial state is applied — กัน flicker ตอนเปลี่ยนหน้า:
     ถ้า transition active ตั้งแต่ first paint, sidebar จะ animate จาก default
     (visible) → collapsed ทุกครั้งที่โหลดหน้าใหม่ที่ user เคย collapsed ไว้.
     เพิ่ม .anim-ready class หลัง first paint เสร็จ — transitions ทำงานเฉพาะ
     ตอน user toggle เท่านั้น (ไม่ใช่ตอน initial render). */
  function enableTransitionsAfterFirstPaint() {
    const sb = document.querySelector('.app-sidebar');
    const main = document.querySelector('.app-main');
    if (!sb || !main) return;
    /* requestAnimationFrame x2 = หลัง first paint */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sb.classList.add('anim-ready');
      main.classList.add('anim-ready');
    }));
  }

  function toggleSidebar() {
    const cur = localStorage.getItem(COLLAPSE_KEY) === '1';
    localStorage.setItem(COLLAPSE_KEY, cur ? '0' : '1');
    applyCollapseState();
  }
  window.toggleSidebar = toggleSidebar;

  function injectCollapseUI() {
    const sb = document.querySelector('.app-sidebar');
    if (!sb || document.getElementById('sb-collapse-btn')) return;
    /* Toggle button — top-right of sidebar, inside the logo area */
    const logo = sb.querySelector('.sb-logo-area');
    if (logo) {
      const btn = document.createElement('button');
      btn.id = 'sb-collapse-btn';
      btn.className = 'sb-collapse-btn';
      btn.title = 'ซ่อนเมนู (Ctrl+B)';
      btn.innerHTML = '◀';
      btn.onclick = toggleSidebar;
      logo.appendChild(btn);
    }
    /* Reopen handle — floating button at left edge when collapsed */
    if (!document.getElementById('sb-reopen-handle')) {
      const handle = document.createElement('button');
      handle.id = 'sb-reopen-handle';
      handle.className = 'sb-reopen-handle';
      handle.title = 'เปิดเมนู (Ctrl+B)';
      handle.innerHTML = '▶';
      handle.onclick = toggleSidebar;
      document.body.appendChild(handle);
    }
    applyCollapseState();
  }

  /* Keyboard shortcut: Ctrl+B / Cmd+B */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleSidebar();
    }
  });

  /* Auto-replace emoji sidebar icons → SVG (sleek Planista-style)
     ต้องโหลด icons.js ก่อน script นี้ (เช็คว่ามี window.IconLib) */
  function replaceSidebarIcons() {
    if (!window.IconLib) return;
    /* sidebar icons — replace <span class="sb-ico">emoji</span> → SVG */
    window.IconLib.autoReplaceIcons('.app-sb-item .sb-ico');
  }

  /* ════════════════════════════════════════════
     iOS/iPad onchange RELIABILITY FIX (global, all pages)
     ปัญหา: iOS Safari/PWA บางครั้งไม่ยิง `change` event เมื่อ input blur
     ไปยัง tap target (เช่นปุ่ม) ขณะ keyboard เปิด → typed values หายไป.
     Fix: snapshot value ตอน focus + dispatch `change` explicitly ตอน blur
     ถ้า value เปลี่ยน → onchange handler ของหน้านั้นๆ ทำงาน save ทันที.
     Capture phase (3rd arg = true) เพื่อจับ focus/blur ของทุก input/textarea
     (focus/blur ไม่ bubble แต่ capture จับได้)
  ═══════════════════════════════════════════ */
  function installIosOnchangeFix() {
    const FOCUS_VAL = '_iosFocusVal';
    document.addEventListener('focus', (e) => {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el[FOCUS_VAL] = el.value;
      }
    }, true);
    document.addEventListener('blur', (e) => {
      const el = e.target;
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
      if (el[FOCUS_VAL] === undefined) return;
      const oldVal = el[FOCUS_VAL];
      delete el[FOCUS_VAL];
      if (oldVal !== el.value) {
        /* Value changed during focus — บังคับ fire change.
           ถ้า browser ยิงเองอยู่แล้ว → onchange จะรัน 2 ครั้ง (idempotent save) */
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      }
    }, true);
  }

  /* ════════════════════════════════════════════
     FAB + POPUP MENU — Apple-style (Option 5)
     ปุ่มเดี่ยวลอยมุมขวาล่าง — กดแล้วเด้ง 3 ปุ่ม Timeline/Pyramid/Exit
     กดที่อื่นเพื่อปิด / Esc ปิด
  ═══════════════════════════════════════════ */
  function injectFmenuStyles() {
    if (document.getElementById('fmenu-styles')) return;
    const style = document.createElement('style');
    style.id = 'fmenu-styles';
    style.textContent = `
      /* ── FAB main button ── */
      .fmenu-fab {
        position: fixed; right: 20px;
        bottom: calc(var(--fmenu-bottom, 22px) + env(safe-area-inset-bottom, 0px));
        z-index: 9000;
        width: 44px; height: 44px; border-radius: 50%;
        background: linear-gradient(135deg, #1F2D4F 0%, #2C3E61 100%);
        color: white; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow:
          0 6px 16px rgba(31,45,79,.35),
          0 2px 5px rgba(31,45,79,.18);
        transition: bottom .25s ease, background .3s, box-shadow .3s, transform .3s cubic-bezier(.2,.9,.3,1.05);
        font-family: 'Sarabun', sans-serif;
        padding: 0; line-height: 1;
        overflow: hidden;
      }
      .fmenu-fab:hover {
        transform: translateY(-2px) scale(1.05);
        box-shadow:
          0 12px 28px rgba(31,45,79,.5),
          0 4px 10px rgba(31,45,79,.25);
      }
      .fmenu-fab.open {
        background: linear-gradient(135deg, #C9A961 0%, #A88A4F 100%);
        box-shadow:
          0 12px 28px rgba(201,169,97,.45),
          0 4px 10px rgba(201,169,97,.25);
      }
      /* Cross-fade between ⋯ (default) and × (open) */
      .fmenu-fab-icon {
        position: relative;
        width: 24px; height: 24px;
        display: flex; align-items: center; justify-content: center;
      }
      .fmenu-fab-icon .ic-dots,
      .fmenu-fab-icon .ic-close {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        transition: opacity .25s, transform .35s cubic-bezier(.2,.9,.3,1.05);
      }
      /* ⋯ — CSS dots (3 spans, guaranteed rendering on all fonts) */
      .fmenu-fab-icon .ic-dots {
        gap: 5px;
        opacity: 1; transform: scale(1) rotate(0deg);
      }
      .fmenu-fab-icon .ic-dots .dot {
        width: 5px; height: 5px; border-radius: 50%;
        background: currentColor;
        display: inline-block;
      }
      /* × — close icon (SVG-style line drawing for clarity) */
      .fmenu-fab-icon .ic-close {
        opacity: 0; transform: scale(.5) rotate(-90deg);
      }
      .fmenu-fab-icon .ic-close::before,
      .fmenu-fab-icon .ic-close::after {
        content: '';
        position: absolute; top: 50%; left: 50%;
        width: 16px; height: 2px;
        background: currentColor; border-radius: 2px;
        transform: translate(-50%, -50%) rotate(45deg);
      }
      .fmenu-fab-icon .ic-close::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }
      .fmenu-fab.open .fmenu-fab-icon .ic-dots {
        opacity: 0; transform: scale(.5) rotate(90deg);
      }
      .fmenu-fab.open .fmenu-fab-icon .ic-close {
        opacity: 1; transform: scale(1) rotate(0deg);
      }

      /* ── Popup items ── */
      .fmenu-items {
        position: fixed; right: 20px;
        bottom: calc(var(--fmenu-bottom, 22px) + 56px + env(safe-area-inset-bottom, 0px));
        z-index: 9000;
        display: flex; flex-direction: column; align-items: flex-end;
        gap: 10px;
        pointer-events: none;
        transition: bottom .25s ease;
      }
      /* Auto-shift when flow-bar is present (sticky bottom nav ~64px tall)
         Use a generous clearance (~95px) to be safe on iPad (where flow-bar
         may be slightly taller due to safe-area or larger fonts) */
      body.has-flow-bar { --fmenu-bottom: 95px; }
      /* Modern browsers: pure CSS :has() detection (no JS race condition) */
      @supports selector(:has(.flow-bar)) {
        body:has(.flow-bar) { --fmenu-bottom: 95px; }
      }
      .fmenu-item {
        display: flex; align-items: center; gap: 10px;
        opacity: 0;
        transform: translateY(20px) scale(.85);
        transition: opacity .25s, transform .35s cubic-bezier(.34,1.56,.64,1);
        pointer-events: none;
      }
      .fmenu-items.open .fmenu-item {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      /* Stagger animation — bottom item first */
      .fmenu-items.open .fmenu-item:nth-child(3) { transition-delay: 0s; }
      .fmenu-items.open .fmenu-item:nth-child(2) { transition-delay: .05s; }
      .fmenu-items.open .fmenu-item:nth-child(1) { transition-delay: .1s; }

      .fmenu-item-label {
        background: rgba(31,45,79,.92);
        color: white;
        padding: 6px 12px;
        border-radius: 50px;
        font-size: .76rem; font-weight: 700;
        font-family: 'Sarabun', sans-serif;
        white-space: nowrap;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 3px 10px rgba(0,0,0,.18);
      }
      .fmenu-item-btn {
        width: 40px; height: 40px; border-radius: 50%;
        background: white;
        color: #1F2D4F; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow:
          0 5px 14px rgba(0,0,0,.16),
          0 2px 4px rgba(0,0,0,.08);
        transition: all .18s;
        font-family: inherit;
        padding: 0;
      }
      .fmenu-item-btn svg { width: 18px; height: 18px; }
      .fmenu-item-btn:hover {
        background: #1F2D4F; color: white;
        transform: scale(1.08);
        box-shadow: 0 7px 18px rgba(31,45,79,.3);
      }
      .fmenu-item-btn.active {
        background: linear-gradient(135deg, #C9A961, #A88A4F);
        color: white;
      }
      .fmenu-item-btn.fm-exit { color: #B02030; }
      .fmenu-item-btn.fm-exit:hover { background: #B02030; color: white; }

      /* ── Backdrop dim ── */
      .fmenu-backdrop {
        position: fixed; inset: 0; z-index: 8999;
        background: rgba(0,0,0,0);
        opacity: 0;
        pointer-events: none;
        transition: background .25s, opacity .25s;
      }
      .fmenu-backdrop.open {
        background: rgba(0,0,0,.12);
        opacity: 1;
        pointer-events: auto;
      }

      /* ── Mobile ── */
      @media (max-width: 600px) {
        .fmenu-fab { width: 40px; height: 40px; right: 14px; }
        .fmenu-items { right: 14px; }
        .fmenu-item-btn { width: 36px; height: 36px; }
        .fmenu-item-btn svg { width: 16px; height: 16px; }
        .fmenu-item-label { font-size: .72rem; padding: 5px 11px; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectFmenu() {
    if (document.getElementById('fmenu-fab')) return;

    /* Determine active state */
    const path = (location.pathname || '').toLowerCase();
    const isTimeline = path.endsWith('timeline.html');
    const isPyramid  = path.endsWith('pyramid.html');

    /* SVG icons fallback to emoji */
    const ico = (name, emoji) => {
      if (window.IconLib && window.IconLib.getIcon) {
        const svg = window.IconLib.getIcon(name, { size: 22 });
        if (svg) return svg;
      }
      return emoji;
    };
    /* FAB shows 3 dots (closed) ↔ × (open) — cross-fade
       Use CSS-drawn dots (3 spans) instead of unicode ⋯ —
       guaranteed to render correctly on all systems/fonts */
    const fabIconHTML = `
      <span class="fmenu-fab-icon">
        <span class="ic-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
        <span class="ic-close"></span>
      </span>
    `;

    /* Backdrop */
    const backdrop = document.createElement('div');
    backdrop.className = 'fmenu-backdrop';
    backdrop.id = 'fmenu-backdrop';
    backdrop.addEventListener('click', closeFmenu);
    document.body.appendChild(backdrop);

    /* Items popup */
    const items = document.createElement('div');
    items.id = 'fmenu-items';
    items.className = 'fmenu-items';
    items.innerHTML = `
      <div class="fmenu-item">
        <span class="fmenu-item-label">Timeline</span>
        <button class="fmenu-item-btn ${isTimeline ? 'active' : ''}"
                onclick="location.href='timeline.html'" title="Timeline">${ico('map', '🗺️')}</button>
      </div>
      <div class="fmenu-item">
        <span class="fmenu-item-label">Pyramid · สามเหลี่ยมการเงิน</span>
        <button class="fmenu-item-btn ${isPyramid ? 'active' : ''}"
                onclick="location.href='pyramid.html'" title="Pyramid">${ico('pyramid', '🔺')}</button>
      </div>
      <div class="fmenu-item">
        <span class="fmenu-item-label">กลับหน้าแรก</span>
        <button class="fmenu-item-btn fm-exit"
                onclick="location.href='dashboard.html'" title="Exit">${ico('exit', '🚪')}</button>
      </div>
    `;
    document.body.appendChild(items);

    /* FAB main */
    const fab = document.createElement('button');
    fab.id = 'fmenu-fab';
    fab.className = 'fmenu-fab';
    fab.title = 'เมนูลัด';
    fab.innerHTML = fabIconHTML;
    fab.addEventListener('click', toggleFmenu);
    document.body.appendChild(fab);

    /* Esc to close */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFmenu();
    });

    /* Auto-detect .flow-bar to shift FAB up (avoid overlap with sticky bottom nav).
       flow-nav.js may inject .flow-bar AFTER sidebar-scroll.js init, so we:
       1. Check immediately
       2. Watch for DOM mutations (flow-nav.js inserts later)
       3. Re-check after 500ms as a safety net */
    function checkFlowBar() {
      const has = !!document.querySelector('.flow-bar');
      document.body.classList.toggle('has-flow-bar', has);
    }
    checkFlowBar();
    /* Observe body for .flow-bar insertion/removal */
    const mo = new MutationObserver(() => checkFlowBar());
    mo.observe(document.body, { childList: true, subtree: true });
    /* Safety re-check */
    setTimeout(checkFlowBar, 500);
    setTimeout(checkFlowBar, 1500);
  }

  function toggleFmenu() {
    const fab = document.getElementById('fmenu-fab');
    const items = document.getElementById('fmenu-items');
    const backdrop = document.getElementById('fmenu-backdrop');
    if (!fab || !items || !backdrop) return;
    const isOpen = fab.classList.contains('open');
    if (isOpen) closeFmenu();
    else openFmenu();
  }
  function openFmenu() {
    document.getElementById('fmenu-fab')?.classList.add('open');
    document.getElementById('fmenu-items')?.classList.add('open');
    document.getElementById('fmenu-backdrop')?.classList.add('open');
  }
  function closeFmenu() {
    document.getElementById('fmenu-fab')?.classList.remove('open');
    document.getElementById('fmenu-items')?.classList.remove('open');
    document.getElementById('fmenu-backdrop')?.classList.remove('open');
  }
  window.toggleFmenu = toggleFmenu;
  window.openFmenu = openFmenu;
  window.closeFmenu = closeFmenu;

  function init() {
    restore();
    injectCollapseUI();
    injectFmenuStyles();
    injectFmenu();
    replaceSidebarIcons();
    installIosOnchangeFix();
    enableTransitionsAfterFirstPaint();
    const sb = document.querySelector('.app-sidebar');
    if (sb) {
      sb.addEventListener('click', (e) => {
        if (e.target.closest('.app-sb-item, .sb-profile-row')) save();
      });
    }
    window.addEventListener('beforeunload', save);
    window.addEventListener('pagehide', save);

    /* sync collapse state across tabs */
    window.addEventListener('storage', (e) => {
      if (e.key === COLLAPSE_KEY) applyCollapseState();
    });

    /* ป้องกัน wheel เปลี่ยนค่า number input ที่ focus อยู่
       (browser default — scroll mouse บน number input ที่ focus = ค่าขึ้น/ลง)
       แก้โดย blur input ทันทีเมื่อ wheel — ค่าไม่เปลี่ยน scroll ปกติ */
    document.addEventListener('wheel', (e) => {
      const el = document.activeElement;
      if (el && el.tagName === 'INPUT' && el.type === 'number') {
        el.blur();
      }
    }, { passive: true });

    /* Mini avatar — รูปลูกค้าใน client picker */
    const sel = document.getElementById('client-select');
    if (sel) {
      sel.addEventListener('change', updateClientMiniAvatar);
      /* Initial render — page อาจ render select option ทีหลัง ใช้ delay สั้นๆ */
      setTimeout(updateClientMiniAvatar, 100);
      setTimeout(updateClientMiniAvatar, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
