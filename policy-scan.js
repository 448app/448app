/* policy-scan.js — เพิ่มกรมธรรม์จากรูปถ่าย (หน้าสรุปกรมธรรม์ policies.html)
   ─────────────────────────────────────────────────────────────────
   ทำอะไร   รูปหน้าตารางกรมธรรม์ → อ่านข้อความ (OCR) → แยกเป็นช่องของฟอร์ม "เพิ่มกรมธรรม์"
            ผู้ใช้ต้องตรวจทุกช่องแล้วกดบันทึกเอง — ไม่มีการบันทึกอัตโนมัติ และแอปไม่เก็บรูปไว้
   ตัวอ่าน  1) ในเครื่อง (ค่าเริ่มต้น): tesseract.js ทำงานในเบราว์เซอร์ รูปไม่ออกจากเครื่อง
               ครั้งแรกโหลดตัวอ่าน + ภาษาไทย/อังกฤษ ประมาณ 5 MB จาก cdn.jsdelivr.net (วัดจริง 4.8 MB) แล้วเบราว์เซอร์จำไว้
            2) Google (ตัวเลือก — แม่นกว่ากับรูปที่ถ่ายไม่ชัด): อัปโหลดรูปเป็น Google Docs ชั่วคราวใน Drive ของผู้ใช้เอง
               → ดึงข้อความ → ลบไฟล์ทิ้งทันที · ใช้สิทธิ์ drive.file (แอปเห็นเฉพาะไฟล์ที่แอปสร้างเอง)
               ผ่าน OAuth client เดียวกับ drive-config.js · ซ่อนปุ่มนี้ได้ด้วย AIA_DRIVE.ocrGoogle = false
   ตัวแยก   ย้ายมาจาก Scan.gs ของแอป "สรุปกรมธรรม์" (ปรับตามหน้าตารางกรมธรรม์) แล้วทำให้ทนข้อความเพี้ยนของตัวอ่านในเครื่อง:
            จุลภาค/มหัพภาคในตัวเลขสลับกัน · วรรณยุกต์หายหรือเกิน · ชื่อเดือนย่อมีสระแปลกปน · ตัวอักษรนำเลขกรมธรรม์อ่านผิด
   ผลลัพธ์   toPolicy() คืน object รูปแบบเดียวกับที่ populatePolicyForm() ของ policies.html ใช้
            เบี้ย = เบี้ยต่อปีของสัญญาหลัก (สัญญาเพิ่มเติมมีเบี้ยของตัวเอง) ตามที่ calc.js policyPremiums นับ
   ทดสอบ   tests.html กลุ่ม "อ่านกรมธรรม์จากรูป"
*/
(function () {
  'use strict';
  if (window.PolicyScan) return;

  /* ═══════════════ ค่าคงที่ ═══════════════ */
  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const GIS_URL = 'https://accounts.google.com/gsi/client';
  const OCR_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const TOKEN_KEY = 'aia_scan_token';             /* sessionStorage: { token, exp } */
  const OCR_MAX_SIDE = 2200;                      /* ด้านยาวของรูปที่ส่งให้ตัวอ่าน (px) */
  const GOOGLE_MAX_BYTES = 1.9 * 1024 * 1024;     /* Google OCR รับไฟล์ไม่เกิน 2 MB */
  const LOCAL_IDLE_MS = 90 * 1000;                /* คืนหน่วยความจำของตัวอ่านในเครื่องเมื่อไม่ได้ใช้ */
  const LOCAL_TIMEOUT_MS = 120 * 1000;            /* อ่านรูปเดียวนานเกินนี้ = ค้าง */
  const OTHER = 'อื่น ๆ';
  /* อักขระที่มองไม่เห็น — สร้างจากรหัส ไม่พิมพ์ลงในไฟล์ตรง ๆ */
  const NBSP = String.fromCharCode(160);
  const BOM_RE = new RegExp('^' + String.fromCharCode(0xFEFF));

  const MODES = [
    { key: 'รายปี', perYear: 1, months: 12 },
    { key: 'ราย 6 เดือน', perYear: 2, months: 6 },
    { key: 'ราย 3 เดือน', perYear: 4, months: 3 },
    { key: 'รายเดือน', perYear: 12, months: 1 },
    { key: 'ชำระครั้งเดียว', perYear: 1, months: 0, single: true },
  ];
  const COMPANIES = [
    'AIA', 'เมืองไทยประกันชีวิต', 'เมืองไทยประกันภัย', 'ไทยประกันชีวิต', 'กรุงเทพประกันชีวิต',
    'FWD ประกันชีวิต', 'อลิอันซ์ อยุธยา', 'พรูเด็นเชียล', 'กรุงไทย-แอกซ่า',
    'ทิพยประกันภัย', 'วิริยะประกันภัย', 'กรุงเทพประกันภัย', 'ธนชาตประกันภัย',
  ];

  /* ═══════════════ ตัวช่วยภาษาไทย ═══════════════ */
  const MARK = '็-๎';                   /* ็ ่ ้ ๊ ๋ ์ ํ ๎ */
  const MARK_RE = new RegExp('[' + MARK + ']', 'g');
  const STRAY = 'ุู' + MARK;            /* สระอุ/อู + วรรณยุกต์ ที่ตัวอ่านเติมเองจากจุดหรือเงา */

  /** OCR มักให้สระอำเป็น นิคหิต + สระอา (ํา) — แปลงให้เป็นตัวเดียวกับที่พิมพ์ จะได้ค้นคำได้ */
  function thaiNorm(s) {
    return String(s || '').replace(/ํ([่-๋]?)า+/g, '$1ำ').replace(/([่-๋])ํา+/g, '$1ำ');
  }

  /** คำไทย → รูปแบบค้นหาที่ทนวรรณยุกต์/การันต์หายหรือเกิน และสระอำที่อ่านเป็น า */
  function tol(s) {
    return s.replace(MARK_RE, '').split('').map(ch => {
      if (ch === 'ำ') return '(?:ำ|า)[' + MARK + ']*';
      if (/[ก-ฺเ-ๆ]/.test(ch)) return ch + '[' + MARK + ']*';
      if (ch === ' ') return '\\s*';
      return ch.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    }).join('');
  }
  /** T('คำ1|คำ2') → RegExp ที่ทนวรรณยุกต์ (ใช้กับคำล้วน ๆ ที่คั่นด้วย |) */
  function T(alts, flags) { return new RegExp('(?:' + alts.split('|').map(tol).join('|') + ')', flags || ''); }
  const Ts = alts => '(?:' + alts.split('|').map(tol).join('|') + ')';

  /** ตัดช่องว่างซ้ำ เส้นตาราง และเศษนำหน้าบรรทัดที่ตัวอ่านในเครื่องใส่มา (เช่น "0 0   กรมธรรม์เลขที่", "= :   ผู้เอาประกันภัย") */
  function cleanLine(s) {
    /* เศษท้ายบรรทัดหลังช่องว่างกว้าง (ขอบกระดาษ/เงา) เช่น "…(ไม่มีเงินปันผล)          0" หรือ "… รายปี      : 0 0 - 0 i" */
    s = String(s || '').split(NBSP).join(' ').replace(/\t/g, ' ').replace(/\s*\|.{0,8}$/, '')
      .replace(/ {4,}(?:[^\sก-๛A-Za-z0-9]{1,3}|[0-9oOa-z])(?: +(?:[^\sก-๛A-Za-z0-9]{1,3}|[0-9oOa-z]))* *$/, '');
    s = s.replace(/ +/g, ' ').replace(/\s*\|\s*/g, ' ').trim();
    s = s.replace(/^(?:(?:[^\sก-ฮเ-ไA-Za-z0-9(]{1,2}|[0oO])\s+){1,4}(?=[ก-ฮเ-ไ(])/, '');
    return s.trim();
  }

  /* ═══════════════ วันที่ / จำนวนเงิน ═══════════════ */
  const MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONTH_ABBR = { 'มค': 1, 'กพ': 2, 'มีค': 3, 'เมย': 4, 'พค': 5, 'มิย': 6, 'กค': 7, 'สค': 8, 'กย': 9, 'ตค': 10, 'พย': 11, 'ธค': 12 };
  const MONTH_FULL_KEY = MONTH_FULL.map(m => m.replace(MARK_RE, ''));
  const J = '[\\s.' + STRAY + ']*';               /* ระหว่างตัวอักษรของชื่อเดือนย่อ: ช่องว่าง จุด และสระ/วรรณยุกต์ที่ปนมา */
  /* ชื่อเต็มก่อน แล้วตัวย่อ 3 ตัวก่อน 2 ตัว (มี.ค. ก่อน ม.ค.) */
  const MONTH_SRC = '(' + MONTH_FULL.map(tol).join('|') + '|มี' + J + 'ค|เม' + J + 'ย|มิ' + J + 'ย|[มกพสตธ]' + J + '[คพย])' + J;
  const DATE_RE = new RegExp('(\\d{1,2})\\s*' + MONTH_SRC + '\\s*(\\d{4})', 'g');
  const NUM_DATE_RE = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/g;
  /* วันที่ที่เดือนถูกอ่านเป็นอักษรอังกฤษ เช่น "29 n.a. 2568" — แปลงไม่ได้ ใช้เตือนเท่านั้น */
  const LATIN_MONTH_RE = /\b(\d{1,2})\s*([A-Za-z][A-Za-z.]{1,5})\s*(2[4-6]\d\d)\b/;
  /* จำนวนเงิน: "1,000,000.00" และแบบที่ตัวคั่นเพี้ยน "1.000.000.00" / "5000.000.00" / "55.600.00" */
  const AMOUNT_RE = /\d[\d.,]*[.,]\d{2}(?!\d)|\d{1,3}(?:[.,]\d{3})+(?!\d)/g;

  function monthOf(token) {
    const k = String(token || '').replace(/[\s.]/g, '').replace(new RegExp('[' + STRAY + ']', 'g'), '');
    if (MONTH_ABBR[k]) return MONTH_ABBR[k];
    const full = String(token || '').replace(/[\s.]/g, '').replace(MARK_RE, '');
    const i = MONTH_FULL_KEY.indexOf(full);
    return i >= 0 ? i + 1 : 0;
  }
  function scanIso(year, month, day) {
    if (year > 2400) year -= 543;  /* พ.ศ. → ค.ศ. */
    if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return '';
    return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
  }
  /** วันที่ในบรรทัด → [{ iso, at (ตำแหน่งท้ายวันที่) }] */
  function scanDates(line) {
    const out = [];
    let m;
    DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(line))) {
      const month = monthOf(m[2]);
      const iso = month ? scanIso(Number(m[3]), month, Number(m[1])) : '';
      if (iso) out.push({ iso: iso, at: m.index + m[0].length });
    }
    NUM_DATE_RE.lastIndex = 0;
    while ((m = NUM_DATE_RE.exec(line))) {
      const iso = scanIso(Number(m[3]), Number(m[2]), Number(m[1]));
      if (iso) out.push({ iso: iso, at: m.index + m[0].length });
    }
    return out;
  }
  function stripDates(s) { return String(s).replace(DATE_RE, '').replace(NUM_DATE_RE, ''); }

  function toAmount(s) {
    s = String(s);
    let intPart = s, dec = '';
    const m = /^(.*)[.,](\d{2})$/.exec(s);
    if (m && !/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) { intPart = m[1]; dec = m[2]; }
    const v = Number(intPart.replace(/[.,]/g, '') + (dec ? '.' + dec : ''));
    return isFinite(v) ? v : 0;
  }
  function amountsOf(line) {
    /* ไม่นับวันที่แบบตัวเลข (29.07.2568) เป็นจำนวนเงิน */
    return (String(line).replace(NUM_DATE_RE, ' ').match(AMOUNT_RE) || []).map(toAmount);
  }

  function isoToUtc(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function addMonthsIso(iso, months) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    const total = Number(m[1]) * 12 + Number(m[2]) - 1 + months;
    const y = Math.floor(total / 12), mo = total % 12;
    const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, mo, Math.min(Number(m[3]), lastDay))).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) { return Math.round((isoToUtc(b) - isoToUtc(a)) / 86400000); }
  /** อายุ ณ วันที่กำหนด แบบที่บริษัทประกันไทยใช้ (เศษตั้งแต่ 6 เดือนปัดขึ้น) */
  function ageNearest(dobIso, atIso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobIso || '') || !/^\d{4}-\d{2}-\d{2}$/.test(atIso || '')) return null;
    const b = dobIso.split('-').map(Number), t = atIso.split('-').map(Number);
    const months = (t[0] - b[0]) * 12 + (t[1] - b[1]) - (t[2] < b[2] ? 1 : 0);
    if (months < 0) return null;
    return Math.floor(months / 12) + (months % 12 >= 6 ? 1 : 0);
  }

  /* ═══════════════ แยกข้อความ OCR เป็นช่องของฟอร์ม ═══════════════ */
  /** หมวดของสัญญาเพิ่มเติมจากรหัส/ชื่อ — ดูจากรหัสก่อน (UDR-HS = ค่าห้อง แม้ชื่อจะมีคำว่า "ค่ารักษาพยาบาล") */
  const RIDER_RULES = [
    [new RegExp('HSHP|H&S|HEALTH|' + Ts('เหมาจ่าย|สุขภาพ|ค่ารักษาพยาบาล'), 'i'), 'ค่ารักษาเหมาจ่าย'],
    [new RegExp('HBPG|\\bHB\\b|\\bH8\\b|' + Ts('ชดเชยรายวัน|ค่าชดเชย|รายได้')), 'HB'],
    [new RegExp('\\bHS\\b|UDR-HS\\b|' + Ts('ค่าห้อง')), 'ค่าห้อง'],
    [new RegExp('ECIR|\\bCI\\d*\\b|' + Ts('โรคร้ายแรง|มะเร็ง')), 'CI/ECIR'],
    [new RegExp('\\bA[Il1]\\b|\\bADD\\b|\\bADB\\b|' + Ts('อุบัติเหตุ')), 'AI'],
    [new RegExp('TPD|' + Ts('ทุพพลภาพ')), 'ทุพพลภาพ'],
  ];

  const RE = {
    noLabel: new RegExp(tol('กรมธรรม์') + '(?:' + tol('ประกันภัย') + '|' + tol('ประกันชีวิต') + ')?\\s*' + tol('เลขที่') + '|' + tol('เลขที่กรมธรรม์')),
    noCut: new RegExp('.*(?:' + tol('เลขที่กรมธรรม์') + '|' + tol('เลขที่') + ')\\s*[:：]?\\s*'),
    insured: new RegExp(Ts('ผู้เอาประกันภัย|เจ้าของกรมธรรม์') + '\\s*[:：]?\\s*(.+)$'),
    insuredSkip: T('สามารถ|ยกเลิก|ภายใน|ผลประโยชน์|อายุ'),
    nameTail: new RegExp('\\s*' + Ts('วันที่|วันทำ|วันเริ่ม|วันครบ|เพศ|อายุ') + '.*$'),
    planStart: new RegExp('^[\\s(\\-–•*]*' + Ts('แบบการประกันภัย|แบบประกันภัย|แบบประกัน|ชื่อแบบประกัน') + '\\s*[:：]?\\s*(.+)$'),
    planAny: new RegExp(tol('แบบการประกันภัย') + '\\s*[:：]?\\s*(.+)$'),
    planSkip: T('ข้างต้น|เลขที่'),
    planTail: new RegExp('\\s*' + Ts('วันที่|วันเริ่ม|วันครบ') + '.*$'),
    born: T('เกิด'),
    start1: T('เริ่มมีผลคุ้มครอง|วันเริ่มสัญญา|วันเริ่มต้น|วันมีผลบังคับ|วันเริ่มคุ้มครอง'),
    start2: T('วันที่ของกรมธรรม์|วันทำสัญญา|วันออกกรมธรรม์'),
    end: T('ครบกำหนดสัญญา|วันครบกำหนด|วันสิ้นสุด|สิ้นสุดความคุ้มครอง|ครบสัญญา'),
    mainRow: T('ชีวิต|ตามแบบประกันภัย|ความคุ้มครองหลัก|สัญญาหลัก'),
    sumLabel: new RegExp('^' + Ts('จำนวนเงินเอาประกันภัย|ทุนประกันภัย|ทุนประกัน|ทุนเอาประกันภัย')),
    riderWord: T('สัญญาเพิ่มเติม'),
    term: new RegExp(tol('ระยะเวลาเอาประกันภัย') + '\\s*[:：]?\\s*(\\d{1,2})\\s*ปี'),
    pay: new RegExp(tol('ระยะเวลาชำระเบี้ย') + '(?:' + tol('ประกันภัย') + ')?\\s*[:：]?\\s*(\\d{1,2})\\s*ปี'),
    premTotal: T('เบี้ยประกันภัยรวม|รวมเบี้ยประกันภัย|เบี้ยประกันภัยทั้งสิ้น|เบี้ยประกันภัยต่องวด|รวมเบี้ย'),
    payLine: T('งวด|วิธีการชำระ|การชำระเบี้ย|ชำระเบี้ยประกันภัย'),
    single: new RegExp(Ts('ครั้งเดียว') + '|single\\s*premium', 'i'),
    monthly: new RegExp(tol('ราย') + '\\s*' + tol('เดือน')),
    quarterly: new RegExp(tol('ราย') + '\\s*3\\s*' + tol('เดือน') + '|' + tol('ไตรมาส')),
    halfYear: new RegExp(tol('ราย') + '\\s*6\\s*' + tol('เดือน') + '|' + tol('ครึ่งปี')),
    yearly: new RegExp(tol('ราย') + '\\s*' + tol('ปี')),
    singleAny: new RegExp(Ts('ชำระเบี้ยครั้งเดียว|เบี้ยประกันภัยชำระครั้งเดียว') + '|Single Premium', 'i'),
    tableStart: T('ตารางผลประโยชน์|ผลประโยชน์และเบี้ยประกันภัย|รายละเอียดความคุ้มครอง|ตารางความคุ้มครอง'),
    tableStop: new RegExp('^\\*|' + Ts('สัญญาเพิ่มเติมเป็นสัญญา|หมายเหตุ') + '|^PIP|' + tol('หน้า') + '\\s*\\d|' + tol('ระยะเวลาเอาประกันภัย') + '\\s*\\d+\\s*ปี\\s*' + tol('อาจ')),
    tableHead: new RegExp(tol('ประเภท') + '(?:' + tol('ความ') + '|' + tol('การ') + ')' + tol('คุ้มครอง') + '|' + Ts('แบบเลขที|หรือผลประโยชน์') +
      '|^\\(?' + tol('บาท') + '\\)?$|' + tol('ประกันภัย') + '\\s*\\(ปี\\)|^' + tol('ระยะเวลา') + '|^' + tol('จำนวนเงิน') + '|^' + tol('เบี้ยประกันภัย') + '$|^\\/?\\s*' + tol('ระยะเวลาชำระ') + '|^\\(' + tol('บาท')),
    total: T('รวม'),
    unitWords: new RegExp('\\((?:' + tol('บาท') + '|' + tol('ปี') + ')\\)|' + tol('บาท'), 'g'),
  };

  function scanCompany(text, companies) {
    if (/เอไอเอ|\bAIA\b/i.test(text)) return 'AIA';
    const found = companies.slice().sort((a, b) => b.length - a.length).find(c => c && text.indexOf(c) >= 0);
    return found || '';
  }
  /** เทียบชื่อโดยตัดคำนำหน้า ช่องว่าง และวรรณยุกต์ */
  function sameName(a, b) {
    const norm = s => thaiNorm(s).trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|คุณ|mrs?\.?|ms\.?|miss)\s*/i, '').replace(/\s+/g, '').replace(MARK_RE, '');
    return !!norm(a) && norm(a) === norm(b);
  }
  function normPolicyNo(s) { return String(s || '').replace(/[\s\-\/]/g, '').toUpperCase(); }
  /** ชื่อสัญญาเพิ่มเติม: ตัดเศษหน้า/ท้ายที่ตัวอ่านใส่มา เช่น "/ อุบัติเหตุ", "ECIR โรคร้ายแรง บ1" (1/1 ที่อ่านผิด) */
  function tidyName(s) {
    return String(s || '')
      .replace(/^[^ก-ฮเ-ไA-Za-z0-9]+/, '')
      .replace(/^\d{1,3}\s+(?=[ก-ฮเ-ไ])/, '')          /* รหัสที่อ่านเป็นตัวเลข เช่น "98 ค่าชดเชยรายวัน" (HB) */
      .replace(/^Al\b/, 'AI')
      .replace(/(?:\s+(?:\S{0,2}\d\S{0,2}|[^\sก-๛A-Za-z0-9]{1,3}|\S))+$/, '')
      .trim();
  }

  /** แถวในตารางผลประโยชน์ — OCR อาจให้ทั้งแถวในบรรทัดเดียว หรือแยกช่องละบรรทัด จึงต่อจำนวนเงินเข้ากับคำอธิบายล่าสุด */
  function scanBenefitRows(lines) {
    const start = lines.findIndex(l => RE.tableStart.test(l));
    if (start < 0) return [];
    const rows = [];
    let cur = null;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (RE.tableStop.test(l)) break;
      if (RE.tableHead.test(l)) continue;
      if (RE.total.test(l)) { cur = null; continue; }  /* บรรทัดยอดรวม ไม่ใช่สัญญาเพิ่มเติม */
      const amounts = amountsOf(l);
      const tp = /(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s|$)/.exec(l);
      const termPay = tp && Number(tp[1]) >= Number(tp[2]) ? [Number(tp[1]), Number(tp[2])] : null;
      /* เศษหัวตาราง เช่น "(บาท) 481,000.00" ไม่ใช่ชื่อสัญญาเพิ่มเติม */
      const words = l.replace(AMOUNT_RE, ' ').replace(/(?:^|\s)\d{1,2}\s*\/\s*\d{1,2}(?=\s|$)/, ' ')
        .replace(RE.unitWords, ' ').replace(/\s+/g, ' ').trim();
      const code = (/\b([A-Z]{2,6}(?:-[A-Z0-9]{1,8})+|[A-Z]{2,6}\d{0,3})\b/.exec(words.replace(/\bAl\b/g, 'AI')) || [])[1] || '';
      const hasText = /[ก-๙A-Za-z]{2,}/.test(words);
      if (hasText) {
        cur = { text: words, code: code, amounts: amounts, termPay: termPay };
        rows.push(cur);
      } else if (cur) {
        cur.amounts = cur.amounts.concat(amounts);
        if (termPay && !cur.termPay) cur.termPay = termPay;
      }
    }
    return rows.filter(r => r.amounts.length || r.termPay);
  }

  function parseText(text, companies) {
    const lines = thaiNorm(text).split(/\r?\n/).map(cleanLine).filter(Boolean);
    const all = lines.join('\n');
    const notes = [];
    const fields = {
      company: scanCompany(all, (companies || []).concat(COMPANIES)),
      policyNo: '', planName: '', startDate: '', endDate: '', term: '', payYears: '', premium: '', premiumMode: '',
    };

    /* เลขที่กรมธรรม์ */
    let prefixLost = false;
    lines.some((l, i) => {
      if (!RE.noLabel.test(l)) return false;
      const rest = l.replace(RE.noCut, '');
      let m = /([A-Z]{0,3}\d[\dA-Z\-\/]{5,})/i.exec(rest);
      if (m) {
        /* ตัวอักษรนำหน้าถูกอ่านเป็นอักษรไทย (เช่น "ป887320547") → เลขที่ได้ขาดตัวแรก */
        const before = rest.slice(0, m.index).slice(-1);
        if (before && /[ก-ฮ]/.test(before) && /^\d/.test(m[1])) prefixLost = true;
      } else {
        m = /([A-Z]{0,3}\d[\dA-Z\-\/]{5,})/i.exec(lines[i + 1] || '');
      }
      if (m) fields.policyNo = m[1].toUpperCase();
      return !!m;
    });
    if (!fields.policyNo) {
      const m = /\b([A-Z]\d{9})\b/.exec(all);  /* รูปแบบของ AIA เช่น U887320547 */
      if (m) fields.policyNo = m[1];
    }
    /* เลขของ AIA ขึ้นต้นด้วยตัวอักษร (U/T/P…) ตามด้วยเลข 9 หลัก — OCR มักอ่านตัว U เป็นเลข 0 หรืออักษรไทย */
    if (fields.company === 'AIA' && fields.policyNo) {
      if (/^[0O]\d{9}$/.test(fields.policyNo)) {
        fields.policyNo = 'U' + fields.policyNo.slice(1);
        notes.push('เลขกรมธรรม์: เปลี่ยนตัวแรกจาก 0 เป็น U ให้แล้ว (ตัวอ่านมักอ่านสลับกัน) — ตรวจตัวอักษรตัวแรกอีกครั้ง');
      } else if (prefixLost && /^\d{9}$/.test(fields.policyNo)) {
        notes.push('เลขกรมธรรม์: อ่านตัวอักษรนำหน้าไม่ออก — เติมตัวอักษรหน้าเลข ' + fields.policyNo + ' เอง (เช่น U, T, P)');
      } else if (!/^[A-Z]\d{9}$/.test(fields.policyNo)) {
        notes.push('เลขกรมธรรม์ ' + fields.policyNo + ' ไม่ตรงรูปแบบของ AIA (ตัวอักษร 1 ตัว + เลข 9 หลัก) — ตรวจกับกรมธรรม์');
      }
    }

    /* ชื่อผู้เอาประกัน (ใช้เตือนเมื่อไม่ตรงกับลูกค้า) */
    let insuredName = '';
    lines.some(l => {
      const m = RE.insured.exec(l);
      if (!m || RE.insuredSkip.test(l)) return false;
      const name = stripDates(m[1]).replace(RE.nameTail, '').replace(/\d.*$/, '').trim();
      if (name.length < 4) return false;
      insuredName = name;
      return true;
    });

    /* แบบประกัน */
    lines.some(l => {
      const m = RE.planStart.exec(l) || RE.planAny.exec(l);
      if (!m || RE.planSkip.test(m[1])) return false;
      const name = stripDates(m[1]).replace(RE.planTail, '').trim();
      if (name.length < 3) return false;
      fields.planName = name;
      return true;
    });

    /* วันที่: ตามคำกำกับในบรรทัดเดียวกันก่อน แล้วค่อยเดาจากวันแรก/วันท้ายสุด */
    const dated = lines.map(l => ({ l: l, dates: scanDates(l) })).filter(x => x.dates.length && !RE.born.test(x.l));
    /* บรรทัดเดียวอาจมีหลายวันที่ (เช่น "29 ก.ค. 2568 วันทำสัญญา 29 ก.ค. 2568 วันเริ่มมีผลคุ้มครอง") — เลือกวันที่ที่อยู่ใกล้คำกำกับที่สุด */
    const pick = re => {
      const x = dated.find(d => re.test(d.l));
      if (!x) return '';
      const at = x.l.search(re);
      return x.dates.slice().sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0].iso;
    };
    fields.startDate = pick(RE.start1) || pick(RE.start2);
    fields.endDate = pick(RE.end);
    const allDates = dated.reduce((a, x) => a.concat(x.dates.map(d => d.iso)), []).sort();
    if (!fields.startDate && allDates.length) fields.startDate = allDates[0];
    if (!fields.endDate && allDates.length > 1 && allDates[allDates.length - 1] > fields.startDate) {
      fields.endDate = allDates[allDates.length - 1];
    }
    const latinDate = lines.map(l => LATIN_MONTH_RE.exec(l)).find(Boolean);
    if (latinDate) {
      notes.push('วันที่: อ่านชื่อเดือนไม่ออกบางจุด (เช่น “' + latinDate[0] + '”) — ตรวจวันที่กับกรมธรรม์');
    }

    /* ตารางผลประโยชน์: แถวแรก = ความคุ้มครองหลัก แถวถัดไป = สัญญาเพิ่มเติม */
    const rows = scanBenefitRows(lines);
    const main = rows.find(r => RE.mainRow.test(r.text) && !RE.riderWord.test(r.text)) || rows.find(r => RE.mainRow.test(r.text)) || rows[0];
    const riderRows = rows.filter(r => r !== main && r.amounts.length);

    /* ทุนประกัน */
    let sum = '';
    lines.some((l, i) => {
      if (!RE.sumLabel.test(l)) return false;
      /* ตัวเลขอาจอยู่บรรทัดเดียวกันหรือบรรทัดถัดไป */
      let a = amountsOf(l);
      if (!a.length) a = amountsOf(lines[i + 1] || '');
      a = a.filter(v => v >= 1000);
      if (a.length) sum = a[0];
      return !!sum;
    });
    if (!sum && main && main.amounts.length) sum = main.amounts[0];

    /* ระยะเวลาเอาประกัน / ชำระเบี้ย */
    let termPay = main && main.termPay;
    if (!termPay) {
      const own = lines.filter(l => !RE.riderWord.test(l)).join('\n');  /* ไม่เอา "ระยะเวลาเอาประกันภัย 1 ปี" ของหมายเหตุสัญญาเพิ่มเติม */
      const t = RE.term.exec(own), p = RE.pay.exec(own);
      if (t || p) termPay = [t ? Number(t[1]) : '', p ? Number(p[1]) : ''];
    }
    if (termPay) {
      if (termPay[0]) fields.term = termPay[0] + ' ปี';
      if (termPay[1]) fields.payYears = termPay[1];
    }
    /* วันที่ที่ขัดกันเอง = OCR อ่านตัวเลขผิด (มักเป็นเงาบนรูป) */
    if (fields.endDate && fields.startDate && fields.endDate <= fields.startDate) {
      fields.endDate = '';
      notes.push('วันครบสัญญาที่อ่านได้อยู่ก่อนวันเริ่ม — ตรวจวันที่เริ่ม');
    } else if (fields.endDate && fields.startDate && termPay && termPay[0] &&
        Math.abs(daysBetween(addMonthsIso(fields.startDate, termPay[0] * 12), fields.endDate)) > 31) {
      notes.push('วันเริ่มกับวันครบสัญญาไม่ตรงกับระยะเวลา ' + termPay[0] + ' ปี — ตรวจวันที่เริ่ม');
    }
    if (!fields.endDate && fields.startDate && termPay && termPay[0]) {
      fields.endDate = addMonthsIso(fields.startDate, termPay[0] * 12);
    }

    /* เบี้ยประกัน: บรรทัด "เบี้ยประกันภัยรวม" ก่อน แล้วรวมจากตาราง */
    let premium = '', totalFromLine = false;
    lines.some(l => {
      if (!RE.premTotal.test(l)) return false;
      const a = amountsOf(l).filter(v => v > 0);
      if (a.length) { premium = a[a.length - 1]; totalFromLine = true; }
      return !!premium;
    });
    /* เบี้ยต่ำกว่า 100 บาท = ตัวเลขขาดหาย (เช่น "21,00" จาก 21,000.00) — ถือว่าอ่านไม่ได้ */
    const rowPrem = r => (r && r.amounts.length > 1 && r.amounts[1] >= 100 ? r.amounts[1] : 0);
    if (!premium) {
      const parts = [main].concat(riderRows).map(rowPrem).filter(v => v > 0);
      if (parts.length) premium = Math.round(parts.reduce((s, v) => s + v, 0) * 100) / 100;
    }
    fields.premium = premium;

    /* งวดชำระ: เฉพาะบรรทัดที่พูดถึงการชำระ */
    const payLine = lines.filter(l => RE.payLine.test(l)).join(' ');
    fields.premiumMode = RE.single.test(payLine) ? 'ชำระครั้งเดียว'
      : RE.quarterly.test(payLine) ? 'ราย 3 เดือน'
      : RE.halfYear.test(payLine) ? 'ราย 6 เดือน'
      : RE.monthly.test(payLine) ? 'รายเดือน'
      : RE.yearly.test(payLine) ? 'รายปี' : '';
    if (!fields.premiumMode && RE.singleAny.test(all)) fields.premiumMode = 'ชำระครั้งเดียว';

    /* ความคุ้มครอง: ทุนประกันหลัก + สัญญาเพิ่มเติม */
    const coverages = [];
    if (sum) coverages.push({ category: 'ทุนประกัน', detail: '', amount: sum, unit: '' });
    const riders = riderRows.map(r => {
      const rule = (r.code && RIDER_RULES.find(x => x[0].test(r.code))) || RIDER_RULES.find(x => x[0].test(r.text));
      const name = tidyName(r.text.replace(new RegExp('^[^\\u0E01-\\u0E2E]*' + tol('สัญญาเพิ่มเติม') + '\\s*'), '')).slice(0, 60) || r.code;
      coverages.push({ category: rule ? rule[1] : OTHER, detail: r.code || r.text.slice(0, 40), amount: r.amounts[0], unit: '' });
      return { category: rule ? rule[1] : OTHER, code: r.code, name: name, amount: r.amounts[0], premium: rowPrem(r) };
    });

    return {
      fields: fields, coverages: coverages, insuredName: insuredName, notes: notes,
      sum: sum, riders: riders, mainPremium: rowPrem(main), totalFromLine: totalFromLine,
      termYears: termPay && termPay[0] ? Number(termPay[0]) : 0,
    };
  }

  /* ═══════════════ ข้อความที่อ่านได้ → กรมธรรม์ของ 448app ═══════════════ */
  const TYPE_RULES = [
    [/บำนาญ|annuity/i, 'บำนาญ'],
    [/ยูนิต\s*ลิงค์|ยูนิต\s*ลิงก์|unit\s*link|อิสระ|issara|อินฟินิท|infinite|เวลท์|เวลธ์|wealth/i, 'Unit Linked'],
    [/สะสมทรัพย์|ออมทรัพย์|เอ็นดาวเม้นท์|endowment|เซฟวิ่ง|saving/i, 'สะสมทรัพย์'],
    [/ชั่วระยะเวลา|เทอม|\bterm\b/i, 'ทุนชีวิต'],
    [/อุบัติเหตุ|\bPA\b/, 'PA'],
    [/โรคร้ายแรง|มะเร็ง|แคนเซอร์|\bCI\b/, 'โรคร้ายแรง'],
    [/สุขภาพ|health/i, 'สุขภาพ'],
    [/ตลอดชีพ|เพย์\s*ไลฟ์|pay\s*life|whole\s*life/i, 'ตลอดชีพ'],
  ];
  function guessType(planName) {
    const rule = TYPE_RULES.find(x => x[0].test(planName || ''));
    return rule ? rule[1] : '';
  }
  const fmtBaht = n => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  function fmtThaiDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const mon = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][Number(m[2]) - 1];
    return Number(m[3]) + ' ' + mon + ' ' + (Number(m[1]) + 543);
  }
  const rid = () => 'rd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* หมวดของตารางสรุป → สัญญาเพิ่มเติมของ 448app (ช่องที่หน้าสรุป/กราฟใยแมงมุมอ่าน)
     เหมาจ่ายต่อปี: วงเงินต่อครั้ง = วงเงินต่อปี (ไม่มีวงเงินย่อยต่อครั้ง) */
  const RIDER_MAP = {
    'ค่ารักษาเหมาจ่าย': a => ({ type: 'medical', treatmentType: 'เหมาจ่าย', perYear: a, perVisit: a }),
    'ค่าห้อง': a => ({ type: 'medical', treatmentType: 'ตามตาราง', roomMeal: a }),
    'HB': a => ({ type: 'income', dailyComp: a }),
    'CI/ECIR': a => ({ type: 'critical', ciSevere: a }),
    'AI': a => ({ type: 'accident', deathByAccident: a }),
    'ทุพพลภาพ': a => ({ type: 'disability', disabilityAmt: a }),
  };

  /**
   * parsed (จาก parseText) + ลูกค้า → { policy, warnings[], info[], extra }
   * ctx: { clientName, dob, policies (กรมธรรม์เดิมของลูกค้า) }
   * หมายเหตุ: ไม่เติมช่อง end ("วันที่ชำระเบี้ยครั้งสุดท้าย") — แสดงวันครบสัญญาและวันชำระงวดสุดท้ายไว้ใน extra ให้ผู้ใช้เลือกกรอก
   */
  function toPolicy(parsed, ctx) {
    ctx = ctx || {};
    const f = parsed.fields, warnings = parsed.notes.slice(), info = [];
    const mode = MODES.find(m => m.key === f.premiumMode) || MODES[0];
    const p = { type: guessType(f.planName) || 'ตลอดชีพ', riders: [] };
    if (f.policyNo) p.number = f.policyNo;
    if (f.planName) p.name = f.planName;
    if (f.company) p.company = f.company;
    if (f.startDate) p.start = f.startDate;
    if (parsed.sum) p.lifeCoverage = parsed.sum;
    if (f.payYears) p.payYearsMain = Number(f.payYears);

    /* เบี้ย: สัญญาหลักแยกจากสัญญาเพิ่มเติม แล้วคูณจำนวนงวดต่อปี */
    const riderPrem = parsed.riders.reduce((s, r) => s + (r.premium || 0), 0);
    const total = Number(f.premium) || 0;
    let mainPrem = parsed.mainPremium || 0;
    /* ไม่มีเบี้ยของแถวสัญญาหลัก: ใช้ได้เฉพาะเมื่อมีบรรทัด "เบี้ยรวม" ในรูป (ยอดที่บวกจากแถวสัญญาเพิ่มเติมไม่ใช่เบี้ยสัญญาหลัก) */
    if (!mainPrem && total && parsed.totalFromLine) {
      if (riderPrem > 0 && total > riderPrem) mainPrem = Math.round((total - riderPrem) * 100) / 100;
      else {
        mainPrem = total;
        if (parsed.riders.length) warnings.push('แยกเบี้ยสัญญาหลักไม่ได้ — ช่องเบี้ยประกันเป็นเบี้ยรวมทั้งกรมธรรม์ ตรวจและแบ่งเบี้ยสัญญาเพิ่มเติมเอง');
      }
    }
    if (mainPrem) p.premium = Math.round(mainPrem * mode.perYear * 100) / 100;
    if (parsed.totalFromLine && parsed.mainPremium && Math.abs(parsed.mainPremium + riderPrem - total) > 1) {
      warnings.push('เบี้ยรวมในรูป ' + fmtBaht(total) + ' ไม่เท่ากับผลรวมรายบรรทัด ' + fmtBaht(parsed.mainPremium + riderPrem) + ' — ตรวจตัวเลขเบี้ยทุกบรรทัด');
    }
    if (!f.premiumMode) warnings.push('ไม่พบงวดชำระในรูป — ถือเป็นรายปีไว้ก่อน ถ้าชำระรายเดือนให้คูณเบี้ยเป็นต่อปี');
    else if (mode.perYear > 1) info.push('เบี้ยในรูปเป็น' + mode.key + ' — คูณ ' + mode.perYear + ' เป็นเบี้ยต่อปีให้แล้ว');

    /* สัญญาเพิ่มเติม */
    const skipped = [];
    parsed.riders.forEach(r => {
      const make = RIDER_MAP[r.category];
      if (!make || !(r.amount > 0)) { skipped.push(r.name + (r.amount ? ' ' + fmtBaht(r.amount) : '')); return; }
      const rider = Object.assign({ id: rid(), name: r.name, payToAge: '', coverToAge: '', premium: '' }, make(r.amount));
      if (r.premium) rider.premium = Math.round(r.premium * mode.perYear * 100) / 100;
      p.riders.push(rider);
    });
    if (skipped.length) warnings.push('สัญญาเพิ่มเติมที่ยังไม่ได้เติม (จัดหมวดไม่ได้): ' + skipped.join(' · ') + ' — เพิ่มเองถ้าต้องการ');

    /* ประเภท */
    if (!guessType(f.planName)) info.push('ประเภท: ตั้งเป็น “ตลอดชีพ” ไว้ก่อน — เลือกให้ตรงกับแบบประกัน');

    /* คุ้มครองถึงอายุ: อายุตอนเริ่ม (ปัดเศษ 6 เดือน) + ระยะเวลาเอาประกัน */
    let covAge = null;
    if (ctx.dob && f.startDate && parsed.termYears) {
      const a = ageNearest(ctx.dob, f.startDate);
      if (a != null) covAge = a + parsed.termYears;
    } else if (ctx.dob && f.endDate) covAge = ageNearest(ctx.dob, f.endDate);
    if (covAge != null && covAge >= 1 && covAge <= 120) {
      p.covUpToAge = covAge;
      info.push('คุ้มครองถึงอายุ ' + covAge + ' ปี คำนวณจากวันเกิดลูกค้ากับ' + (parsed.termYears ? 'ระยะเวลาเอาประกัน ' + parsed.termYears + ' ปี' : 'วันครบสัญญา') + ' — ตรวจกับกรมธรรม์');
    }

    /* ตรวจกับข้อมูลลูกค้า */
    if (parsed.insuredName && ctx.clientName && !sameName(parsed.insuredName, ctx.clientName)) {
      warnings.push('ชื่อผู้เอาประกันในรูป “' + parsed.insuredName + '” ไม่ตรงกับลูกค้า “' + ctx.clientName + '”');
    }
    if (f.policyNo && (ctx.policies || []).some(x => normPolicyNo(x.number) === normPolicyNo(f.policyNo))) {
      warnings.push('ลูกค้ารายนี้มีกรมธรรม์เลขที่ ' + f.policyNo + ' อยู่แล้ว');
    }
    const missing = [['number', 'หมายเลขกรมธรรม์'], ['name', 'แบบประกัน'], ['company', 'บริษัท'], ['start', 'วันที่เริ่ม'], ['premium', 'เบี้ยประกัน']]
      .filter(x => !p[x[0]]).map(x => x[1]);
    if (missing.length) warnings.push('อ่านไม่พบ: ' + missing.join(', ') + ' — กรอกเอง');

    /* วันที่ที่เกี่ยวกับช่อง "วันที่ชำระเบี้ยครั้งสุดท้าย" — ให้ผู้ใช้เลือกกรอกเอง */
    const extra = { contractEnd: f.endDate || '', lastPremium: '', term: f.term || '', mode: f.premiumMode || '' };
    if (f.startDate && f.payYears) {
      extra.lastPremium = mode.single ? f.startDate : addMonthsIso(f.startDate, Number(f.payYears) * 12 - mode.months);
    }
    const filled = ['number', 'name', 'company', 'lifeCoverage', 'premium', 'start', 'payYearsMain', 'covUpToAge'].filter(k => p[k]).length + p.riders.length;
    return { policy: p, warnings: warnings, info: info, extra: extra, filled: filled };
  }

  /* ═══════════════ เตรียมรูป ═══════════════ */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG / PNG)'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปนี้ไม่ได้ — ลองถ่ายใหม่หรือเลือกไฟล์ JPG/PNG')); };
      img.src = url;
    });
  }
  /** วาดรูปลง canvas: ย่อด้านยาวไม่เกิน max และหมุนทีละ 90° (quarter = 0–3) */
  function drawScaled(img, max, quarter) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const q = ((quarter || 0) % 4 + 4) % 4, swap = q % 2 === 1;
    const cv = document.createElement('canvas');
    cv.width = swap ? h : w; cv.height = swap ? w : h;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.translate(cv.width / 2, cv.height / 2);
    g.rotate(q * Math.PI / 2);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    return cv;
  }
  /** canvas → JPEG ไม่เกิน maxBytes (ลดคุณภาพทีละขั้น) */
  function jpegUnder(img, quarter, maxBytes) {
    for (const [max, quality] of [[OCR_MAX_SIDE, 0.85], [1800, 0.8], [1500, 0.75], [1280, 0.7]]) {
      const dataUrl = drawScaled(img, max, quarter).toDataURL('image/jpeg', quality);
      if ((dataUrl.length - 23) * 0.75 <= maxBytes) return dataUrl;
    }
    throw new Error('รูปใหญ่เกินไป — ลองถ่ายใหม่ให้เห็นเฉพาะหน้ากรมธรรม์');
  }
  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(','), bin = atob(parts[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: (/data:([^;]+)/.exec(parts[0]) || [])[1] || 'image/jpeg' });
  }

  /* ═══════════════ ตัวอ่านในเครื่อง (tesseract.js) ═══════════════ */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('โหลดตัวอ่านไม่ได้ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่'));
      document.head.appendChild(s);
    });
  }
  let _tessLoading = null, _worker = null, _workerTimer = null, _onProgress = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!_tessLoading) _tessLoading = loadScript(TESS_URL).catch(e => { _tessLoading = null; throw e; });
    return _tessLoading;
  }
  function releaseLocal() {
    clearTimeout(_workerTimer); _workerTimer = null;
    const w = _worker; _worker = null;
    if (w) { try { w.terminate(); } catch (e) {} }
  }
  /** onProgress({ stage: 'load' | 'read', pct }) */
  async function ocrLocal(dataUrl, onProgress) {
    clearTimeout(_workerTimer);
    _onProgress = onProgress || null;
    if (_onProgress) _onProgress({ stage: 'load', pct: 0 });
    await loadTesseract();
    try {
      if (!_worker) {
        _worker = await window.Tesseract.createWorker('tha+eng', 1, {
          logger: m => {
            if (!_onProgress || !m) return;
            const pct = Math.round((m.progress || 0) * 100);
            _onProgress({ stage: m.status === 'recognizing text' ? 'read' : 'load', pct: pct });
          },
        });
        /* 6 = ถือทั้งหน้าเป็นบล็อกเดียว → แถวของตารางอยู่บรรทัดเดียวกัน (ชื่อ + จำนวนเงิน + เบี้ย)
           ไม่ตั้ง thresholding_method (1/2 ค้างใน wasm รุ่นนี้ — ทดสอบแล้ว) */
        await _worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      }
      /* กันค้าง: เกินเวลาแล้วปิดตัวอ่านทิ้ง ผู้ใช้กดอ่านใหม่ได้ */
      let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), LOCAL_TIMEOUT_MS); });
      try {
        const r = await Promise.race([_worker.recognize(dataUrl), timeout]);
        return String((r && r.data && r.data.text) || '');
      } finally { clearTimeout(timer); }
    } catch (e) {
      releaseLocal();
      throw new Error(e && e.message === 'timeout'
        ? 'อ่านรูปนี้นานเกินไป — ลองถ่ายใหม่ให้ใกล้และชัดขึ้น'
        : 'อ่านข้อความจากรูปไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      _onProgress = null;
      clearTimeout(_workerTimer);
      if (_worker) _workerTimer = setTimeout(releaseLocal, LOCAL_IDLE_MS);
    }
  }

  /* ═══════════════ ตัวอ่านของ Google (Drive OCR ในบัญชีของผู้ใช้เอง) ═══════════════ */
  const cfg = () => window.AIA_DRIVE || {};
  function googleAvailable() { return !!cfg().clientId && cfg().ocrGoogle !== false; }
  let _gisLoading = null;
  /** เรียกตอนเปิดหน้าต่างอ่านรูป — ให้ GIS พร้อมก่อนผู้ใช้กดปุ่ม (popup ต้องเปิดจากการกดโดยตรง) */
  function prepareGoogle() {
    if (!googleAvailable()) return Promise.resolve(false);
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve(true);
    if (!_gisLoading) _gisLoading = loadScript(GIS_URL).catch(e => { _gisLoading = null; throw e; });
    return _gisLoading.then(() => true, () => false);
  }
  function readToken() {
    try {
      const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      return t && t.token && t.exp > Date.now() + 60000 ? t.token : '';
    } catch (e) { return ''; }
  }
  function requestToken() {
    const cached = readToken();
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      const o2 = window.google && window.google.accounts && window.google.accounts.oauth2;
      if (!o2) return reject(new Error('ยังโหลดส่วนเชื่อมต่อ Google ไม่เสร็จ — รอสักครู่แล้วกดอีกครั้ง'));
      let done = false;
      const fail = msg => { if (!done) { done = true; reject(new Error(msg)); } };
      /* บัญชี Google ที่ผู้ใช้เคยเชื่อมกับการสำรองข้อมูล — ให้ Google เลือกบัญชีเดิมให้ */
      let hint = '';
      try { hint = localStorage.getItem('aia_drive_hint') || ''; } catch (e) {}
      const client = o2.initTokenClient({
        client_id: cfg().clientId, scope: OCR_SCOPE, prompt: '', login_hint: hint, hint: hint,
        callback: resp => {
          if (done) return;
          if (!resp || resp.error || !resp.access_token) return fail('Google ไม่ได้ให้สิทธิ์อ่านรูป — ใช้ “อ่านในเครื่อง” แทนได้');
          if (o2.hasGrantedAllScopes && !o2.hasGrantedAllScopes(resp, OCR_SCOPE)) return fail('ยังไม่ได้ติ๊กอนุญาตสิทธิ์ไฟล์ Google Drive — กดอีกครั้งแล้วติ๊กอนุญาต หรือใช้ “อ่านในเครื่อง”');
          done = true;
          try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 })); } catch (e) {}
          resolve(resp.access_token);
        },
        error_callback: err => fail(err && err.type === 'popup_failed_to_open'
          ? 'เบราว์เซอร์บล็อกหน้าต่างของ Google — อนุญาต popup แล้วกดอีกครั้ง หรือใช้ “อ่านในเครื่อง”'
          : 'ปิดหน้าต่างของ Google ก่อนเสร็จ — กดอีกครั้ง หรือใช้ “อ่านในเครื่อง”'),
      });
      client.requestAccessToken();
    });
  }
  /** ต้องเรียกจากการกดปุ่มของผู้ใช้ (ครั้งแรก Google จะเปิดหน้าต่างขอสิทธิ์) */
  async function ocrGoogle(dataUrl) {
    const token = await requestToken();
    const blob = dataUrlToBlob(dataUrl);
    if (blob.size > 2 * 1024 * 1024) throw new Error('รูปใหญ่เกิน 2 MB — ถ่ายใหม่ให้เห็นเฉพาะหน้ากรมธรรม์');
    const auth = { Authorization: 'Bearer ' + token };
    const boundary = 'mm' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: '448app-ocr-temp', mimeType: 'application/vnd.google-apps.document' });
    const body = new Blob([
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
      '\r\n--' + boundary + '\r\nContent-Type: ' + blob.type + '\r\n\r\n', blob, '\r\n--' + boundary + '--',
    ]);
    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=th&fields=id', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'multipart/related; boundary=' + boundary }, auth), body: body,
    });
    if (!up.ok) {
      if (up.status === 401) { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }
      const txt = await up.text().catch(() => '');
      if (/has not been used|is disabled|SERVICE_DISABLED/.test(txt)) throw new Error('ยังไม่ได้เปิด Google Drive API ในโปรเจกต์ — แจ้งผู้ดูแลระบบ');
      throw new Error('ส่งรูปให้ Google อ่านไม่สำเร็จ (รหัส ' + up.status + ') — ลองใหม่ หรือใช้ “อ่านในเครื่อง”');
    }
    const id = (await up.json()).id;
    try {
      const out = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '/export?mimeType=text/plain', { headers: auth });
      if (!out.ok) throw new Error('ดึงข้อความจาก Google ไม่สำเร็จ (รหัส ' + out.status + ') — ลองใหม่ หรือใช้ “อ่านในเครื่อง”');
      return (await out.text()).replace(BOM_RE, '');
    } finally {
      /* ไฟล์ชั่วคราวที่แอปสร้างเอง — ลบถาวร ไม่ให้สำเนาข้อมูลลูกค้าค้างใน Drive */
      try { await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id), { method: 'DELETE', headers: auth }); } catch (e) {}
    }
  }

  /* ═══════════════ งานรวม: รูป → กรมธรรม์ ═══════════════ */
  /**
   * opts: { engine: 'local' | 'google', quarter, onProgress, ctx (ดู toPolicy), companies }
   * คืน { policy, warnings, info, extra, filled, text, engine }
   */
  async function readPolicy(img, opts) {
    opts = opts || {};
    const engine = opts.engine === 'google' ? 'google' : 'local';
    const dataUrl = jpegUnder(img, opts.quarter || 0, GOOGLE_MAX_BYTES);
    const text = engine === 'google' ? await ocrGoogle(dataUrl) : await ocrLocal(dataUrl, opts.onProgress);
    if (!thaiNorm(text).trim()) throw new Error('อ่านข้อความจากรูปไม่ได้ — ลองถ่ายใหม่ให้ตรง ชัด และไม่มีเงา');
    const res = toPolicy(parseText(text, opts.companies), opts.ctx);
    res.text = thaiNorm(text).slice(0, 8000);
    res.engine = engine;
    return res;
  }

  window.PolicyScan = {
    loadImage, drawScaled, readPolicy, parseText, toPolicy, googleAvailable, prepareGoogle, releaseLocal,
    fmtThaiDate, MODES,
    _test: { thaiNorm, cleanLine, scanDates, toAmount, amountsOf, addMonthsIso, ageNearest, guessType, sameName, tol, ocrLocal, ocrGoogle, jpegUnder, dataUrlToBlob, TOKEN_KEY },
  };
})();
