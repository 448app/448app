/* storage-safe.js — Protect against silent QuotaExceededError on save
   ─────────────────────────────────────────────────────────────────
   Monkey-patches Storage.prototype.setItem so any localStorage.setItem
   anywhere in the app gets QuotaExceededError detection + a visible
   warning banner. Without this, save failures were silent — user kept
   working but nothing persisted.

   Public API (also exposed on window):
     window.getStorageUsage()  → { bytes, mb, percent, limitMb }
     window.formatStorageSize(bytes) → "3.2 MB"

   Loads everywhere via sidebar-scroll.js (25 app pages) + manually on
   login.html (the only standalone page that writes localStorage).
*/
(function () {
  if (window.__aiaStorageSafeLoaded) return;
  window.__aiaStorageSafeLoaded = true;

  /* Detect quota error across browser flavours. iOS Safari uses different
     name/code than Chromium. */
  function isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError'
        || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || e.code === 22 || e.code === 1014;
  }

  /* Throttle the warning banner — don't spam user if many setItem calls
     fail in a row (e.g. typing in an input that auto-saves) */
  let _lastBannerTs = 0;
  const BANNER_THROTTLE_MS = 30000;

  function showQuotaBanner(key) {
    const now = Date.now();
    if (now - _lastBannerTs < BANNER_THROTTLE_MS) return;
    _lastBannerTs = now;

    /* Build banner — fixed-position, dismissible */
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed; top: 14px; left: 50%;
      transform: translateX(-50%); z-index: 99998;
      background: linear-gradient(135deg, #B02030, #7A1620);
      color: white; padding: 12px 22px;
      border-radius: 12px; font-family: 'Sarabun', sans-serif;
      font-weight: 700; font-size: .92rem;
      box-shadow: 0 8px 24px rgba(0,0,0,.35);
      max-width: 560px; text-align: center;
      display: flex; align-items: center; gap: 12px;
    `;
    const isCritical = key === 'aia_users';
    banner.innerHTML = `
      <span style="font-size:1.3rem;">⚠️</span>
      <div style="flex:1; text-align:left; line-height:1.4;">
        <div><b>พื้นที่เก็บข้อมูลเต็ม</b> — ${isCritical ? 'บันทึกล่าสุดล้มเหลว' : 'บันทึกการตั้งค่าล้มเหลว'}</div>
        <div style="font-weight:500; font-size:.82rem; opacity:.92;">
          กรุณา Export ข้อมูลสำรอง + ลดรูปลูกค้าเก่า/ลบลูกค้าที่ไม่ใช้
        </div>
      </div>
      <button style="background:rgba(255,255,255,.18); color:white; border:none;
        padding:6px 12px; border-radius:6px; cursor:pointer; font-family:inherit;
        font-weight:700; font-size:.82rem;">ปิด</button>
    `;
    banner.querySelector('button').onclick = () => banner.remove();
    /* Auto-dismiss after 15 sec */
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);

    if (document.body) document.body.appendChild(banner);
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(banner), { once: true });

    /* Also console.error for devs */
    try { console.error('[storage-safe] QuotaExceededError on key:', key); } catch {}
  }

  /* aia_users = ข้อมูลลูกค้าทั้งหมด — เซฟ key นี้ไม่ผ่าน = วิกฤต (ข้อมูลหาย) */
  const CRITICAL_KEY = 'aia_users';

  /* Monkey-patch — wraps Storage.prototype.setItem so all
     localStorage.setItem calls anywhere get protected. */
  const _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    try {
      const result = _origSetItem.call(this, key, value);
      /* เซฟ aia_users สำเร็จ → refresh มาตรวัดพื้นที่ (debounced) */
      if (key === CRITICAL_KEY) scheduleGaugeRefresh();
      return result;
    } catch (e) {
      if (isQuotaError(e)) {
        /* ข้อมูลลูกค้าเซฟไม่ผ่าน = STOP-THE-WORLD → modal บล็อก (ปิดเองไม่ได้)
           key อื่น (settings) = banner เดิม (หายเองได้) */
        if (key === CRITICAL_KEY) showCriticalQuotaModal();
        else showQuotaBanner(key);
        /* Swallow — don't crash caller. Save silently fails but user
           is informed via modal/banner. Better than throwing in random places. */
        return;
      }
      throw e;
    }
  };

  /* ── Storage usage helpers (public API) ─────────────────────────── */
  /* iOS Safari + Chrome both cap localStorage around 5-10 MB per origin.
     Use 5 MB as the conservative limit for the progress UI. */
  const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

  window.getStorageUsage = function () {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        /* Char length × 2 ≈ UTF-16 bytes (rough but good enough for UI) */
        bytes += (k.length + v.length) * 2;
      }
    } catch {}
    const mb = bytes / 1024 / 1024;
    const percent = Math.min(100, (bytes / STORAGE_LIMIT_BYTES) * 100);
    return {
      bytes,
      mb: mb.toFixed(2),
      percent: percent.toFixed(1),
      limitMb: (STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0),
    };
  };

  window.formatStorageSize = function (bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  /* ── Photo compression helper ──────────────────────────────────────
     Tries WebP first (≈25-30% smaller than JPEG at equivalent quality);
     falls back to JPEG when the browser doesn't support WebP encoding.
     All modern browsers (Safari 14+, Chrome, Firefox, Edge) support WebP.

     Usage:
       const dataUrl = window.compressPhotoCanvas(canvas);          // q=0.82
       const dataUrl = window.compressPhotoCanvas(canvas, 0.75);    // lower q
  ─────────────────────────────────────────────────────────────────── */
  let _webpSupported = null;
  window.compressPhotoCanvas = function (canvas, quality) {
    const q = (quality == null) ? 0.82 : quality;
    /* One-time browser-capability probe */
    if (_webpSupported === null) {
      try {
        const probe = document.createElement('canvas');
        probe.width = 1; probe.height = 1;
        _webpSupported = probe.toDataURL('image/webp').indexOf('image/webp') === 5;
      } catch { _webpSupported = false; }
    }
    if (_webpSupported) {
      const url = canvas.toDataURL('image/webp', q);
      /* Defensive: if browser silently fell back to PNG (some old Safari), use JPEG */
      if (url.indexOf('image/webp') === 5) return url;
    }
    return canvas.toDataURL('image/jpeg', q);
  };

  /* ═══════════════════════════════════════════════════════════════════
     DATA-LOSS PROTECTION (ข้อ 1 + 2)
     1A persist()  · 1B critical modal · 2A gauge · 2B export reminder
  ═══════════════════════════════════════════════════════════════════ */

  /* ── 1A. ขอ persistent storage — กัน browser/iOS ITP ลบข้อมูลทิ้ง ───── */
  window.__aiaStoragePersisted = null;   /* null=ยังไม่รู้ true/false=ผลลัพธ์ */
  async function requestPersistentStorage() {
    try {
      if (!navigator.storage || !navigator.storage.persist) {
        window.__aiaStoragePersisted = false;   /* browser ไม่รองรับ */
        return;
      }
      /* ถ้า persistent อยู่แล้ว ไม่ต้องขอซ้ำ */
      if (navigator.storage.persisted) {
        const already = await navigator.storage.persisted();
        if (already) { window.__aiaStoragePersisted = true; return; }
      }
      const granted = await navigator.storage.persist();
      window.__aiaStoragePersisted = !!granted;
      try { localStorage.setItem('aia_storage_persisted', granted ? '1' : '0'); } catch (e) {}
    } catch (e) {
      window.__aiaStoragePersisted = false;
    }
  }

  /* ── ระดับการใช้พื้นที่ → สี ─────────────────────────────────────────── */
  function usageLevel(percent) {
    const p = parseFloat(percent) || 0;
    if (p > 85) return { color: '#DC3545', text: '#DC3545' };   /* แดง */
    if (p > 70) return { color: '#F5C242', text: '#A16207' };   /* เหลือง */
    return { color: '#16A34A', text: '#16A34A' };               /* เขียว */
  }

  /* ── 1B. Critical quota modal — บล็อกเต็มจอ ปิดเองไม่ได้ ─────────────── */
  let _criticalModalOpen = false;
  function showCriticalQuotaModal() {
    if (_criticalModalOpen) return;       /* กันซ้อน */
    _criticalModalOpen = true;
    const u = (typeof window.getStorageUsage === 'function') ? window.getStorageUsage() : null;
    const usageLine = u ? `ใช้ไป ${u.mb} MB จาก ${u.limitMb} MB (${u.percent}%)` : '';

    const overlay = document.createElement('div');
    overlay.id = 'aia-quota-modal';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(15,20,35,.72);
      display: flex; align-items: center; justify-content: center;
      padding: 22px; font-family: 'Sarabun', sans-serif;
      backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    `;
    overlay.innerHTML = `
      <div style="background:#fff; border-radius:18px; max-width:440px; width:100%;
                  box-shadow:0 24px 70px rgba(0,0,0,.4); overflow:hidden;">
        <div style="background:linear-gradient(135deg,#B02030,#7A1620); color:#fff;
                    padding:20px 24px; text-align:center;">
          <div style="font-size:2.4rem; line-height:1;">⚠️</div>
          <div style="font-size:1.18rem; font-weight:800; margin-top:8px;">พื้นที่เก็บข้อมูลเต็ม</div>
          <div style="font-size:.86rem; opacity:.92; margin-top:3px;">การบันทึกล่าสุด <b>ไม่สำเร็จ</b></div>
        </div>
        <div style="padding:20px 24px 22px;">
          <div style="font-size:.92rem; color:#333; line-height:1.55;">
            ข้อมูลที่เพิ่งแก้ไข <b style="color:#B02030;">ยังไม่ถูกบันทึก</b>
            เพราะพื้นที่เครื่องเต็ม กรุณา <b>สำรองข้อมูลเดี๋ยวนี้</b>
            แล้วลบรูป/ลูกค้าเก่าที่ไม่ใช้เพื่อให้มีที่ว่าง
          </div>
          ${usageLine ? `<div style="font-size:.8rem; color:#888; margin-top:10px;">📦 ${usageLine}</div>` : ''}
          <div style="display:flex; flex-direction:column; gap:10px; margin-top:18px;">
            <button id="aia-quota-export" style="
              background:#1F2D4F; color:#fff; border:none; border-radius:10px;
              padding:13px; font-family:inherit; font-weight:800; font-size:1rem;
              cursor:pointer;">💾 สำรองข้อมูลเดี๋ยวนี้</button>
            <button id="aia-quota-manage" style="
              background:#F0F2F7; color:#1F2D4F; border:none; border-radius:10px;
              padding:11px; font-family:inherit; font-weight:700; font-size:.92rem;
              cursor:pointer;">🗑 จัดการพื้นที่ (รายชื่อลูกค้า)</button>
            <button id="aia-quota-dismiss" style="
              background:transparent; color:#999; border:none;
              padding:6px; font-family:inherit; font-weight:600; font-size:.84rem;
              cursor:pointer;">รับทราบ · ปิดหน้าต่างนี้</button>
          </div>
        </div>
      </div>
    `;
    const mount = () => document.body.appendChild(overlay);
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });

    const close = () => { overlay.remove(); _criticalModalOpen = false; };
    overlay.addEventListener('click', (e) => {
      const id = e.target && e.target.id;
      if (id === 'aia-quota-export') {
        if (typeof window.exportData === 'function') window.exportData();
        else location.href = 'dashboard.html';
        close();
      } else if (id === 'aia-quota-manage') {
        location.href = 'clients.html';
      } else if (id === 'aia-quota-dismiss') {
        close();
      }
      /* คลิกพื้นหลัง = ไม่ปิด (บล็อกจริง — ต้องเลือกปุ่ม) */
    });
    try { console.error('[storage-safe] CRITICAL quota — aia_users save failed'); } catch (e) {}
  }
  window.showCriticalQuotaModal = showCriticalQuotaModal;

  /* ── 2A. Storage gauge — มาตรวัด % ใน sidebar (เห็นทุกหน้า) ──────────── */
  function injectGaugeStyles() {
    if (document.getElementById('aia-sg-styles')) return;
    const st = document.createElement('style');
    st.id = 'aia-sg-styles';
    st.textContent = `
      .aia-sg {
        margin: 0 0 10px; padding: 9px 11px;
        background: #F4F6FA; border: 1px solid #E3E7EF;
        border-radius: 10px; cursor: pointer;
        font-family: 'Sarabun', sans-serif;
        transition: background .15s, border-color .15s;
      }
      .aia-sg:hover { background: #ECEFF6; border-color: #D3DAE8; }
      .aia-sg-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; }
      .aia-sg-lbl { font-size:.74rem; font-weight:700; color:#667085; }
      .aia-sg-pct { font-size:.74rem; font-weight:800; }
      .aia-sg-bar { height:5px; background:#E3E7EF; border-radius:50px; overflow:hidden; }
      .aia-sg-fill { height:100%; width:0%; border-radius:50px; transition: width .4s, background .3s; }
      .aia-sg-sub { font-size:.66rem; color:#98A2B3; margin-top:4px; }
    `;
    document.head.appendChild(st);
  }

  function injectStorageGauge() {
    const sb = document.querySelector('.app-sidebar');
    if (!sb) return;                                   /* login.html ไม่มี sidebar */
    if (document.getElementById('aia-storage-gauge')) return;
    injectGaugeStyles();
    const gauge = document.createElement('div');
    gauge.id = 'aia-storage-gauge';
    gauge.className = 'aia-sg';
    gauge.title = 'พื้นที่เก็บข้อมูล — คลิกเพื่อสำรองข้อมูล';
    gauge.innerHTML = `
      <div class="aia-sg-top">
        <span class="aia-sg-lbl">💾 พื้นที่เก็บข้อมูล</span>
        <span class="aia-sg-pct" id="aia-sg-pct">—%</span>
      </div>
      <div class="aia-sg-bar"><div class="aia-sg-fill" id="aia-sg-fill"></div></div>
      <div class="aia-sg-sub" id="aia-sg-sub">— / — MB</div>
    `;
    gauge.addEventListener('click', () => { location.href = 'dashboard.html'; });
    /* วางบนสุดของ .sb-bottom-area (เหนือ profile row) ถ้าไม่มีก็ต่อท้าย sidebar */
    const bottom = sb.querySelector('.sb-bottom-area');
    if (bottom) bottom.insertBefore(gauge, bottom.firstChild);
    else sb.appendChild(gauge);
    refreshStorageGauge();
  }

  function refreshStorageGauge() {
    if (typeof window.getStorageUsage !== 'function') return;
    const pctEl  = document.getElementById('aia-sg-pct');
    const fillEl = document.getElementById('aia-sg-fill');
    const subEl  = document.getElementById('aia-sg-sub');
    if (!pctEl || !fillEl || !subEl) return;
    const u = window.getStorageUsage();
    const lvl = usageLevel(u.percent);
    pctEl.textContent = u.percent + '%';
    pctEl.style.color = lvl.text;
    fillEl.style.width = Math.min(100, parseFloat(u.percent)) + '%';
    fillEl.style.background = lvl.color;
    subEl.textContent = u.mb + ' / ' + u.limitMb + ' MB';
  }
  window.refreshStorageGauge = refreshStorageGauge;

  /* debounce — live-save พิมพ์ทีละตัวจะเรียกถี่มาก รอ 500ms ค่อย refresh */
  let _gaugeTimer = null;
  function scheduleGaugeRefresh() {
    if (_gaugeTimer) clearTimeout(_gaugeTimer);
    _gaugeTimer = setTimeout(() => { _gaugeTimer = null; refreshStorageGauge(); }, 500);
  }

  /* ── 2B. Export reminder — เตือนถ้านานไม่ได้สำรอง (once/session) ──────── */
  function showExportReminderBanner(msg) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed; top: 14px; left: 50%;
      transform: translateX(-50%); z-index: 99990;
      background: linear-gradient(135deg, #C9912E, #A8741F);
      color: white; padding: 12px 18px;
      border-radius: 12px; font-family: 'Sarabun', sans-serif;
      font-weight: 700; font-size: .9rem;
      box-shadow: 0 8px 24px rgba(0,0,0,.32);
      max-width: 540px; width: calc(100% - 28px);
      display: flex; align-items: center; gap: 12px;
    `;
    banner.innerHTML = `
      <span style="font-size:1.3rem;">📥</span>
      <div style="flex:1; text-align:left; line-height:1.4;">
        <div><b>เตือนสำรองข้อมูล</b></div>
        <div style="font-weight:500; font-size:.82rem; opacity:.95;">${msg}</div>
      </div>
      <button data-act="export" style="background:#fff; color:#A8741F; border:none;
        padding:8px 14px; border-radius:8px; cursor:pointer; font-family:inherit;
        font-weight:800; font-size:.82rem; white-space:nowrap;">สำรองเลย</button>
      <button data-act="close" style="background:rgba(255,255,255,.22); color:#fff; border:none;
        padding:8px 10px; border-radius:8px; cursor:pointer; font-family:inherit;
        font-weight:700; font-size:.82rem;">ภายหลัง</button>
    `;
    banner.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset && e.target.dataset.act;
      if (act === 'export') {
        banner.remove();
        if (typeof window.exportData === 'function') window.exportData();
        else location.href = 'dashboard.html';
      } else if (act === 'close') {
        banner.remove();
      }
    });
    const mount = () => document.body.appendChild(banner);
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  function checkExportReminder() {
    /* เฉพาะหน้าแอป (มี sidebar) + ล็อกอินแล้ว + แสดงครั้งเดียว/session */
    if (!document.querySelector('.app-sidebar')) return;
    if (sessionStorage.getItem('aia_export_reminder_shown')) return;
    const uid = localStorage.getItem('aia_currentUser');
    if (!uid) return;
    let users;
    try { users = JSON.parse(localStorage.getItem('aia_users') || '[]'); } catch (e) { return; }
    const u = users.find(x => x.id === uid);
    if (!u || !u.data || !Array.isArray(u.data.clients)) return;
    const clientCount = u.data.clients.length;
    if (clientCount === 0) return;                 /* ไม่มีข้อมูลให้หาย */

    const lastExport = localStorage.getItem('aia_last_export');
    const curSig  = (localStorage.getItem('aia_users') || '').length;
    const lastSig = Number(localStorage.getItem('aia_last_export_sig') || 0);
    const changed = curSig !== lastSig;

    let msg = null;
    if (!lastExport) {
      msg = `ยังไม่เคยสำรองข้อมูล — มี ${clientCount} ลูกค้าเสี่ยงหายถ้าเครื่องมีปัญหา`;
    } else {
      const days = Math.floor((Date.now() - new Date(lastExport).getTime()) / 86400000);
      if (days >= 14) {
        msg = `ไม่ได้สำรองข้อมูล ${days} วันแล้ว — แนะนำ Export`;
      } else if (days >= 7 && changed) {
        msg = `ไม่ได้สำรอง ${days} วัน และมีการแก้ไขใหม่ — แนะนำ Export`;
      }
    }
    if (!msg) return;
    sessionStorage.setItem('aia_export_reminder_shown', '1');
    /* หน่วงนิดให้หน้าโหลดเสร็จก่อน แล้วค่อยเด้ง */
    setTimeout(() => showExportReminderBanner(msg), 1400);
  }
  window.checkExportReminder = checkExportReminder;

  /* ── Self-init ──────────────────────────────────────────────────────── */
  function initStorageProtection() {
    requestPersistentStorage();      /* 1A */
    injectStorageGauge();            /* 2A */
    checkExportReminder();           /* 2B */
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStorageProtection);
  } else {
    initStorageProtection();
  }
})();
