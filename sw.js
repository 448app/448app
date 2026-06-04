/* sw.js — Service Worker (version 2)
   Strategy: Network-first with cache: 'reload'
   - ทุก request ดึงจาก network ก่อน (force bypass HTTP cache เลย)
   - ใช้ cache เฉพาะตอน offline (fallback)
   ผลคือ: page reload ปกติ = ได้ของใหม่จาก server ทุกครั้ง
   ไม่ต้องกด Ctrl+Shift+R เอง */
const SW_VERSION = 'v166-2026-05-29-retire-per-asset-fv';
const CACHE_NAME = 'aia-runtime-' + SW_VERSION;

self.addEventListener('install', (event) => {
  /* Activate ทันทีเมื่อมี SW ใหม่ — ไม่ต้องรอแท็บปิดเปิดใหม่ */
  self.skipWaiting();
});

/* รับข้อความ SKIP_WAITING จาก client (sidebar-scroll.js) — บังคับ activate
   ทันทีเมื่อ client ตรวจเจอเวอร์ชันใหม่ (สำหรับ iOS ที่ skipWaiting ไม่เด้งเอง) */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  /* ลบ cache เก่าทั้งหมดเมื่อ activate — กัน stale cache จาก SW เวอร์ชันก่อน
     และ claim() ให้ SW ใหม่ควบคุม clients ที่เปิดอยู่ทันที */
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  /* Skip: non-GET, cross-origin (Firebase, fonts.googleapis, cdnjs, etc.) */
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Network-first with cache: 'reload' — bypass HTTP cache ทั้งหมด
     ถ้า network ล่ม → fallback ไป cache (offline mode) */
  event.respondWith(
    fetch(req, { cache: 'reload' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
