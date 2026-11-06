/* drive-sync.js — สำรองและซิงก์ข้อมูลกับ Google Drive ของตัวแทนแต่ละคน (ระยะที่ 2)
   ─────────────────────────────────────────────────────────────────
   เก็บที่ไหน  โฟลเดอร์ซ่อนของแอปใน Google Drive ของผู้ใช้เอง (appDataFolder — สิทธิ์ drive.appdata
              แอปเห็นเฉพาะไฟล์ของตัวเอง ไม่เห็นไฟล์อื่นใน Drive · หน่วย/แอดมินไม่เห็นข้อมูล)
   ไฟล์       448app-<uid>.json = ข้อมูลของผู้ใช้คนนั้น (user / profile / data) รูปแบบเดียวกับไฟล์ Export
              + syncMeta { rev, stamps: {ลูกค้า: เวลาแก้ล่าสุด}, deleted: {ลูกค้า: เวลาลบ} } สำหรับรวมรายลูกค้า
              รูปภาพ (client.photo / profile.photo / รูปใน planner) = ไฟล์แยก ชื่อเดียวกับ id ใน IndexedDB (img_…)
   ทำงานอย่างไร
     • ทุกครั้งที่ aia_users ถูกเขียน → ติด "มีงานค้าง" + บันทึกเวลาแก้รายลูกค้า (เทียบ hash) → ส่งขึ้น Drive หลังหยุดแก้ 6 วินาที
     • ตอนเปิดหน้า/ทุก 3 นาที/กลับมาเปิดแท็บ เทียบเลขรุ่น (rev) บน Drive กับรุ่นที่เครื่องนี้ซิงก์ล่าสุด
         เครื่องใหม่ว่าง + Drive มีข้อมูล                 → กู้คืนให้ทันที (ข้อมูล + รูป)
         Drive ใหม่กว่า + เครื่องนี้ไม่มีงานค้าง             → โหลดทับตอนเปิดหน้า (กลางคันจะขึ้นชิปให้กดโหลด)
         Drive ใหม่กว่า + เครื่องนี้มีงานค้าง                → รวมรายลูกค้า: ลูกค้าแต่ละคนใช้ของฝั่งที่แก้ล่าสุด · ลบตามฝั่งที่ลบล่าสุด
                                                            · นัดหมาย/งาน/โปรไฟล์ ใช้ของฝั่งที่แก้ล่าสุด แล้วส่งผลรวมขึ้น Drive
         เครื่องที่ไม่เคยซิงก์แต่มีข้อมูล + Drive มีข้อมูล      → ถามผู้ใช้ (รวม / ใช้ของเครื่องนี้ / ใช้ของ Drive)
     • สิทธิ์เข้า Drive (token) อายุประมาณ 1 ชั่วโมง และ Google ให้ขอใหม่ได้เฉพาะเมื่อผู้ใช้กดเอง
       (แอปไม่มีเซิร์ฟเวอร์เก็บ refresh token) → หมดอายุแล้วมีงานค้าง ชิปในแถบเมนูจะขึ้น "กดเพื่อเชื่อมต่อ"
   ตั้งค่า     drive-config.js (enabled · clientId · images) · ขั้นตอน Google Cloud อยู่ในคู่มือตั้งค่า
   ทดสอบ      tests.html กลุ่ม "Google Drive (จำลอง)" ใช้ transport ปลอม · ของจริงทดสอบหลังตั้งค่า Cloud
   กติกา       ไม่แตะข้อมูลของผู้ใช้คนอื่นบนเครื่องเดียวกัน · ทับข้อมูลเครื่องที่มีข้อมูลโดยไม่ถามได้เฉพาะกรณีที่พิสูจน์ได้ว่าเครื่องนี้ไม่มีงานค้าง
*/
(function () {
  if (window.DriveSync) return;

  const CFG = Object.assign({ enabled: false, clientId: '', images: true }, window.AIA_DRIVE || {});
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const TOKEN_KEY = 'aia_drive_token';          /* sessionStorage: { token, email, exp } */
  const HINT_KEY = 'aia_drive_hint';            /* localStorage: อีเมล Google ที่ใช้เก็บข้อมูล */
  const STATE_PREFIX = 'aia_drive_state_';      /* localStorage ต่อผู้ใช้: สถานะการซิงก์ของเครื่องนี้ */
  const MSG_KEY = 'aia_drive_msg';              /* sessionStorage: ข้อความแสดงหลังเปิดหน้าใหม่ */
  const DEBOUNCE_MS = 6000, OBSERVE_MS = 800, CHECK_EVERY_MS = 3 * 60 * 1000;
  const APP_TAG = '448app', FORMAT = 2, TOMBSTONE_DAYS = 90, IMG_BATCH = 25;

  /* ═══════════════ ผู้ใช้ / ข้อมูลในเครื่อง ═══════════════ */
  const uidNow = () => localStorage.getItem('aia_currentUser') || '';
  const fileName = uid => APP_TAG + '-' + uid + '.json';
  const nowIso = () => new Date().toISOString();
  function readUsers() { try { return JSON.parse(localStorage.getItem('aia_users') || '[]'); } catch (e) { return []; } }
  function currentUser() { return readUsers().find(u => u.id === uidNow()) || null; }
  function clientCount(u) { return ((u && u.data && u.data.clients) || []).length; }

  const DEFAULT_STATE = { fileId: null, baseRev: 0, baseAt: null, lastSyncAt: null, dirtySince: null, dirtySeq: 0, device: null, paused: false,
                          seen: {}, seenOther: '', stamps: {}, deleted: {}, lastChangeAt: null, imgSyncAt: null };
  function loadState() {
    try { return Object.assign({}, DEFAULT_STATE, JSON.parse(localStorage.getItem(STATE_PREFIX + uidNow()) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULT_STATE); }
  }
  function saveState(s) { if (uidNow()) localStorage.setItem(STATE_PREFIX + uidNow(), JSON.stringify(s)); }
  function deviceId() {
    const s = loadState();
    if (!s.device) { s.device = 'dev_' + Math.random().toString(36).slice(2, 10); saveState(s); }
    return s.device;
  }

  /* ═══════════════ ติดตามการเปลี่ยนแปลงรายลูกค้า (เวลาแก้ล่าสุด / เวลาลบ) ═══════════════ */
  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + str.length; }
  function clientHashes(u) {
    const m = {};
    ((u && u.data && u.data.clients) || []).forEach(c => { if (c && c.id) m[c.id] = hash(JSON.stringify(c)); });
    return m;
  }
  function otherHash(u) {
    if (!u) return '';
    const d = Object.assign({}, u.data || {}); delete d.clients;
    return hash(JSON.stringify({ profile: u.profile || null, firstName: u.firstName, lastName: u.lastName, data: d }));
  }
  /* เทียบกับที่เห็นครั้งก่อน: ลูกค้าที่ hash เปลี่ยน → stamps[id] = ตอนนี้ · หายไป → deleted[id] = ตอนนี้ */
  function observe() {
    const u = currentUser();
    if (!u) return null;
    const st = loadState(), now = nowIso();
    const cur = clientHashes(u), seen = st.seen || {};
    st.stamps = st.stamps || {}; st.deleted = st.deleted || {};
    let changed = false;
    Object.keys(cur).forEach(id => {
      if (seen[id] !== cur[id]) { st.stamps[id] = now; changed = true; }
      if (st.deleted[id]) delete st.deleted[id];
    });
    Object.keys(seen).forEach(id => { if (!cur[id]) { st.deleted[id] = now; delete st.stamps[id]; changed = true; } });
    const oh = otherHash(u);
    if (oh !== st.seenOther) { changed = true; st.seenOther = oh; }
    if (changed) st.lastChangeAt = now;
    st.seen = cur;
    /* ตัดรายการลบที่เก่ากว่า 90 วัน */
    const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
    Object.keys(st.deleted).forEach(id => { if (st.deleted[id] < cutoff) delete st.deleted[id]; });
    saveState(st);
    return st;
  }
  /* หลังรับข้อมูลจาก Drive (ทั้งก้อนหรือผลรวม) ให้ถือว่าเห็นสถานะนี้แล้ว — ไม่นับเป็นงานค้าง */
  function markSeen(stamps, deleted) {
    const st = loadState(), u = currentUser();
    st.seen = clientHashes(u); st.seenOther = otherHash(u);
    st.stamps = stamps || {}; st.deleted = deleted || {};
    st.dirtySince = null; st.dirtySeq = 0;
    saveState(st);
  }

  /* สิ่งที่ส่งขึ้น Drive — รูปแบบเดียวกับไฟล์ Export ในหน้าแรก (นำไฟล์ไป Import ด้วยมือได้) */
  function buildPayload(rev) {
    const u = currentUser();
    if (!u) return null;
    const st = loadState();
    return {
      exportedAt: nowIso(),
      exportedBy: ((u.firstName || '') + ' ' + (u.lastName || '')).trim(),
      appVersion: '2.5',
      source: 'drive-sync',
      format: FORMAT,
      user: { firstName: u.firstName || '', lastName: u.lastName || '', email: u.email || '', createdAt: u.createdAt || null },
      profile: u.profile || null,
      data: u.data || { clients: [] },
      syncMeta: { rev, uid: u.id, device: deviceId(), at: nowIso(), lastChangeAt: st.lastChangeAt || null, stamps: st.stamps || {}, deleted: st.deleted || {} },
    };
  }
  /* ทับข้อมูลของผู้ใช้ปัจจุบันในเครื่องด้วย payload (ไม่แตะผู้ใช้คนอื่นบนเครื่องเดียวกัน) */
  let _applying = false;
  function applyPayload(payload) {
    if (!payload || !payload.data || !Array.isArray(payload.data.clients)) throw new DriveError('bad_payload');
    const all = readUsers(), id = uidNow();
    let i = all.findIndex(u => u.id === id);
    if (i === -1) { all.push({ id, firstName: '', lastName: '', email: '', createdAt: nowIso(), profile: {}, data: { clients: [] } }); i = all.length - 1; }
    all[i].data = payload.data;
    if (payload.profile) all[i].profile = payload.profile;
    if (payload.user) {
      if (payload.user.firstName) all[i].firstName = payload.user.firstName;
      if (payload.user.lastName)  all[i].lastName  = payload.user.lastName;
    }
    _applying = true;
    try { localStorage.setItem('aia_users', JSON.stringify(all)); } finally { _applying = false; }
  }

  /* ═══════════════ รวมข้อมูลสองฝั่ง (ฟังก์ชันล้วน ทดสอบได้) ═══════════════
     local = { u, stamps, deleted, lastChangeAt } · remote = payload จาก Drive (format 1 หรือ 2)
     ลูกค้า: ฝั่งที่แก้ล่าสุดชนะ (เท่ากัน → เครื่องนี้) · ลบชนะเมื่อเวลาลบใหม่กว่าเวลาแก้ของอีกฝั่ง
     ไฟล์รุ่นเก่าไม่มี stamps → ใช้เวลาของไฟล์แทน · ลูกค้าในเครื่องที่ไม่มี stamp → ถือว่าเก่า (0)
     ข้อมูลอื่น (นัดหมาย/งาน/กิจกรรม/โปรไฟล์): ฝั่งที่แก้ล่าสุดชนะทั้งชุด */
  function mergeData(local, remote) {
    const u = local.u;
    const meta = remote.syncMeta || {};
    const rs = meta.stamps || {}, rd = meta.deleted || {};
    const rAt = meta.at || remote.exportedAt || '';
    const ls = local.stamps || {}, ld = local.deleted || {};
    const L = {}, R = {};
    ((u.data && u.data.clients) || []).forEach(c => { if (c && c.id) L[c.id] = c; });
    ((remote.data && remote.data.clients) || []).forEach(c => { if (c && c.id) R[c.id] = c; });
    const order = Object.keys(L).concat(Object.keys(R).filter(id => !L[id]));
    const merged = [], mStamps = {}, mDeleted = {};
    const stats = { fromLocal: 0, fromRemote: 0, added: 0, removed: 0, same: 0 };
    Object.keys(rd).forEach(id => { mDeleted[id] = rd[id]; });
    Object.keys(ld).forEach(id => { if (!mDeleted[id] || ld[id] > mDeleted[id]) mDeleted[id] = ld[id]; });
    order.forEach(id => {
      const l = L[id], r = R[id];
      const lt = ls[id] || '', rt = r ? (rs[id] || rAt) : '';
      const ldt = ld[id] || '', rdt = rd[id] || '';
      if (l && r) {
        if (JSON.stringify(l) === JSON.stringify(r)) { merged.push(l); mStamps[id] = lt > rt ? lt : rt; stats.same++; }
        else if (lt >= rt) { merged.push(l); mStamps[id] = lt; stats.fromLocal++; }
        else { merged.push(r); mStamps[id] = rt; stats.fromRemote++; }
        delete mDeleted[id];
      } else if (l && !r) {
        if (rdt && rdt >= lt) { stats.removed++; mDeleted[id] = rdt; }
        else { merged.push(l); mStamps[id] = lt; delete mDeleted[id]; }
      } else if (!l && r) {
        if (ldt && ldt >= rt) { mDeleted[id] = ldt; }
        else { merged.push(r); mStamps[id] = rt; stats.added++; delete mDeleted[id]; }
      }
    });
    const localNewer = (local.lastChangeAt || '') >= rAt;
    const baseData = localNewer ? (u.data || {}) : (remote.data || {});
    const data = Object.assign({}, baseData, { clients: merged });
    const profile = localNewer ? (u.profile || remote.profile || null) : (remote.profile || u.profile || null);
    const user = localNewer || !remote.user
      ? { firstName: u.firstName || '', lastName: u.lastName || '', email: u.email || '', createdAt: u.createdAt || null }
      : remote.user;
    return { data, profile, user, stamps: mStamps, deleted: mDeleted, stats, localNewer };
  }

  /* ═══════════════ สิทธิ์เข้า Drive (token) ═══════════════ */
  class DriveError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; } }
  function readToken() {
    try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); return (t && t.token && t.exp > Date.now() + 30000) ? t : null; }
    catch (e) { return null; }
  }
  function saveToken(token, email, ttlSec) {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, email: email || '', exp: Date.now() + Math.max(120, (ttlSec || 3500) - 60) * 1000 }));
    if (email) localStorage.setItem(HINT_KEY, email);
  }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }
  function fbAuthInst() { try { return (window.firebase && firebase.apps && firebase.apps.length) ? firebase.auth() : null; } catch (e) { return null; } }
  function hasGoogleProvider() {
    const a = fbAuthInst(), u = a && a.currentUser;
    return !!(u && (u.providerData || []).some(p => p && p.providerId === 'google.com'));
  }
  /* Google Identity Services — ใช้ได้กับทุกบัญชี ต้องมี clientId · เปิดหน้าต่าง Google (ต้องมาจากการกดของผู้ใช้) */
  let _gisLoading = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (_gisLoading) return _gisLoading;
    _gisLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { _gisLoading = null; rej(new DriveError('gis_load_failed')); };
      document.head.appendChild(s);
    });
    return _gisLoading;
  }
  function gisToken() {
    return loadGis().then(() => new Promise((resolve, reject) => {
      const hint = localStorage.getItem(HINT_KEY) || '';
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CFG.clientId, scope: SCOPE, prompt: '',
        callback: resp => {
          if (resp && resp.access_token) { saveToken(resp.access_token, hint, Number(resp.expires_in) || 3500); resolve(resp.access_token); }
          else reject(new DriveError('gis_' + ((resp && resp.error) || 'unknown'), resp && resp.error_description));
        },
        error_callback: err => reject(new DriveError('gis_' + ((err && err.type) || 'error'), err && err.message)),
      });
      const req = { prompt: '' };
      if (hint) req.hint = hint;
      client.requestAccessToken(req);
    }));
  }
  /* ทางเลือกเมื่อไม่มี clientId — ล็อกอิน Google ซ้ำผ่าน Firebase พร้อมขอสิทธิ์ Drive (เฉพาะบัญชีที่ล็อกอินด้วย Google) */
  async function firebaseToken() {
    const a = fbAuthInst();
    if (!a || !a.currentUser) throw new DriveError('no_firebase_user');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope(SCOPE);
    const hint = localStorage.getItem(HINT_KEY) || a.currentUser.email || '';
    if (hint) provider.setCustomParameters({ login_hint: hint });
    const cred = await a.currentUser.reauthenticateWithPopup(provider);
    const tok = cred && cred.credential && cred.credential.accessToken;
    if (!tok) throw new DriveError('no_token');
    saveToken(tok, (cred.user && cred.user.email) || hint, 3500);
    return tok;
  }
  async function requestTokenInteractive() {
    if (CFG.clientId) return gisToken();
    if (hasGoogleProvider()) return firebaseToken();
    throw new DriveError('no_client_id');
  }

  /* ═══════════════ Drive REST (เปลี่ยนเป็นของปลอมได้ตอนทดสอบ) ═══════════════ */
  async function api(url, opts) {
    const t = readToken();
    if (!t) throw new DriveError('no_token');
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({ Authorization: 'Bearer ' + t.token }, o.headers || {});
    const res = await fetch(url, o);
    if (res.status === 401) { clearToken(); throw new DriveError('unauthorized'); }
    if (!res.ok) { let txt = ''; try { txt = await res.text(); } catch (e) {} throw new DriveError('http_' + res.status, txt.slice(0, 400)); }
    return res;
  }
  /* อัปโหลดแบบ resumable (ไม่จำกัดขนาด · body เป็นข้อความหรือ Blob) — อ่าน Location ไม่ได้ (CORS) → multipart (ราว 5 MB) */
  async function uploadAny(id, name, body, mime, props) {
    const meta = id ? { appProperties: props } : { name, parents: ['appDataFolder'], appProperties: props };
    const base = `${UPLOAD}/files${id ? '/' + encodeURIComponent(id) : ''}`;
    const method = id ? 'PATCH' : 'POST';
    const init = await api(base + '?uploadType=resumable', {
      method, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime }, body: JSON.stringify(meta),
    });
    const loc = init.headers.get('Location') || init.headers.get('location');
    if (loc) {
      const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': mime }, body });
      if (!put.ok) throw new DriveError('upload_' + put.status, (await put.text()).slice(0, 400));
      return put.json();
    }
    const boundary = 'aia' + Date.now().toString(36);
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const mp = new Blob([head, body, tail]);
    const r = await api(base + '?uploadType=multipart', { method, headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: mp });
    return r.json();
  }
  const realTransport = {
    /* หาไฟล์ข้อมูลของผู้ใช้ — อ่านแค่ metadata (เลขรุ่น/เวลา) ไม่ต้องดาวน์โหลด */
    find: async name => {
      const q = encodeURIComponent("name = '" + name.replace(/'/g, "\\'") + "' and trashed = false");
      const r = await api(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size,appProperties)&pageSize=5`);
      const j = await r.json();
      const f = (j.files || [])[0];
      return f ? { id: f.id, modifiedTime: f.modifiedTime, size: Number(f.size || 0), props: f.appProperties || {} } : null;
    },
    download: async id => (await api(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text(),
    upload: (id, name, content, props) => uploadAny(id, name, content, 'application/json', props),
    /* รูป: รายชื่อไฟล์ img_… ทั้งหมด { name: { id, size } } · อัปโหลด/ดาวน์โหลดเป็น Blob */
    listImages: async () => {
      const out = {};
      let token = '';
      do {
        const q = encodeURIComponent("name contains 'img_' and trashed = false");
        const r = await api(`${API}/files?spaces=appDataFolder&q=${q}&fields=nextPageToken,files(id,name,size)&pageSize=1000${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
        const j = await r.json();
        (j.files || []).forEach(f => { out[f.name] = { id: f.id, size: Number(f.size || 0) }; });
        token = j.nextPageToken || '';
      } while (token);
      return out;
    },
    uploadBlob: (name, blob, props) => uploadAny(null, name, blob, blob.type || 'image/jpeg', props),
    downloadBlob: async id => (await api(`${API}/files/${encodeURIComponent(id)}?alt=media`)).blob(),
  };
  let transport = realTransport;

  /* ═══════════════ สถานะ ═══════════════ */
  let _status = { state: CFG.enabled ? 'idle' : 'off', msg: '', remote: null, localCount: 0, at: null };
  let _busy = false, _timer = null, _obsTimer = null, _suspended = false, _imgProgress = null;
  const listeners = [];
  function setStatus(state, extra) {
    _status = Object.assign({ state, msg: '', remote: null, localCount: clientCount(currentUser()), at: new Date() }, extra || {});
    listeners.forEach(fn => { try { fn(_status); } catch (e) {} });
    renderAll();
  }
  function errorText(e) {
    const code = (e && e.code) || '';
    const detail = (e && e.detail) || '';
    if (code === 'no_client_id') return 'ยังไม่ได้ตั้งค่า Client ID ใน drive-config.js — บัญชีที่ไม่ได้ล็อกอินด้วย Google ต้องใช้ค่านี้';
    if (code === 'no_firebase_user') return 'ยังไม่ได้ล็อกอิน';
    if (code === 'unauthorized' || code === 'no_token') return 'สิทธิ์เข้า Drive หมดอายุ — กดเชื่อมต่อใหม่';
    if (/accessNotConfigured|has not been used|is disabled/i.test(detail)) return 'ยังไม่ได้เปิด Google Drive API ในโปรเจกต์ Google Cloud (ดูคู่มือตั้งค่า)';
    if (/insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(detail)) return 'สิทธิ์ที่ได้ไม่ครอบคลุม Drive — กดเชื่อมต่อใหม่แล้วอนุญาตการเข้าถึงข้อมูลของแอป';
    if (/gis_popup/.test(code)) return 'เบราว์เซอร์บล็อกหน้าต่าง Google — อนุญาต popup แล้วลองใหม่';
    if (code === 'gis_access_denied') return 'ไม่ได้อนุญาตให้เข้าถึง Drive';
    if (code === 'gis_load_failed') return 'โหลดสคริปต์ของ Google ไม่ได้ (ไม่มีเน็ต?)';
    if (code === 'bad_payload') return 'ไฟล์บน Drive ไม่ใช่รูปแบบของแอปนี้';
    if (/^(http|upload)_/.test(code)) return 'Drive ตอบกลับ ' + code.replace(/^\w+_/, '') + (detail ? ' · ' + detail.slice(0, 120) : '');
    if (e && e.message && /fetch|network/i.test(e.message)) return 'ติดต่อ Google Drive ไม่ได้ (ตรวจอินเทอร์เน็ต)';
    return (e && (e.message || String(e))) || 'ไม่ทราบสาเหตุ';
  }

  /* ติด "มีงานค้าง" ทุกครั้งที่ข้อมูลลูกค้าถูกเขียน (ครอบ setItem ต่อจาก storage-safe.js) */
  function markDirty() {
    if (!uidNow()) return;
    const st = loadState();
    st.dirtySince = st.dirtySince || nowIso();
    st.dirtySeq = (st.dirtySeq || 0) + 1;
    saveState(st);
    clearTimeout(_obsTimer);
    _obsTimer = setTimeout(() => { try { observe(); } catch (e) {} }, OBSERVE_MS);
    if (!CFG.enabled || st.paused || _suspended) return;
    setStatus(readToken() ? 'queued' : 'pending');
    clearTimeout(_timer);
    _timer = setTimeout(() => sync({ reason: 'change' }), DEBOUNCE_MS);
  }
  const _prevSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    const r = _prevSetItem.call(this, k, v);
    if (k === 'aia_users' && !_applying && this === window.localStorage) { try { markDirty(); } catch (e) {} }
    return r;
  };

  /* ตัดสินใจจากสถานะทั้งสองฝั่ง — ฟังก์ชันล้วนให้ทดสอบได้ */
  function decide(st, remote, localCount) {
    const remoteRev = remote ? (parseInt(remote.props && remote.props.rev, 10) || 0) : 0;
    const remoteClients = remote ? (parseInt(remote.props && remote.props.clients, 10) || 0) : 0;
    const dirty = !!st.dirtySince;
    const neverSynced = !st.fileId && !st.lastSyncAt;
    if (!remote) return { action: (localCount > 0 || dirty) ? 'upload' : 'none', remoteRev };
    if (neverSynced) {
      if (localCount === 0) return { action: 'download', remoteRev };
      if (remoteClients === 0 && remoteRev <= 1) return { action: 'upload', remoteRev };
      return { action: 'conflict', remoteRev };
    }
    const remoteNewer = remoteRev > (st.baseRev || 0);
    if (remoteNewer && !dirty) return { action: 'download', remoteRev };
    if (remoteNewer && dirty) return { action: 'merge', remoteRev };
    if (dirty) return { action: 'upload', remoteRev };
    return { action: 'none', remoteRev };
  }

  async function doUpload(remote, remoteRev) {
    observe();
    const u = currentUser();
    const st = loadState();
    const newRev = Math.max(remoteRev || 0, st.baseRev || 0) + 1;
    const seqAtStart = st.dirtySeq || 0;
    const payload = buildPayload(newRev);
    if (!payload) throw new DriveError('no_user');
    const content = JSON.stringify(payload);
    const props = { app: APP_TAG, rev: String(newRev), at: payload.syncMeta.at, device: payload.syncMeta.device, clients: String(clientCount(u)), format: String(FORMAT) };
    const file = await transport.upload(remote ? remote.id : null, fileName(uidNow()), content, props);
    const st2 = loadState();
    st2.fileId = (file && file.id) || (remote && remote.id) || st2.fileId;
    st2.baseRev = newRev; st2.baseAt = props.at; st2.lastSyncAt = nowIso();
    if ((st2.dirtySeq || 0) === seqAtStart) { st2.dirtySince = null; st2.dirtySeq = 0; }   /* แก้เพิ่มระหว่างส่ง → ยังค้าง ส่งรอบหน้า */
    saveState(st2);
    return { rev: newRev, size: content.length };
  }
  async function fetchRemotePayload(remote) {
    const text = await transport.download(remote.id);
    const payload = JSON.parse(text);
    if (!payload || !payload.data || !Array.isArray(payload.data.clients)) throw new DriveError('bad_payload');
    return payload;
  }
  async function doDownload(remote, remoteRev, opts) {
    const payload = await fetchRemotePayload(remote);
    applyPayload(payload);
    const meta = payload.syncMeta || {};
    markSeen(meta.stamps || {}, meta.deleted || {});
    const st = loadState();
    st.fileId = remote.id; st.baseRev = remoteRev; st.baseAt = (remote.props && remote.props.at) || remote.modifiedTime || null;
    st.lastSyncAt = nowIso(); st.lastChangeAt = meta.lastChangeAt || st.lastChangeAt;
    saveState(st);
    const n = clientCount(currentUser());
    if (!opts || opts.reload !== false) {
      sessionStorage.setItem(MSG_KEY, '☁️ โหลดข้อมูลล่าสุดจาก Google Drive แล้ว (' + n + ' ลูกค้า)');
      reloadOnce();
    }
    return { rev: remoteRev, clients: n };
  }
  /* รวมสองฝั่งแล้วส่งผลรวมขึ้น Drive — เครื่องนี้ได้ผลรวมด้วย */
  async function doMerge(remote, remoteRev, opts) {
    observe();
    const payload = await fetchRemotePayload(remote);
    const st = loadState();
    const m = mergeData({ u: currentUser(), stamps: st.stamps, deleted: st.deleted, lastChangeAt: st.lastChangeAt }, payload);
    applyPayload({ data: m.data, profile: m.profile, user: m.user });
    markSeen(m.stamps, m.deleted);
    const st2 = loadState(); st2.fileId = remote.id; st2.baseRev = remoteRev; st2.dirtySince = nowIso(); st2.dirtySeq = 1; saveState(st2);
    const r = await doUpload(remote, remoteRev);
    const s = m.stats;
    const summary = [s.fromRemote ? 'อัปเดตจากเครื่องอื่น ' + s.fromRemote : '', s.added ? 'เพิ่ม ' + s.added : '', s.removed ? 'ลบ ' + s.removed : '', s.fromLocal ? 'ของเครื่องนี้ ' + s.fromLocal : ''].filter(Boolean).join(' · ');
    if ((s.fromRemote || s.added || s.removed) && (!opts || opts.reload !== false)) {
      sessionStorage.setItem(MSG_KEY, '☁️ รวมข้อมูลกับ Drive แล้ว (' + summary + ')');
      if (opts && opts.reason === 'load') reloadOnce();
      else toast('☁️ รวมข้อมูลจากเครื่องอื่นแล้ว (' + summary + ') — หน้านี้อาจต้องเปิดใหม่เพื่อเห็นข้อมูลล่าสุด');
      sessionStorage.removeItem(MSG_KEY);
    }
    return { rev: r.rev, stats: s, summary };
  }
  function reloadOnce() {
    const K = 'aia_drive_reload_ts';
    const last = Number(sessionStorage.getItem(K) || 0);
    if (Date.now() - last < 15000) return;       /* กัน reload วน */
    sessionStorage.setItem(K, String(Date.now()));
    setTimeout(() => location.reload(), 150);
  }

  /* ═══════════════ รูปภาพ (ไฟล์แยกใน appDataFolder ชื่อ = id ใน IndexedDB) ═══════════════ */
  function collectRefs(u) {
    const out = new Set();
    const isRef = s => typeof s === 'string' && s.indexOf('img_') === 0;
    if (!u) return out;
    if (u.profile && isRef(u.profile.photo)) out.add(u.profile.photo);
    ((u.data && u.data.clients) || []).forEach(c => {
      if (isRef(c.photo)) out.add(c.photo);
      (c.planTemplates || []).forEach(p => (Array.isArray(p.images) ? p.images : []).forEach(r => { if (isRef(r)) out.add(r); }));
    });
    return out;
  }
  async function syncImages() {
    if (CFG.images === false || !window.IMG || !readToken()) return { total: 0, skipped: true };
    const refs = Array.from(collectRefs(currentUser()));
    if (!refs.length) return { total: 0 };
    const idx = await transport.listImages();
    const toUpload = [], toDownload = [];
    for (const r of refs) {
      let have = false;
      try { have = await window.IMG.has(r); } catch (e) {}
      if (have && !idx[r]) toUpload.push(r);
      else if (!have && idx[r]) toDownload.push(r);
    }
    const total = Math.min(toUpload.length, IMG_BATCH) + Math.min(toDownload.length, IMG_BATCH);
    if (!total) { const st = loadState(); st.imgSyncAt = nowIso(); saveState(st); return { total: 0, uploaded: 0, downloaded: 0 }; }
    let done = 0, uploaded = 0, downloaded = 0;
    const progress = () => { _imgProgress = { done, total }; renderAll(); };
    progress();
    for (const r of toUpload.slice(0, IMG_BATCH)) {
      const blob = await window.IMG.getBlob(r);
      if (blob) { await transport.uploadBlob(r, blob, { app: APP_TAG, kind: 'img', uid: uidNow() }); uploaded++; }
      done++; progress();
    }
    for (const r of toDownload.slice(0, IMG_BATCH)) {
      const blob = await transport.downloadBlob(idx[r].id);
      if (blob) { await window.IMG.putBlob(r, blob); downloaded++; }
      done++; progress();
    }
    _imgProgress = null;
    const st = loadState(); st.imgSyncAt = nowIso(); saveState(st);
    if (downloaded && typeof window.warmAppImages === 'function') { try { window.warmAppImages(); } catch (e) {} }
    return { total, uploaded, downloaded, pendingUpload: Math.max(toUpload.length - IMG_BATCH, 0), pendingDownload: Math.max(toDownload.length - IMG_BATCH, 0) };
  }

  /* sync(opts): reason 'load' | 'change' | 'periodic' | 'visible' | 'connect' | 'manual'
     interactive = ขอสิทธิ์ผ่านหน้าต่าง Google ได้ (ต้องเรียกจากการกดของผู้ใช้) · apply = โหลดทับได้แม้ไม่ใช่ตอนเปิดหน้า
     force = ทำงานแม้ปิดใช้/หยุดชั่วคราว (ใช้ตอนทดสอบ) · reload=false ไม่เปิดหน้าใหม่หลังโหลดทับ (ทดสอบ) · images=false ข้ามรูป */
  async function sync(opts) {
    opts = opts || {};
    if (!uidNow()) return null;
    if (!opts.force && (!CFG.enabled || _suspended)) return null;
    const st0 = loadState();
    if (st0.paused && !opts.force) { setStatus('paused'); return null; }
    if (_busy) return null;
    _busy = true;
    try {
      if (!readToken()) {
        if (opts.interactive) await requestTokenInteractive();
        else { setStatus(st0.dirtySince ? 'pending' : 'noauth'); return null; }
      }
      setStatus('syncing');
      observe();
      const remote = await transport.find(fileName(uidNow()));
      const localCount = clientCount(currentUser());
      const d = decide(loadState(), remote, localCount);
      const canApply = opts.reason === 'load' || opts.reason === 'connect' || opts.apply === true;
      let result;
      if (d.action === 'upload') {
        const r = await doUpload(remote, d.remoteRev);
        result = { action: 'upload', rev: r.rev };
      } else if (d.action === 'download') {
        if (!canApply) { setStatus('remoteNewer', { remote }); return { action: 'remoteNewer' }; }
        const r = await doDownload(remote, d.remoteRev, opts);
        result = { action: 'download', rev: r.rev };
      } else if (d.action === 'merge') {
        const r = await doMerge(remote, d.remoteRev, opts);
        result = { action: 'merge', rev: r.rev, stats: r.stats };
      } else if (d.action === 'conflict') {
        setStatus('conflict', { remote, localCount });
        return { action: 'conflict' };
      } else {
        const st2 = loadState(); st2.lastSyncAt = nowIso(); if (remote && !st2.fileId) st2.fileId = remote.id; saveState(st2);
        result = { action: 'none' };
      }
      /* รูปภาพ — หลังข้อมูลเสร็จ (ไม่ขวางข้อมูล · ข้ามเมื่อทดสอบ images:false) */
      if (opts.images !== false) {
        try { result.images = await syncImages(); }
        catch (e) { result.images = { error: errorText(e) }; }
      }
      setStatus('ok', { detail: result.action === 'upload' ? 'ส่งขึ้น Drive แล้ว (รุ่น ' + result.rev + ')' : result.action === 'merge' ? 'รวมข้อมูลแล้ว' : '' });
      return result;
    } catch (e) {
      setStatus('error', { msg: errorText(e), code: e && e.code });
      return { action: 'error', error: e };
    } finally { _busy = false; _imgProgress = null; }
  }
  /* ผู้ใช้เลือกเมื่อเครื่องที่ไม่เคยซิงก์มีข้อมูลชนกับ Drive: 'merge' = รวม · 'local' = ส่งของเครื่องนี้ทับ · 'remote' = โหลดของ Drive ทับ */
  async function resolveConflict(choice, opts) {
    opts = opts || {};
    if (_busy) return null;
    _busy = true;
    try {
      if (!readToken()) await requestTokenInteractive();
      setStatus('syncing');
      const remote = await transport.find(fileName(uidNow()));
      const remoteRev = remote ? (parseInt(remote.props && remote.props.rev, 10) || 0) : 0;
      let r = null;
      if (choice === 'merge' && remote) { observe(); r = await doMerge(remote, remoteRev, opts); setStatus('ok', { detail: 'รวมข้อมูลแล้ว' }); }
      else if (choice === 'local') { r = await doUpload(remote, remoteRev); setStatus('ok', { detail: 'ใช้ของเครื่องนี้ ส่งขึ้น Drive แล้ว (รุ่น ' + r.rev + ')' }); }
      else if (choice === 'remote' && remote) { r = await doDownload(remote, remoteRev, opts); setStatus('ok', { detail: 'ใช้ของ Drive แล้ว' }); }
      else { setStatus('conflict', { remote }); return null; }
      if (opts.images !== false) { try { await syncImages(); } catch (e) {} }
      return r;
    } catch (e) { setStatus('error', { msg: errorText(e), code: e && e.code }); return null; }
    finally { _busy = false; _imgProgress = null; }
  }
  /* ปุ่มในหน้าต่าง: เชื่อมต่อ/ซิงก์เดี๋ยวนี้ (จากการกดของผู้ใช้ จึงขอสิทธิ์ได้) */
  function connect() { return sync({ reason: 'connect', interactive: true, force: CFG.enabled }); }
  async function pushNow() { markDirty(); clearTimeout(_timer); return sync({ reason: 'manual', interactive: true }); }
  async function restoreFromDrive() {
    if (!confirm('โหลดข้อมูลจาก Google Drive มาทับข้อมูลของผู้ใช้นี้บนเครื่องนี้ใช่ไหม?\n(ถ้าเครื่องนี้มีข้อมูลที่ยังไม่ได้ส่งขึ้น จะหายไป — กด Export เก็บไว้ก่อนได้)')) return null;
    return resolveConflict('remote');
  }
  function pause(on) { const st = loadState(); st.paused = !!on; saveState(st); setStatus(on ? 'paused' : (st.dirtySince ? 'pending' : 'idle')); if (!on) sync({ reason: 'manual' }); }

  /* ═══════════════ หน้าจอ: ชิปในแถบเมนู · แผงรายละเอียด · แถบในหน้าแรก ═══════════════ */
  function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function fmtWhen(iso) { try { return new Date(iso).toLocaleString('th-TH-u-ca-gregory', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } }
  function chipText() {
    const st = loadState(), s = _status.state;
    if (s === 'off') return null;
    if (s === 'paused') return ['⏸', 'หยุดซิงก์ Drive ไว้ — กดเพื่อเปิด', 'warn'];
    if (s === 'syncing') return ['☁️', _imgProgress ? 'กำลังซิงก์รูป ' + _imgProgress.done + '/' + _imgProgress.total : 'กำลังซิงก์กับ Google Drive…', ''];
    if (s === 'queued') return ['☁️', 'จะส่งขึ้น Drive ในไม่กี่วินาที', ''];
    if (s === 'pending') return ['☁️', 'มีข้อมูลรอส่งขึ้น Drive — กดเพื่อเชื่อมต่อ', 'warn'];
    if (s === 'noauth') return ['☁️', st.lastSyncAt ? 'Drive ซิงก์ล่าสุด ' + fmtWhen(st.lastSyncAt) + ' — กดเพื่อเชื่อมต่อ' : 'เชื่อมต่อ Google Drive เพื่อสำรองข้อมูล', st.lastSyncAt ? '' : 'warn'];
    if (s === 'remoteNewer') return ['⬇', 'มีข้อมูลใหม่บน Drive — กดเพื่อโหลด', 'warn'];
    if (s === 'conflict') return ['⚠', 'ข้อมูลไม่ตรงกับ Drive — กดเพื่อเลือก', 'err'];
    if (s === 'error') return ['⚠', 'Drive: ' + (_status.msg || 'มีปัญหา') + ' — กดดู', 'err'];
    if (s === 'ok') return ['☁️', 'Drive ซิงก์แล้ว ' + fmtTime(st.lastSyncAt || nowIso()), 'ok'];
    return ['☁️', st.lastSyncAt ? 'Drive ซิงก์ล่าสุด ' + fmtWhen(st.lastSyncAt) : 'Google Drive', ''];
  }
  function injectStyles() {
    if (document.getElementById('drive-sync-styles')) return;
    const s = document.createElement('style');
    s.id = 'drive-sync-styles';
    s.textContent = `
      .drive-chip{margin:8px 16px 14px;padding:7px 10px;border-radius:10px;border:1px solid #E4E7F0;background:#F8F9FC;color:#39436B;font:600 .74rem 'Sarabun',sans-serif;text-align:left;cursor:pointer;display:flex;gap:8px;align-items:center;line-height:1.35;width:calc(100% - 32px);box-sizing:border-box}
      .drive-chip:hover{border-color:#2E4CA6;color:#2E4CA6}
      .drive-chip.ok{background:#EAF3EE;border-color:#C9E0D4;color:#1F7A55}
      .drive-chip.warn{background:#FBF2E4;border-color:#EBD9B8;color:#8A5A12}
      .drive-chip.err{background:#FBEAE8;border-color:#EBC7C4;color:#B3261E}
      .drive-chip .ic{flex:none;font-size:.95rem}
      .drive-panel-bg{position:fixed;inset:0;z-index:99990;background:rgba(16,26,61,.35)}
      .drive-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99991;width:min(460px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(16,26,61,.3);padding:20px 22px;font-family:'Sarabun',sans-serif;color:#101A3D}
      .drive-panel h3{margin:0 0 6px;font-size:1.05rem}
      .drive-panel p{margin:0 0 8px;font-size:.86rem;color:#39436B;line-height:1.55}
      .drive-panel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .drive-panel button{font:600 .84rem 'Sarabun',sans-serif;border-radius:10px;padding:9px 14px;cursor:pointer;border:1px solid #E4E7F0;background:#fff;color:#1B2A5E}
      .drive-panel button.primary{background:#1B2A5E;border-color:#1B2A5E;color:#fff}
      .drive-panel button.danger{color:#B3261E;border-color:#EBC7C4}
      .drive-panel button:disabled{opacity:.55;cursor:default}
      .drive-panel .meta{font-size:.78rem;color:#646C89;margin-top:8px;line-height:1.6}
      .drive-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;padding:10px 12px;border:1px solid #E4E7F0;border-radius:10px;background:#F8F9FC;font-size:.82rem}
      .drive-bar b{color:#1B2A5E}
      .drive-bar button{font:600 .78rem 'Sarabun',sans-serif;border-radius:8px;padding:6px 12px;cursor:pointer;border:1px solid #1B2A5E;background:#1B2A5E;color:#fff}
      .drive-bar button.ghost{background:#fff;color:#1B2A5E}
      @media (max-width:600px){.drive-chip{margin:6px 12px 12px;width:calc(100% - 24px)}}
    `;
    document.head.appendChild(s);
  }
  function injectChip() {
    const sb = document.querySelector('.app-sidebar');
    if (!sb || document.getElementById('drive-chip')) return;
    injectStyles();
    const chip = document.createElement('button');
    chip.id = 'drive-chip'; chip.type = 'button'; chip.className = 'drive-chip'; chip.title = 'สำรองข้อมูลกับ Google Drive';
    chip.addEventListener('click', openPanel);
    sb.appendChild(chip);
    renderChip();
  }
  function renderChip() {
    const chip = document.getElementById('drive-chip');
    if (!chip) return;
    const t = chipText();
    if (!t) { chip.style.display = 'none'; return; }
    chip.style.display = '';
    chip.className = 'drive-chip ' + (t[2] || '');
    chip.innerHTML = '<span class="ic">' + t[0] + '</span><span>' + t[1] + '</span>';
  }
  function renderBar() {
    const bar = document.getElementById('drive-sync-bar');
    if (!bar) return;
    if (!CFG.enabled) { bar.style.display = 'none'; return; }
    injectStyles();
    bar.style.display = '';
    const t = chipText() || ['☁️', 'Google Drive', ''];
    const st = loadState();
    const hint = localStorage.getItem(HINT_KEY);
    bar.innerHTML = `<span>${t[0]}</span><b>Google Drive</b><span>${t[1]}</span>${hint ? `<span style="color:#646C89">· บัญชี ${hint}</span>` : ''}
      <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" data-drive="connect">${st.lastSyncAt ? 'ซิงก์เดี๋ยวนี้' : 'เชื่อมต่อ Google Drive'}</button>
        <button type="button" class="ghost" data-drive="panel">รายละเอียด</button>
      </span>`;
    bar.querySelector('[data-drive="connect"]').onclick = () => pushNow();
    bar.querySelector('[data-drive="panel"]').onclick = openPanel;
  }
  function renderAll() { renderChip(); renderBar(); if (document.getElementById('drive-panel') && _status.state !== 'syncing') openPanel(); }

  function closePanel() { ['drive-panel', 'drive-panel-bg'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); }); }
  function openPanel() {
    closePanel();
    injectStyles();
    const st = loadState(), s = _status.state, hint = localStorage.getItem(HINT_KEY);
    const bg = document.createElement('div'); bg.id = 'drive-panel-bg'; bg.className = 'drive-panel-bg'; bg.onclick = closePanel;
    const p = document.createElement('div'); p.id = 'drive-panel'; p.className = 'drive-panel';
    const meta = `<div class="meta">${hint ? 'บัญชี Google: <b>' + hint + '</b><br>' : ''}ซิงก์ล่าสุด: ${st.lastSyncAt ? fmtWhen(st.lastSyncAt) : 'ยังไม่เคย'} · รุ่นข้อมูล ${st.baseRev || 0}${st.imgSyncAt ? ' · รูปซิงก์ ' + fmtWhen(st.imgSyncAt) : ''}${st.dirtySince ? '<br>มีการแก้ไขที่ยังไม่ได้ส่งขึ้นตั้งแต่ ' + fmtWhen(st.dirtySince) : ''}</div>`;
    let body, buttons;
    if (s === 'conflict') {
      const r = _status.remote || {};
      body = `<h3>⚠ เครื่องนี้มีข้อมูลอยู่แล้ว และ Drive ก็มีข้อมูล</h3>
        <p><b>บน Google Drive:</b> ${r.props && r.props.clients != null ? r.props.clients + ' ลูกค้า · ' : ''}อัปเดต ${fmtWhen((r.props && r.props.at) || r.modifiedTime)}<br>
        <b>เครื่องนี้:</b> ${_status.localCount || clientCount(currentUser())} ลูกค้า · ยังไม่เคยซิงก์กับ Drive</p>
        <p><b>รวมทั้งสองฝั่ง</b> = เก็บลูกค้าของทั้งสองฝั่ง ลูกค้าที่ซ้ำกันใช้ของเครื่องนี้ (แนะนำ) · อีกสองทางจะทับข้อมูลอีกฝั่งทั้งหมด ก่อนเลือก “ใช้ของ Drive” ควรกด Export ของเครื่องนี้เก็บไว้ก่อน</p>`;
      buttons = `<button class="primary" data-act="merge">รวมทั้งสองฝั่ง</button><button data-act="local">ใช้ของเครื่องนี้ (ทับ Drive)</button><button data-act="remote">ใช้ของ Drive (ทับเครื่องนี้)</button><button data-act="close">ไว้ก่อน</button>`;
    } else if (s === 'remoteNewer') {
      body = `<h3>⬇ มีข้อมูลใหม่บน Google Drive</h3><p>มีการบันทึกจากเครื่องอื่นหลังจากที่เครื่องนี้ซิงก์ล่าสุด เครื่องนี้ไม่มีการแก้ไขค้าง จึงโหลดมาทับได้เลย แล้วหน้าจะเปิดใหม่</p>`;
      buttons = `<button class="primary" data-act="apply">โหลดข้อมูลล่าสุด</button><button data-act="close">ไว้ก่อน</button>`;
    } else if (s === 'error') {
      body = `<h3>⚠ Google Drive มีปัญหา</h3><p>${_status.msg || ''}</p>`;
      buttons = `<button class="primary" data-act="connect">ลองเชื่อมต่อใหม่</button>${st.lastSyncAt ? '<button data-act="restore">กู้คืนจาก Drive</button>' : ''}<button data-act="close">ปิด</button>`;
    } else if (s === 'paused') {
      body = `<h3>⏸ หยุดซิงก์ไว้ชั่วคราว</h3><p>ข้อมูลยังบันทึกในเครื่องตามปกติ แต่ไม่ส่งขึ้น Google Drive จนกว่าจะเปิดใหม่</p>`;
      buttons = `<button class="primary" data-act="resume">เปิดซิงก์</button><button data-act="close">ปิด</button>`;
    } else if (s === 'syncing') {
      body = `<h3>☁️ กำลังซิงก์…</h3><p>${_imgProgress ? 'รูปภาพ ' + _imgProgress.done + '/' + _imgProgress.total : 'กำลังเทียบข้อมูลกับ Google Drive'}</p>`;
      buttons = `<button data-act="close">ปิด</button>`;
    } else {
      body = `<h3>☁️ สำรองข้อมูลกับ Google Drive</h3>
        <p>ข้อมูลลูกค้าและรูปของคุณถูกเก็บในโฟลเดอร์ของแอปใน Google Drive <b>ของคุณเอง</b> (ไม่มีใครเห็น ใช้ได้ทุกเครื่องที่ล็อกอิน) · ส่งขึ้นอัตโนมัติหลังแก้ไข · แก้คนละเครื่องแอปรวมให้รายลูกค้า · สิทธิ์เข้า Drive หมดอายุทุกชั่วโมง ถ้าเห็นชิปขึ้น “กดเพื่อเชื่อมต่อ” ให้กดครั้งเดียว</p>
        ${s === 'pending' || s === 'noauth' ? '<p><b>ตอนนี้ยังไม่ได้เชื่อมต่อ</b>' + (st.dirtySince ? ' และมีข้อมูลรอส่งขึ้น' : '') + ' — กด “เชื่อมต่อ” แล้วเลือกบัญชี Google ที่ต้องการเก็บข้อมูล</p>' : ''}`;
      buttons = `<button class="primary" data-act="connect">${st.lastSyncAt ? 'ซิงก์เดี๋ยวนี้' : 'เชื่อมต่อ Google Drive'}</button>${st.lastSyncAt ? '<button data-act="restore">กู้คืนจาก Drive ทับเครื่องนี้</button><button class="danger" data-act="pause">หยุดซิงก์ชั่วคราว</button>' : ''}<button data-act="close">ปิด</button>`;
    }
    p.innerHTML = body + `<div class="row">${buttons}</div>` + meta;
    p.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') return closePanel();
      p.querySelectorAll('button').forEach(x => { x.disabled = true; });
      if (act === 'connect') pushNow().then(closePanel);
      else if (act === 'apply') sync({ reason: 'manual', interactive: true, apply: true }).then(closePanel);
      else if (act === 'merge') resolveConflict('merge', { reason: 'load' }).then(closePanel);
      else if (act === 'local') resolveConflict('local').then(closePanel);
      else if (act === 'remote') resolveConflict('remote').then(closePanel);
      else if (act === 'restore') { closePanel(); restoreFromDrive(); }
      else if (act === 'pause') { pause(true); closePanel(); }
      else if (act === 'resume') { pause(false); closePanel(); }
    });
    document.body.appendChild(bg); document.body.appendChild(p);
  }
  function toast(msg) {
    if (typeof window.showToast === 'function') { try { window.showToast(msg); return; } catch (e) {} }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#1B2A5E;color:#fff;padding:10px 18px;border-radius:999px;font:600 .85rem Sarabun,sans-serif;box-shadow:0 8px 24px rgba(16,26,61,.3);max-width:calc(100vw - 32px);text-align:center';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }

  /* ═══════════════ เริ่มทำงาน ═══════════════ */
  function onReady(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); }
  function init() {
    if (!CFG.enabled) return;   /* ปิดใช้ → เงียบ (แค่ติดตามงานค้างไว้ เผื่อเปิดทีหลัง) */
    onReady(() => {
      injectChip(); renderBar();
      const msg = sessionStorage.getItem(MSG_KEY);
      if (msg) { sessionStorage.removeItem(MSG_KEY); setTimeout(() => toast(msg), 600); }
      const st = loadState();
      if (_status.state === 'idle') setStatus(st.paused ? 'paused' : (readToken() ? 'idle' : (st.dirtySince ? 'pending' : 'noauth')));
    });
    /* เทียบกับ Drive ตั้งแต่สคริปต์โหลด (ยังไม่ต้องรอ DOM) — ถ้า Drive ใหม่กว่าจะโหลดทับแล้วเปิดหน้าใหม่ */
    sync({ reason: 'load' });
    setInterval(() => sync({ reason: 'periodic' }), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync({ reason: 'visible' }); });
  }

  window.DriveSync = {
    sync, connect, pushNow, resolveConflict, restoreFromDrive, pause, openPanel, syncImages,
    status: () => _status, state: loadState, enabled: () => !!CFG.enabled, onStatus: fn => listeners.push(fn),
    _test: {
      decide, mergeData, observe, applyPayload, buildPayload, markDirty, collectRefs, hash,
      setTransport(t) { transport = t || realTransport; },
      setToken(tok) { tok ? saveToken(tok, 'test@example.com', 3600) : clearToken(); },
      suspend(on) { _suspended = !!on; clearTimeout(_timer); clearTimeout(_obsTimer); },
      reset() { localStorage.removeItem(STATE_PREFIX + uidNow()); },
      clearDirty() { const st = loadState(); st.dirtySince = null; st.dirtySeq = 0; saveState(st); },
      setConfig(c) { Object.assign(CFG, c || {}); },
      initUI() { injectChip(); renderBar(); },
      setStatus(state, extra) { setStatus(state, extra); },
    },
  };
  init();
})();
