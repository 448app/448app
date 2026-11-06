/* drive-config.js — ตั้งค่าการสำรองข้อมูลกับ Google Drive ของตัวแทนแต่ละคน (ดู drive-sync.js)
   ─────────────────────────────────────────────────────────────────
   enabled : true = เปิดใช้ (ต้องตั้งค่า Google Cloud ก่อน: เปิด Google Drive API + เพิ่ม scope drive.appdata ในหน้าขอความยินยอม)
             false = ปิดไว้ แอปทำงานเหมือนเดิม (เก็บในเครื่องอย่างเดียว) ไม่แสดงปุ่ม/ชิปใด ๆ
   clientId: OAuth 2.0 Client ID (Web) ของโปรเจกต์ Firebase/Google Cloud เดียวกับที่ใช้ล็อกอิน
             ดูได้ที่ Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration → Web client ID
             หรือ Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs (Web client)
             ใช้ขอสิทธิ์เข้า Drive ได้กับทุกบัญชี (รวมคนที่ล็อกอินด้วยอีเมล+รหัสผ่าน) · ถ้าเว้นว่าง จะขอสิทธิ์ผ่านการล็อกอิน Google ซ้ำแทน
   แก้ไฟล์นี้แล้ว push ตามปกติ (Client ID เป็นค่าสาธารณะ ใส่ในโค้ดได้) */
window.AIA_DRIVE = {
  enabled: false,
  clientId: '',
};
