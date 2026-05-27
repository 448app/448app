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
  function injectFmenuStyles() {
    if (document.getElementById('fmenu-styles')) return;
    const style = document.createElement('style');
    style.id = 'fmenu-styles';
    style.textContent = `
      /* ════════════════════════════════════════════════
         FMENU — Topbar-integrated mode (default)
         Inject into .app-topbar-right OR .feature-hero-row
      ═══════════════════════════════════════════════ */
      .fm-topbar {
        display: inline-flex; align-items: center;
        gap: 4px; flex-shrink: 0;
        font-family: 'Sarabun', sans-serif;
      }
      .fm-sep {
        width: 1px; height: 26px;
        background: rgba(0,0,0,.12);
        margin: 0 6px;
      }
      .fm-tb-btn {
        width: 40px; height: 40px;
        border-radius: 10px;
        background: #F0F2F5;
        color: #1F2D4F;
        border: none; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        transition: all .18s cubic-bezier(.2,.9,.3,1.05);
        position: relative;
        font-family: inherit;
        padding: 0;
      }
      .fm-tb-btn:hover {
        background: #1F2D4F; color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(31,45,79,.25);
      }
      .fm-tb-btn.active {
        background: linear-gradient(135deg, #1F2D4F, #2C3E61);
        color: white;
        box-shadow: 0 3px 8px rgba(31,45,79,.25);
      }
      .fm-tb-btn.fm-tb-exit { color: #B02030; }
      .fm-tb-btn.fm-tb-exit:hover { background: #B02030; color: white; }
      .fm-tb-btn svg { width: 20px; height: 20px; }

      /* ── On dark hero (.feature-hero-row) ── */
      .fm-topbar.on-hero .fm-sep {
        background: rgba(255,255,255,.25);
      }
      .fm-topbar.on-hero .fm-tb-btn {
        background: rgba(255,255,255,.15);
        color: white;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,.2);
      }
      .fm-topbar.on-hero .fm-tb-btn:hover {
        background: rgba(255,255,255,.95);
        color: #1F2D4F;
      }
      .fm-topbar.on-hero .fm-tb-btn.active {
        background: rgba(201,169,97,.85);
        color: #1F2D4F;
        border-color: #C9A961;
      }
      .fm-topbar.on-hero .fm-tb-btn.fm-tb-exit { color: #FFB4B8; }
      .fm-topbar.on-hero .fm-tb-btn.fm-tb-exit:hover {
        background: #B02030; color: white;
        border-color: transparent;
      }

      /* ── Mobile ── */
      @media (max-width: 600px) {
        .fm-tb-btn { width: 36px; height: 36px; border-radius: 9px; }
        .fm-tb-btn svg { width: 18px; height: 18px; }
        .fm-sep { height: 22px; margin: 0 4px; }
      }

      /* ── Hero-row layout fix when fmenu is injected ──
         Default .feature-hero-row uses space-between which would
         spread title + client-pick + fmenu evenly. We want
         client-pick + fmenu to cluster on the right. */
      .feature-hero-row.has-fmenu {
        justify-content: flex-start;
      }
      .feature-hero-row.has-fmenu > :first-child {
        flex: 1; min-width: 0;
      }

      /* ════════════════════════════════════════════════
         FALLBACK — Floating (bottom-right) when no topbar
         Used on pages like pyramid.html that have custom hero
      ═══════════════════════════════════════════════ */
      .fm-topbar.fallback {
        position: fixed; right: 16px;
        bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        z-index: 9000;
        background: white;
        border-radius: 14px;
        padding: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        border: 1px solid #E5E7EB;
      }
    `;
    document.head.appendChild(style);
  }

  function injectFmenu() {
    if (document.getElementById('fmenu')) return;

    /* Determine active state */
    const path = (location.pathname || '').toLowerCase();
    const isTimeline = path.endsWith('timeline.html');
    const isPyramid  = path.endsWith('pyramid.html');

    /* SVG icons fallback to emoji */
    const ico = (name, emoji) => {
      if (window.IconLib && window.IconLib.getIcon) {
        const svg = window.IconLib.getIcon(name, { size: 20 });
        if (svg) return svg;
      }
      return emoji;
    };

    /* Find target host:
       1) .app-topbar-right (dashboard, clients, profile) — light context
       2) .feature-hero-row (most planning pages) — dark hero context
       3) Fallback: floating bottom-right */
    const topbarRight = document.querySelector('.app-topbar-right');
    const heroRow     = document.querySelector('.feature-hero-row');
    const onHero      = !!heroRow && !topbarRight;

    const wrap = document.createElement('div');
    wrap.id = 'fmenu';
    wrap.className = 'fm-topbar' + (onHero ? ' on-hero' : '');
    wrap.innerHTML = `
      <div class="fm-sep"></div>
      <button class="fm-tb-btn ${isTimeline ? 'active' : ''}"
              onclick="location.href='timeline.html'"
              title="Timeline">${ico('map', '🗺️')}</button>
      <button class="fm-tb-btn ${isPyramid ? 'active' : ''}"
              onclick="location.href='pyramid.html'"
              title="Pyramid (สามเหลี่ยมการเงิน)">${ico('pyramid', '🔺')}</button>
      <button class="fm-tb-btn fm-tb-exit"
              onclick="location.href='dashboard.html'"
              title="กลับหน้าแรก">${ico('exit', '🚪')}</button>
    `;

    if (topbarRight) {
      topbarRight.appendChild(wrap);
    } else if (heroRow) {
      heroRow.classList.add('has-fmenu');
      heroRow.appendChild(wrap);
    } else {
      /* Fallback: float at bottom-right */
      wrap.classList.add('fallback');
      /* Remove sep in fallback (looks weird floating) */
      const sep = wrap.querySelector('.fm-sep');
      if (sep) sep.remove();
      document.body.appendChild(wrap);
    }
  }

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
