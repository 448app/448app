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
     FLOATING ACTION MENU — Timeline / Pyramid / Exit
     แสดงในทุกหน้าของ flow (ทุกหน้าที่โหลด sidebar-scroll.js)
     - กด toggle ลูกศรเพื่อหลบไปขอบจอ (state บันทึกใน localStorage)
     - ปุ่ม Timeline = active เมื่ออยู่หน้า timeline.html
     - Pyramid = placeholder (เปิดเร็วๆนี้)
     - Exit = กลับ dashboard.html
  ═══════════════════════════════════════════ */
  const FMENU_KEY = 'aia_fmenu_collapsed';

  function injectFmenuStyles() {
    if (document.getElementById('fmenu-styles')) return;
    const style = document.createElement('style');
    style.id = 'fmenu-styles';
    style.textContent = `
      .fmenu {
        position: fixed; right: 16px;
        /* iOS PWA safe-area — กัน home indicator บัง */
        bottom: calc(72px + env(safe-area-inset-bottom, 0px));
        z-index: 9000;
        background: white; border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.08);
        padding: 7px 6px; display: flex; flex-direction: column; gap: 3px;
        transition: transform .35s cubic-bezier(.2,.9,.3,1.05);
        border: 1.5px solid #D5DAE2;
        font-family: 'Sarabun', sans-serif;
        /* fmenu จะอยู่บนเสมอ — ไม่ถูก clipping context อะไรบัง */
        isolation: isolate;
      }
      .fmenu.collapsed { transform: translateX(calc(100% - 26px)); }
      .fmenu.collapsed .fm-item { opacity: 0; pointer-events: none; }
      .fmenu-toggle {
        position: absolute; left: -16px; top: 50%; transform: translateY(-50%);
        width: 26px; height: 52px; border-radius: 13px 0 0 13px;
        background: #1F2D4F; color: white; border: none;
        font-size: 1rem; font-weight: 800; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: -3px 3px 10px rgba(0,0,0,.20);
        transition: all .25s; line-height: 1; padding: 0;
        font-family: inherit;
      }
      .fmenu-toggle:hover { background: #2C3E61; }
      .fmenu.collapsed .fmenu-toggle { transform: translateY(-50%) rotate(180deg); }
      /* Pulse animation ครั้งแรก เพื่อให้ user สังเกตเห็น (auto-stop) */
      @keyframes fmenu-pulse {
        0%, 100% { box-shadow: -3px 3px 10px rgba(0,0,0,.20); }
        50%      { box-shadow: -3px 3px 18px rgba(25,118,210,.65), 0 0 0 4px rgba(25,118,210,.18); }
      }
      .fmenu.collapsed .fmenu-toggle { animation: fmenu-pulse 1.6s ease-in-out 2; }
      .fm-item {
        display: flex; flex-direction: column; align-items: center;
        gap: 3px; padding: 7px 6px; border-radius: 10px;
        background: white; border: none; cursor: pointer;
        font-family: inherit; font-weight: 700; font-size: .65rem;
        color: #374151; min-width: 56px;
        transition: all .15s;
      }
      .fm-item:hover { background: #FDE8E8; color: #B02030; }
      .fm-item.active { background: #E3F2FD; color: #1976D2; }
      .fm-item .fm-ico {
        width: 24px; height: 24px;
        display: flex; align-items: center; justify-content: center;
      }
      .fm-item .fm-ico svg { width: 22px; height: 22px; }
      .fm-item.fm-exit { color: #B02030; }
      .fm-item.fm-exit:hover { background: #FFEBEE; }
      .fm-divider { height: 1px; background: #E5E7EB; margin: 2px 5px; }
      /* mobile (< 600px) — ขนาดเล็กลงเฉพาะมือถือเล็ก iPad ยังคงไซส์ปกติ */
      @media (max-width: 600px) {
        .fmenu { right: 10px; padding: 5px 4px; }
        .fm-item { min-width: 48px; font-size: .6rem; padding: 5px 4px; }
        .fm-item .fm-ico { width: 20px; height: 20px; }
        .fm-item .fm-ico svg { width: 18px; height: 18px; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectFmenu() {
    if (document.getElementById('fmenu')) return;
    /* One-time reset: ลบ state เก่าจากการทดสอบ v96/v97 (collapsed) — user จะเห็นเมนูแน่นอน
       หลังจาก reset แล้ว user สามารถ collapse ได้เองตามต้องการ */
    try {
      const RESET_KEY = 'aia_fmenu_reset_v98';
      if (!localStorage.getItem(RESET_KEY)) {
        localStorage.removeItem(FMENU_KEY);
        localStorage.setItem(RESET_KEY, '1');
      }
    } catch(_){}
    /* ตัดสินว่าหน้าไหน active — match path สุดท้าย */
    const path = (location.pathname || '').toLowerCase();
    const isTimeline = path.endsWith('timeline.html');
    const isPyramid  = path.endsWith('pyramid.html');
    /* ใช้ SVG icons จาก IconLib (line-style เหมือน sidebar) — fallback เป็น emoji ถ้ายังไม่โหลด */
    const ico = (name, emoji) => {
      if (window.IconLib && window.IconLib.getIcon) {
        const svg = window.IconLib.getIcon(name, { size: 22 });
        if (svg) return svg;
      }
      return emoji;
    };
    const wrap = document.createElement('div');
    wrap.id = 'fmenu';
    wrap.className = 'fmenu';
    wrap.innerHTML = `
      <button class="fmenu-toggle" onclick="toggleFmenu()" title="ซ่อน/แสดง">‹</button>
      <button class="fm-item ${isTimeline ? 'active' : ''}" onclick="location.href='timeline.html'" title="Timeline">
        <span class="fm-ico">${ico('map', '🗺️')}</span>
        <span>Timeline</span>
      </button>
      <button class="fm-item ${isPyramid ? 'active' : ''}" onclick="location.href='pyramid.html'" title="Pyramid">
        <span class="fm-ico">${ico('pyramid', '🔺')}</span>
        <span>Pyramid</span>
      </button>
      <div class="fm-divider"></div>
      <button class="fm-item fm-exit" onclick="location.href='dashboard.html'" title="กลับหน้าแรก">
        <span class="fm-ico">${ico('exit', '🚪')}</span>
        <span>Exit</span>
      </button>
    `;
    document.body.appendChild(wrap);
    try {
      if (localStorage.getItem(FMENU_KEY) === '1') wrap.classList.add('collapsed');
    } catch(_) {}
    /* Entry animation — slide in from right ครั้งแรกที่โหลดหน้า เพื่อให้สังเกตเห็น */
    if (!wrap.classList.contains('collapsed')) {
      wrap.style.transform = 'translateX(120%)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wrap.style.transition = 'transform .45s cubic-bezier(.2,.9,.3,1.05)';
        wrap.style.transform = '';
      }));
    }
  }

  function toggleFmenu() {
    const m = document.getElementById('fmenu');
    if (!m) return;
    m.classList.toggle('collapsed');
    try { localStorage.setItem(FMENU_KEY, m.classList.contains('collapsed') ? '1' : '0'); } catch(_) {}
  }
  window.toggleFmenu = toggleFmenu;

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
