/* idb-images.js — เก็บรูปภาพใน IndexedDB (แทน base64 ใน localStorage)
   ─────────────────────────────────────────────────────────────────
   ทำไม: localStorage เพดาน ~5MB และเก็บรูปเป็น base64 (บวม +33%)
   IndexedDB เพดานหลายร้อย MB–GB + เก็บ Blob (binary จริง) + async ไม่ค้าง UI

   โมเดล: localStorage เก็บแค่ "id" ของรูป (เช่น "img_xxx")
          IndexedDB เก็บ bytes รูปจริง (Blob)
   รองรับ backward-compat: ค่าที่เป็น "data:..." (รูปเก่าแบบ inline) ยังใช้ได้

   Public API (window.IMG):
     IMG.putDataURL(dataUrl) → Promise<id>           เก็บรูป คืน id
     IMG.getURL(id)          → Promise<objectURL|null> object URL (cache)
     IMG.getDataURL(id)      → Promise<dataURL|null>  base64 (สำหรับ report/export)
     IMG.remove(id)          → Promise<void>          ลบรูป
     IMG.isRef(s)            → bool                    s เป็น id รูปหรือไม่
     IMG.exportMap(ids)      → Promise<{id:dataURL}>   รวมรูปสำหรับ export
     IMG.importMap(map)      → Promise<void>           กู้รูปจาก backup
*/
(function () {
  if (window.IMG) return;

  const DB_NAME = 'aia_images';
  const STORE   = 'images';
  const DB_VER  = 1;
  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _dbPromise;
  }

  function store(mode) {
    return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE));
  }
  function reqP(r) {
    return new Promise((res, rej) => {
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  function genId() {
    return 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }
  function isRef(s) {
    return typeof s === 'string' && s.indexOf('img_') === 0;
  }

  /* dataURL ↔ Blob */
  function dataURLtoBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const head  = dataUrl.slice(0, comma);
    const body  = dataUrl.slice(comma + 1);
    const mime  = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const isB64 = head.indexOf('base64') !== -1;
    const bin   = isB64 ? atob(body) : decodeURIComponent(body);
    const len   = bin.length;
    const arr   = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload  = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  /* object-URL cache (id → blob: URL) — กันสร้างซ้ำ + revoke ตอนลบ */
  const _urlCache = {};

  async function putDataURL(dataUrl) {
    const id   = genId();
    const blob = dataURLtoBlob(dataUrl);
    const st   = await store('readwrite');
    await reqP(st.put({ id, blob }));
    return id;
  }
  async function getBlob(id) {
    const st  = await store('readonly');
    const rec = await reqP(st.get(id));
    return rec ? rec.blob : null;
  }
  async function getURL(id) {
    if (_urlCache[id]) return _urlCache[id];
    const blob = await getBlob(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    _urlCache[id] = url;
    return url;
  }
  async function getDataURL(id) {
    const blob = await getBlob(id);
    if (!blob) return null;
    return blobToDataURL(blob);
  }
  async function remove(id) {
    if (_urlCache[id]) {
      try { URL.revokeObjectURL(_urlCache[id]); } catch (e) {}
      delete _urlCache[id];
    }
    const st = await store('readwrite');
    await reqP(st.delete(id));
  }

  /* Export: รวมรูปตาม ids → { id: dataURL } (ใส่ในไฟล์ backup) */
  async function exportMap(ids) {
    const out = {};
    for (const id of (ids || [])) {
      if (!isRef(id)) continue;
      try {
        const d = await getDataURL(id);
        if (d) out[id] = d;
      } catch (e) { /* skip รูปที่อ่านไม่ได้ */ }
    }
    return out;
  }
  /* Import: กู้รูปจาก { id: dataURL } เข้า IndexedDB (ตอน restore backup) */
  async function importMap(map) {
    if (!map) return;
    const st = await store('readwrite');
    for (const id of Object.keys(map)) {
      try {
        const blob = dataURLtoBlob(map[id]);
        await reqP(st.put({ id, blob }));
      } catch (e) { /* skip รูปเสีย */ }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     RESOLVER LAYER — ให้ render site ใช้ id ได้โดยแก้น้อยที่สุด
     - tag(ref, attrs): สร้าง <img> — รูป data: ใส่ src ตรง; id ที่ยังไม่ warm
       ใส่ data-imgref (observer patch ทีหลัง ไม่ยิง fetch)
     - setBg(el, ref): set background-image — id → resolve async
     - patchPending(): หา <img data-imgref> ใน DOM → resolve → set src
     - MutationObserver: auto-patch <img data-imgref> ที่เพิ่งถูกเพิ่ม
     - warm(ids): prefetch object URL ของ id เข้า cache (sync lookup ได้หลัง warm)
  ═══════════════════════════════════════════════════════════════════ */
  function srcOf(ref) {
    if (!ref) return '';
    if (ref.indexOf('data:') === 0) return ref;
    if (isRef(ref)) return _urlCache[ref] || '';
    return ref;
  }
  function tag(ref, attrs) {
    attrs = attrs || '';
    if (!ref) return '<img ' + attrs + '>';
    if (ref.indexOf('data:') === 0) return '<img src="' + ref + '" ' + attrs + '>';
    if (isRef(ref)) {
      const c = _urlCache[ref];
      return c ? '<img src="' + c + '" ' + attrs + '>'
               : '<img data-imgref="' + ref + '" ' + attrs + '>';
    }
    return '<img src="' + ref + '" ' + attrs + '>';
  }
  function setBg(el, ref) {
    if (!el) return;
    if (!ref) { el.style.backgroundImage = ''; return; }
    if (ref.indexOf('data:') === 0) { el.style.backgroundImage = "url('" + ref + "')"; return; }
    if (isRef(ref)) {
      const c = _urlCache[ref];
      if (c) { el.style.backgroundImage = "url('" + c + "')"; return; }
      getURL(ref).then(u => { if (u) el.style.backgroundImage = "url('" + u + "')"; }).catch(() => {});
      return;
    }
    el.style.backgroundImage = "url('" + ref + "')";
  }
  function patchOne(im) {
    const ref = im.getAttribute('data-imgref');
    if (!ref) return;
    im.removeAttribute('data-imgref');
    if (!isRef(ref)) return;
    getURL(ref).then(u => { if (u) im.src = u; }).catch(() => {});
  }
  function patchPending(root, deep) {
    const scope = (root && root.querySelectorAll) ? root : document;
    scope.querySelectorAll('img[data-imgref]').forEach(patchOne);
    if (deep) {
      /* safety net: <img src="img_xxx"> ที่ render site ไหนยังไม่ผ่าน tag() */
      scope.querySelectorAll('img').forEach(im => {
        const raw = im.getAttribute('src');
        if (isRef(raw)) getURL(raw).then(u => { if (u) im.src = u; }).catch(() => {});
      });
    }
  }
  async function warm(ids) {
    for (const id of (ids || [])) {
      if (isRef(id) && !_urlCache[id]) { try { await getURL(id); } catch (e) {} }
    }
  }
  /* MutationObserver — auto-patch <img data-imgref> ที่เพิ่งถูก inject */
  function startObserver() {
    if (!window.MutationObserver) return;
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!n || n.nodeType !== 1) continue;
          if (n.matches && n.matches('img[data-imgref]')) patchOne(n);
          else if (n.querySelectorAll) patchPending(n);
        }
      }
    });
    const go = () => { try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {} };
    if (document.body) go();
    else document.addEventListener('DOMContentLoaded', go, { once: true });
  }
  startObserver();

  window.IMG = {
    putDataURL, getBlob, getURL, getDataURL, remove,
    isRef, exportMap, importMap, genId,
    srcOf, tag, setBg, patchPending, warm,
  };
})();
