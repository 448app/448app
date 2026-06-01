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

  /* Monkey-patch — wraps Storage.prototype.setItem so all
     localStorage.setItem calls anywhere get protected. */
  const _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    try {
      return _origSetItem.call(this, key, value);
    } catch (e) {
      if (isQuotaError(e)) {
        showQuotaBanner(key);
        /* Swallow — don't crash caller. Save silently fails but user
           is informed via banner. Better than throwing in random places. */
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
})();
