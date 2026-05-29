/* analytics.js — Google Analytics 4 / Firebase Analytics page-view tracking
   ────────────────────────────────────────────────────────────────────────
   ใส่ measurementId ของคุณที่ตัวแปร MEASUREMENT_ID ด้านล่าง (ที่เดียว)

   วิธีหา measurementId:
     1. เข้า Firebase Console → project app-d83ab
     2. ⚙️ Project settings → แท็บ Integrations → Google Analytics → Enable
        (ถ้ายังไม่ได้เปิด — เชื่อม GA4 property ให้เรียบร้อย)
     3. Project settings → General → เลื่อนลงหา "Your apps" → Web app
        → คัดลอกค่า measurementId รูปแบบ G-XXXXXXXXXX
     4. วางแทน 'G-XXXXXXXXXX' ด้านล่าง

   ข้อมูลจะไปโผล่ที่ Firebase Console → Analytics (และ Google Analytics)
   — นับผู้เข้าชม / page views / sessions / ประเทศ / อุปกรณ์ / real-time
*/
(function () {
  var MEASUREMENT_ID = 'G-XXXXXXXXXX';   /* ← แก้ตรงนี้ที่เดียว */

  /* กันโหลดซ้ำ (บางหน้าอาจได้ทั้ง <script> ตรงๆ และ inject จาก sidebar-scroll.js) */
  if (window.__aiaAnalyticsLoaded) return;
  window.__aiaAnalyticsLoaded = true;

  /* ยังไม่ตั้งค่า measurementId → ไม่ทำอะไร (ปลอดภัย) */
  if (!MEASUREMENT_ID || MEASUREMENT_ID === 'G-XXXXXXXXXX') return;

  /* ข้ามตอนเปิดไฟล์ผ่าน file:// (double-click) — GA ต้องการ http/https */
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return;

  /* โหลด gtag.js แบบ async */
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  /* page_view ถูกส่งอัตโนมัติเมื่อ config — ตั้ง anonymize_ip เพื่อความเป็นส่วนตัว */
  gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
})();
