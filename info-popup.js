/* info-popup.js — Shared click-to-open info popup
   ─────────────────────────────────────────────────
   Replaces CSS hover/focus tooltips and native title="" attributes
   (broken UX on touch devices). Auto-injects CSS + modal on load.

   Usage:
     <script src="info-popup.js"></script>
     <button class="info-pop-trigger" onclick="openInfoPopup('Title','Body','💎')">i</button>

   Global API:
     openInfoPopup(title, body, icon)  — show popup
     closeInfoPopup()                  — hide popup

   Backdrop click + Esc key + close button all dismiss.
*/
(function () {
  if (window.__infoPopupReady) return;
  window.__infoPopupReady = true;

  /* ── Inject CSS ── */
  const css = `
    .info-pop-overlay {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5);
      z-index: 9999; align-items: center; justify-content: center; padding: 20px;
    }
    .info-pop-overlay.open { display: flex; }
    .info-pop-card {
      background: #fff; border-radius: 16px; padding: 22px 26px;
      width: 100%; max-width: 520px;
      max-height: 85vh; overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.28);
      animation: info-pop-in .18s ease-out;
      font-family: 'Sarabun', sans-serif;
    }
    .info-pop-card.wide { max-width: 640px; }
    @keyframes info-pop-in {
      from { transform: translateY(8px) scale(.96); opacity: 0; }
      to   { transform: translateY(0) scale(1); opacity: 1; }
    }
    .info-pop-head {
      display: flex; align-items: center; gap: 12px;
      padding-bottom: 12px; border-bottom: 1.5px solid #C0C8D6;
      margin-bottom: 14px;
    }
    .info-pop-icon-big {
      width: 40px; height: 40px; border-radius: 10px;
      background: #F0F2F7; color: #0F1A2F;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.3rem; flex-shrink: 0;
    }
    .info-pop-head h3 {
      flex: 1; font-size: 1.1rem; font-weight: 800;
      color: #0F1A2F; margin: 0;
    }
    .info-pop-close {
      width: 30px; height: 30px; border-radius: 50%;
      background: #F3F4F6; border: none; cursor: pointer;
      font-size: .95rem; color: #4B5563; flex-shrink: 0;
      transition: all .15s;
    }
    .info-pop-close:hover { background: #E5E7EB; color: #222; }
    .info-pop-body {
      font-size: .92rem; line-height: 1.55; color: #333;
      white-space: pre-wrap;
    }
    /* When body contains HTML (table/list), disable pre-wrap */
    .info-pop-body.html-mode { white-space: normal; }
    .info-pop-body.html-mode p { margin: 0 0 10px; }
    .info-pop-body.html-mode ul { margin: 0 0 10px; padding-left: 20px; }
    .info-pop-body.html-mode li { margin-bottom: 4px; }
    .info-pop-body.html-mode table {
      width: 100%; border-collapse: collapse;
      font-size: .85rem; margin: 8px 0 10px;
    }
    .info-pop-body.html-mode th {
      background: #0F1A2F; color: #fff;
      padding: 7px 8px; text-align: left;
      font-weight: 700; font-size: .82rem;
    }
    .info-pop-body.html-mode th.center, .info-pop-body.html-mode td.center { text-align: center; }
    .info-pop-body.html-mode td {
      padding: 6px 8px; border-bottom: 1px solid #E5E7EB;
      vertical-align: top;
    }
    .info-pop-body.html-mode tr:nth-child(even) td { background: #F9FAFB; }
    .info-pop-body.html-mode .yes  { color: #16A34A; font-weight: 700; }
    .info-pop-body.html-mode .no   { color: #9CA3AF; }
    .info-pop-body.html-mode .note {
      font-size: .82rem; color: #6B7280;
      margin-top: 10px; padding: 8px 10px;
      background: #F0F2F7; border-radius: 6px;
      border-left: 3px solid #0F1A2F;
    }
    /* Trigger button (drop-in for inline ⓘ icons) */
    .info-pop-trigger {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%;
      background: #F0F2F7; color: #0F1A2F;
      font-size: .72rem; font-weight: 700; cursor: pointer;
      font-family: serif; font-style: italic;
      border: none; padding: 0;
      transition: all .15s;
      vertical-align: middle;
    }
    .info-pop-trigger:hover, .info-pop-trigger:focus {
      background: #0F1A2F; color: #fff;
      transform: scale(1.1); outline: none;
    }
  `;
  const style = document.createElement('style');
  style.id = 'info-popup-style';
  style.textContent = css;
  document.head.appendChild(style);

  /* ── Inject modal HTML on DOMContentLoaded ── */
  function inject() {
    if (document.getElementById('info-pop-modal')) return;
    const wrap = document.createElement('div');
    wrap.className = 'info-pop-overlay';
    wrap.id = 'info-pop-modal';
    wrap.innerHTML = `
      <div class="info-pop-card" role="dialog" aria-modal="true" aria-labelledby="info-pop-title">
        <div class="info-pop-head">
          <div class="info-pop-icon-big" id="info-pop-icon">💎</div>
          <h3 id="info-pop-title">รายละเอียด</h3>
          <button class="info-pop-close" aria-label="ปิด" type="button">✕</button>
        </div>
        <div class="info-pop-body" id="info-pop-body"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    /* Wire close events */
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeInfoPopup(); });
    wrap.querySelector('.info-pop-close').addEventListener('click', closeInfoPopup);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  /* ── Esc closes popup ── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('info-pop-modal')?.classList.contains('open')) {
      closeInfoPopup();
    }
  });

  /* ── Global API ──
     openInfoPopup(title, body, icon)            — plain text (white-space:pre-wrap)
     openInfoPopup(title, body, icon, opts)
       opts = { html: true }                     — body is HTML (table/list allowed)
       opts = { wide: true }                     — wider card (640px) for tables
   */
  window.openInfoPopup = function (title, body, icon, opts) {
    if (!document.getElementById('info-pop-modal')) inject();
    const m       = document.getElementById('info-pop-modal');
    const card    = m.querySelector('.info-pop-card');
    const bodyEl  = document.getElementById('info-pop-body');
    document.getElementById('info-pop-title').textContent = title || 'รายละเอียด';
    document.getElementById('info-pop-icon').textContent  = icon  || '💎';
    opts = opts || {};
    if (opts.html) {
      bodyEl.classList.add('html-mode');
      bodyEl.innerHTML = body || '';
    } else {
      bodyEl.classList.remove('html-mode');
      bodyEl.textContent = body || '';
    }
    card.classList.toggle('wide', !!opts.wide);
    m.classList.add('open');
    /* Scroll body back to top each time popup opens */
    card.scrollTop = 0;
  };
  window.closeInfoPopup = function () {
    const m = document.getElementById('info-pop-modal');
    if (m) m.classList.remove('open');
  };
})();
