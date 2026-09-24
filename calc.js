/* calc.js — สูตรคำนวณกลางของ Money Match (ทุกหน้าและ PDF เรียกใช้ชุดเดียวกัน)
   ─────────────────────────────────────────────────────────────────
   ทำไม: เดิมสูตรเดียวกันถูกเขียนซ้ำ 2–4 ที่ (หน้า ↔ PDF ↔ หน้าอื่น เช่น เกษียณ การศึกษา ภาษี FV สุขภาพ)
        แก้ครั้งหนึ่งต้องแก้หลายจุด และเคยให้ตัวเลขไม่ตรงกัน
   กติกา: ฟังก์ชันที่นี่เป็น pure — รับ client/object คืนตัวเลข ไม่แตะ DOM / localStorage
          หน้าเดิมเก็บชื่อฟังก์ชันไว้เป็น wrapper บาง ๆ ที่เรียก window.CALC
   ทดสอบ: tests.html (73+ รายการ) — แก้สูตรที่นี่แล้วรันทุกครั้ง

   สารบัญ
     1. ทั่วไป      ageYears · ageInt · incomeAnnual · annualContrib · fv · assetFV
     2. เกษียณ      retirementPlan · retirementAssets · retirementDerived · retirementIncomeAfter · retirement
     3. การศึกษา    EDU_* · eduCostTable · eduStageCost · eduUniLevel · childEducation · childRearing · childTotalCost
     4. ภาษี        TAX_* · taxIncome · taxExpenseDetail · taxExpense · taxBracket · taxValue · taxScope
     5. สุขภาพ/ทุน  HEALTH_ROWS · healthRecommend · healthFromPolicies · healthCalc · recommendCoverage · legacyCover
*/
(function () {
  if (window.CALC) return;

  /* ค่าว่าง ('' / null / ไม่ใช่ตัวเลข) → ค่าเริ่มต้น (กัน '' กลายเป็น 0 เช่น อายุเกษียณ) */
  const num = (v, d) => { const n = Number(v); return (v === '' || v == null || !isFinite(n)) ? (d == null ? 0 : d) : n; };
  const sum = (arr, f) => (arr || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);

  /* ═══════════════════════════════════════════════
     1. ทั่วไป
  ═══════════════════════════════════════════════ */
  /* อายุแบบทศนิยมตามปฏิทินจริง: ปีเต็ม + เศษของปีนับจากวันเกิดล่าสุด
     floor() ตรงกับอายุปีเต็มเสมอ (หาร 365.25 เคยต่างกัน 1 ปีใกล้วันเกิด) · วันเกิดผิดรูปแบบ → null */
  function ageYears(dob) {
    if (!dob) return null;
    const bd = new Date(dob);
    if (isNaN(bd)) return null;
    const now = new Date();
    let years = now.getFullYear() - bd.getFullYear();
    const last = new Date(bd); last.setFullYear(bd.getFullYear() + years);
    if (last > now) { years--; last.setFullYear(bd.getFullYear() + years); }
    const next = new Date(last); next.setFullYear(last.getFullYear() + 1);
    return years + (now - last) / (next - last);
  }
  function ageInt(dob) { const a = ageYears(dob); return a == null ? null : Math.floor(a); }

  /* รายได้ต่อปี: ช่อง "รายได้ต่อปี" ในข้อมูลลูกค้า → ไม่มีใช้รายได้ต่อเดือนจากกระแสเงินสด × 12 */
  function incomeAnnual(client) {
    client = client || {};
    const cf = client.cashflow || {};
    return Number(client.income) || (Number(cf.income) || 0) * 12 || 0;
  }

  /* เงินสมทบต่อปีของสินทรัพย์ (contribFreq 'monthly' → × 12) */
  function annualContrib(a) {
    const v = Number((a && a.contribution) || 0);
    return (a && a.contribFreq === 'monthly') ? v * 12 : v;
  }

  /* มูลค่าอนาคต — เงินต้น + เงินสมทบต้นงวด (annuity-due)
     รายเดือน: ทบต้นรายเดือนทั้งเงินต้นและเงินออม · รายปี: ทบต้นรายปี */
  function fv(pv, ratePct, years, pmt, freq) {
    pv = Number(pv) || 0;
    const rate = (Number(ratePct) || 0) / 100;
    years = Number(years) || 0;
    pmt = Number(pmt) || 0;
    if (years <= 0) return pv;
    if (freq === 'monthly' && pmt > 0) {
      const r_m = rate / 12, n_m = years * 12;
      const factor_m = Math.pow(1 + r_m, n_m);
      if (r_m === 0) return pv + pmt * n_m;
      return pv * factor_m + pmt * (factor_m - 1) / r_m * (1 + r_m);
    }
    const factor = Math.pow(1 + rate, years);
    if (rate === 0) return pv + pmt * years;
    return pv * factor + pmt * (factor - 1) / rate * (1 + rate);
  }
  function assetFV(a, years) {
    return fv(a.currentValue, a.expectedReturn, years, a.contribution, a.contribFreq || 'annual');
  }

  /* ═══════════════════════════════════════════════
     2. เกษียณ  (= retirement2.html เดิม — หน้าสรุปแผนเกษียณ / PDF / Simulator)
  ═══════════════════════════════════════════════ */
  const RET_DEFAULT = {
    retireAge: 60, lifeExpectancy: 85, incomePctAfterRetire: 70,
    annualSpend: 0, inflationRate: 3, expectedReturn: 5,
    preserveCapital: false, withdrawalRate: 4, monthlyContribution: 0, note: '',
  };
  function retirementPlan(client) {
    const s = (client && client.retirementPlan) || {};
    const er = num(s.expectedReturn, RET_DEFAULT.expectedReturn);
    return {
      retireAge:            num(s.retireAge, num(client && client.retirementAge, RET_DEFAULT.retireAge)),
      lifeExpectancy:       num(s.lifeExpectancy, RET_DEFAULT.lifeExpectancy),
      incomePctAfterRetire: num(s.incomePctAfterRetire, RET_DEFAULT.incomePctAfterRetire),
      annualSpend:          num(s.annualSpend, 0),
      inflationRate:        num(s.inflationRate, RET_DEFAULT.inflationRate),
      expectedReturn:       er,
      /* ถ้ายังไม่เคยตั้ง returnBefore/After ใช้ expectedReturn เป็นค่าตั้งต้น */
      returnBefore:         num(s.returnBefore, er),
      returnAfter:          num(s.returnAfter, Math.max(er - 1, 1)),
      preserveCapital:      !!s.preserveCapital,
      withdrawalRate:       num(s.withdrawalRate, RET_DEFAULT.withdrawalRate),
      monthlyContribution:  num(s.monthlyContribution, 0),
      note:                 String(s.note == null ? '' : s.note),
    };
  }
  const RET_TYPES = ['pvd', 'rmf', 'ssf', 'thaiesg', 'annuity'];
  /* สินทรัพย์ที่ให้กระแสเงินสดหลังเกษียณ (บำนาญ/ค่าเช่า ที่กรอก "กระแสเงินสดรับ") นับเป็นรายได้หลังเกษียณอย่างเดียว */
  function isIncomeAsset(a) { return Number((a && a.cashFlow) || 0) > 0; }
  /* เงินเกษียณ: PVD/RMF/SSF/ThaiESG/ประกันบำนาญ หรือติ๊ก "แผนเกษียณ" · ไม่นับที่ติ๊ก "การศึกษา" · ไม่นับสินทรัพย์กระแสเงินสด */
  function retirementAssets(client) {
    return ((client && client.assets) || []).filter(a =>
      (RET_TYPES.includes(a.type) || a.appliedTo === 'retire') && a.appliedTo !== 'education' && !isIncomeAsset(a));
  }
  /* yearsToRetire: โตทุกสินทรัพย์ถึงวันเกษียณ · ไม่ส่งมา → ใช้ช่อง "ระยะเวลา" ของสินทรัพย์ (หน้าสินทรัพย์) */
  function retirementDerived(client, yearsToRetire) {
    const retireAssets = retirementAssets(client);
    return {
      annualIncome: incomeAnnual(client),
      currentSavings: sum(retireAssets, a => a.currentValue),
      fvCurrentSavings: retireAssets.reduce((s, a) => s + assetFV(a, yearsToRetire == null ? a.term : yearsToRetire), 0),
      currentMonthlyContrib: sum(retireAssets, annualContrib) / 12,
      retireAssets,
    };
  }
  /* รายได้หลังเกษียณ/ปี = กระแสเงินสดรับต่อเดือน × 12 ของบำนาญ/อสังหาฯ/ที่ติ๊กแผนเกษียณ */
  function retirementIncomeAfter(client) {
    return sum(((client && client.assets) || []).filter(a =>
      (['annuity', 'realestate'].includes(a.type) || a.appliedTo === 'retire') && a.appliedTo !== 'education'),
      a => a.cashFlow) * 12;
  }
  /* opts.fallbackAge: ใช้เมื่อไม่มีวันเกิด (PDF ใช้ 30) · ไม่ส่ง → คืน null เมื่อไม่มีวันเกิด */
  function retirement(client, opts) {
    client = client || {};
    const plan = retirementPlan(client);
    let currentAge = ageYears(client.dob);
    if (currentAge == null) {
      if (!opts || opts.fallbackAge == null) return null;
      currentAge = opts.fallbackAge;
    }
    /* ใช้อายุปีเต็ม (floor) ให้ "ระยะเวลาถึงเกษียณ" ตรงกับอายุที่แสดง */
    const ageFloor = Math.floor(currentAge);
    const yearsBefore = Math.max(plan.retireAge - ageFloor, 0);
    const yearsAfter  = Math.max(plan.lifeExpectancy - plan.retireAge, 1);
    const derived = retirementDerived(client, yearsBefore);

    const annualSpendNow = plan.annualSpend > 0 ? plan.annualSpend : derived.annualIncome * (plan.incomePctAfterRetire / 100);
    const annualSpendAtRetire = annualSpendNow * Math.pow(1 + plan.inflationRate / 100, yearsBefore);
    /* กองทุนรองรับเฉพาะส่วนที่รายได้หลังเกษียณ (บำนาญ/ค่าเช่า) ยังไม่ครอบคลุม */
    const annualIncomeAfter = retirementIncomeAfter(client);
    const netSpendAtRetire = Math.max(annualSpendAtRetire - annualIncomeAfter, 0);
    const cashFlowGap = netSpendAtRetire;

    let targetCorpus;
    if (plan.preserveCapital && plan.withdrawalRate > 0) {
      targetCorpus = netSpendAtRetire / (plan.withdrawalRate / 100);          /* กฎ withdrawal rate (เช่น 4%) — คงเงินต้น */
    } else {
      const realRate = (1 + plan.returnAfter / 100) / (1 + plan.inflationRate / 100) - 1;
      targetCorpus = Math.abs(realRate) < 0.0001
        ? netSpendAtRetire * yearsAfter
        : netSpendAtRetire * (1 - Math.pow(1 + realRate, -yearsAfter)) / realRate;   /* PV ของเงินถอนปลายปี ถอนจนหมดที่อายุขัย */
    }

    const rB = plan.returnBefore / 100;
    const fvTotal = derived.fvCurrentSavings;
    const gap = targetCorpus - fvTotal;
    let reqAnnual = 0;
    if (gap > 0 && yearsBefore > 0) {
      reqAnnual = Math.abs(rB) < 0.0001 ? gap / yearsBefore : gap / ((Math.pow(1 + rB, yearsBefore) - 1) / rB);
    }

    const rA = plan.returnAfter / 100;
    let remaining;
    if (plan.preserveCapital && plan.withdrawalRate > 0) {
      remaining = targetCorpus;
    } else {
      /* จำลองการถอนใช้ปีต่อปี — เงินโตทั้งปีก่อนแล้วถอนปลายปี · ติดลบได้ (= กองทุนหมดก่อนอายุขัย) */
      let balance = fvTotal;
      for (let y = 0; y < yearsAfter; y++) {
        const yearSpend = annualSpendAtRetire * Math.pow(1 + plan.inflationRate / 100, y);
        balance = balance * (1 + rA) - (yearSpend - annualIncomeAfter);
      }
      remaining = balance;
    }
    const completionPct = targetCorpus > 0 ? Math.max(0, Math.min(100, (fvTotal / targetCorpus) * 100)) : 0;

    return {
      currentAge: ageFloor, retireAge: plan.retireAge, lifeExpectancy: plan.lifeExpectancy,
      yearsBefore: Math.round(yearsBefore), yearsAfter: Math.round(yearsAfter),
      annualSpendNow, annualSpendAtRetire, netSpendAtRetire,
      targetCorpus, fvTotal, gap, reqAnnual, reqMonthly: reqAnnual / 12, remaining,
      annualIncomeAfter, cashFlowGap,
      returnBefore: plan.returnBefore, returnAfter: plan.returnAfter, inflationRate: plan.inflationRate,
      withdrawalRate: plan.preserveCapital ? plan.withdrawalRate : 0, preserveCapital: plan.preserveCapital,
      completionPct, currentSavings: derived.currentSavings, plan, derived,
    };
  }

  /* ═══════════════════════════════════════════════
     3. การศึกษาบุตร  (= education.html เดิม — หน้าการศึกษาบุตร / PDF / แถวบุตรในประกันชีวิต / สรุปกรมธรรม์)
  ═══════════════════════════════════════════════ */
  const EDU_STAGES = [
    { key: 'kinder',   label: 'อนุบาล',        icon: '🧸', startAge: 3,  years: 3 },
    { key: 'primary',  label: 'ประถม (ป.1-6)', icon: '📚', startAge: 6,  years: 6 },
    { key: 'mid',      label: 'มัธยมต้น',      icon: '🎒', startAge: 12, years: 3 },
    { key: 'high',     label: 'มัธยมปลาย',    icon: '🏫', startAge: 15, years: 3 },
    { key: 'bachelor', label: 'ปริญญาตรี',    icon: '🎓', startAge: 18, years: 4 },
    { key: 'master',   label: 'ปริญญาโท',     icon: '📜', startAge: 22, years: 2, optional: 'master' },
    { key: 'phd',      label: 'ปริญญาเอก',    icon: '👨‍🎓', startAge: 24, years: 3, optional: 'phd' },
  ];
  const EDU_LEVELS = [
    { key: 'economy', icon: '🏫', name: 'เริ่มต้น', desc: 'รัฐบาล/ทั่วไป' },
    { key: 'medium',  icon: '🏛️', name: 'กลาง',    desc: 'เอกชน/2-ภาษา' },
    { key: 'premium', icon: '🌐', name: 'จัดเต็ม', desc: 'อินเตอร์/นอก' },
  ];
  const LEVEL_INDEX = { economy: 0, medium: 1, premium: 2 };
  const EDU_LEVEL_NAME_TH = { economy: 'เริ่มต้น', medium: 'ทางสายกลาง', premium: 'จัดเต็ม' };
  const EDU_DEFAULT_INFLATION = 5;      /* % ต่อปี */
  const EDU_SAVINGS_RETURN = 0.04;      /* ผลตอบแทนเงินออมเพื่อการศึกษา */
  const REARING_END_AGE = 21;
  /* ตารางค่าใช้จ่ายต่อปี ตามช่วงอายุ × ระดับ [เริ่มต้น, กลาง, จัดเต็ม] — แก้ได้ต่อลูกค้าใน client.eduCostTable */
  const EDU_COST_KEYS = [
    { key: 'age_0_3',          label: 'ช่วง 0-3 ขวบ',                   ageMin: 0,  ageMax: 3,  category: 'living'  },
    { key: 'babysitter_0_3',   label: 'พี่เลี้ยงเด็กต่อปี 0-3 ขวบ',      ageMin: 0,  ageMax: 3,  category: 'care'    },
    { key: 'living_0_3',       label: 'ค่ากินอยู่+อุปกรณ์ 0-3 ขวบ',      ageMin: 0,  ageMax: 3,  category: 'living'  },
    { key: 'tuition_kp',       label: 'ค่าเทอมต่อปี อนุบาล-ประถม',      ageMin: 3,  ageMax: 12, category: 'tuition' },
    { key: 'living_kp',        label: 'ค่ากินอยู่+อุปกรณ์ อนุบาล-ประถม', ageMin: 3,  ageMax: 12, category: 'living'  },
    { key: 'tuition_mid',      label: 'ค่าเทอมต่อปี มัธยม',             ageMin: 12, ageMax: 18, category: 'tuition' },
    { key: 'living_mid',       label: 'ค่ากินอยู่+อุปกรณ์ มัธยม',        ageMin: 12, ageMax: 18, category: 'living'  },
    { key: 'tuition_bachelor', label: 'ค่าเทอมต่อปี ปริญญาตรี',          ageMin: 18, ageMax: 22, category: 'tuition' },
    { key: 'living_bachelor',  label: 'ค่ากินอยู่+อุปกรณ์ ปริญญาตรี',     ageMin: 18, ageMax: 22, category: 'living'  },
  ];
  const EDU_DEFAULT_COST_TABLE = {
    age_0_3:          [ 40000,  75000,  110000],
    babysitter_0_3:   [ 50000, 100000,  300000],
    living_0_3:       [ 55000, 150000,  650000],
    tuition_kp:       [ 17000, 175000,  800000],
    living_kp:        [ 55000, 150000,  650000],
    tuition_mid:      [ 19500, 200000, 1300000],
    living_mid:       [ 55000, 150000,  650000],
    tuition_bachelor: [ 35000, 300000, 3000000],
    living_bachelor:  [ 55000, 150000,  650000],
  };
  /* ค่าเทอม ป.โท/ป.เอก ต่อปี (แก้ได้ที่หน้าค่าเล่าเรียนมหาวิทยาลัย → client.eduCostTable.tuition_master/doctoral) */
  const EDU_HIGHER_FALLBACK = { tuition_master: [50000, 500000, 4750000], tuition_doctoral: [71000, 600000, 5000000] };

  const levelIdx = level => LEVEL_INDEX[level] != null ? LEVEL_INDEX[level] : 1;
  /* ตาราง K-12/ป.ตรี ของลูกค้า (รวม override) — คืนสำเนาใหม่เสมอ */
  function eduCostTable(client) {
    const custom = (client && client.eduCostTable) || {};
    const out = {};
    EDU_COST_KEYS.forEach(k => { out[k.key] = (Array.isArray(custom[k.key]) ? custom[k.key] : EDU_DEFAULT_COST_TABLE[k.key]).slice(); });
    return out;
  }
  /* ค่าเทอมตั้งต้นต่อปีของแต่ละช่วงชั้น ตามระดับ */
  function eduStageCost(client, stageKey, level) {
    const li = levelIdx(level);
    const k12 = { kinder: 'tuition_kp', primary: 'tuition_kp', mid: 'tuition_mid', high: 'tuition_mid', bachelor: 'tuition_bachelor' };
    if (k12[stageKey]) return Number((eduCostTable(client)[k12[stageKey]] || [0, 0, 0])[li] || 0);
    const uniKey = { master: 'tuition_master', phd: 'tuition_doctoral' }[stageKey];
    if (!uniKey) return 0;
    const custom = (client && client.eduCostTable) || {};
    const row = (Array.isArray(custom[uniKey]) && custom[uniKey][li] != null) ? custom[uniKey] : EDU_HIGHER_FALLBACK[uniKey];
    return Number(row[li] || 0);
  }
  /* ระดับของแต่ละปริญญา (รวมค่าจากหน้าค่าเล่าเรียนมหาวิทยาลัยและช่องติ๊กในหน้าการศึกษาบุตร)
     - ป.ตรี: bachelorLevel → ระดับของบุตร
     - ป.โท/ป.เอก: ติ๊ก "รวม" ในหน้าการศึกษาบุตร หรือเลือกระดับในหน้าค่าเล่าเรียน → นับ · ไม่มีทั้งคู่ → ข้าม (null) */
  function eduUniLevel(child, stageKey) {
    const base = child.level || 'medium';
    if (stageKey === 'bachelor') return child.bachelorLevel || base;
    if (stageKey === 'master')   return child.includeMaster ? (child.masterLevel || base) : (child.masterLevel || null);
    if (stageKey === 'phd')      return child.includePhd ? (child.doctoralLevel || base) : (child.doctoralLevel || null);
    return base;
  }
  /* สินทรัพย์ที่ติ๊ก "นำไปใช้กับ การศึกษาบุตร" → แบ่งเท่า ๆ ต่อบุตร */
  function eduAssetPerChild(client) {
    const children = (client && client.children) || [];
    if (!client || children.length === 0) return { lump: 0, monthly: 0 };
    const eduAssets = (client.assets || []).filter(a => a.appliedTo === 'education');
    const lump = sum(eduAssets, a => a.currentValue);
    const monthly = sum(eduAssets, a => annualContrib(a) / 12);
    return { lump: lump / children.length, monthly: monthly / children.length };
  }
  /* จำลองเงินออมปีต่อปี: เงินที่มีโต + ออมเข้ารายเดือน − ค่าเทอมของปีนั้น
     คืน { shortfall: ยอดที่ขาดรวม (ตามปีที่ต้องจ่ายจริง), surplus: เงินที่เหลือเมื่อจบ } */
  function simulateEduSavings(costByYear, lump, monthly, rate) {
    const r_m = rate / 12;
    const yearContrib = monthly > 0 ? (r_m > 0 ? monthly * (Math.pow(1 + r_m, 12) - 1) / r_m * (1 + r_m) : monthly * 12) : 0;
    let balance = Number(lump) || 0, shortfall = 0;
    for (let y = 0; y < costByYear.length; y++) {
      balance = balance * (1 + rate) + yearContrib - (costByYear[y] || 0);
      if (balance < 0) { shortfall += -balance; balance = 0; }
    }
    return { shortfall, surplus: balance };
  }
  /* แผนการศึกษาของบุตร 1 คน — คืน null ถ้าไม่มีวันเกิด */
  function childEducation(child, client) {
    child = child || {};
    const ageRaw = ageYears(child.dob || child.birthdate);
    if (ageRaw == null) return null;
    const age = Math.max(ageRaw, 0);
    const level = child.level || 'medium';
    const customCosts = child.customCosts || {};
    const inflationPct = num(child.inflationRate, EDU_DEFAULT_INFLATION);
    const INFL = inflationPct / 100;

    const costByYear = [];
    let k12Total = 0, uniTotal = 0;
    const uniBreakdown = {};
    const stages = [];
    EDU_STAGES.forEach(s => {
      const isUni = ['bachelor', 'master', 'phd'].includes(s.key);
      const stageLevel = isUni ? eduUniLevel(child, s.key) : level;
      if (!stageLevel) return;                                   /* ป.โท/ป.เอก ที่ไม่ได้เลือก */
      const custKey = s.key + '_' + stageLevel;
      const baseAnnualCost = customCosts[custKey] != null ? Number(customCosts[custKey]) : eduStageCost(client, s.key, stageLevel);
      const startAge = s.startAge, endAge = s.startAge + s.years;
      let yearsLeft = age >= endAge ? 0 : (age < startAge ? s.years : endAge - age);
      yearsLeft = Math.max(yearsLeft, 0);
      let futureCost = 0;
      if (yearsLeft > 0) {
        const yearOfStart = Math.max(startAge - age, 0);
        for (let i = 0; i < Math.ceil(yearsLeft); i++) {
          const yearFromNow = yearOfStart + i;
          const yearCost = baseAnnualCost * Math.pow(1 + INFL, yearFromNow) * Math.min(1, yearsLeft - i);
          futureCost += yearCost;
          const yb = Math.floor(yearFromNow);
          costByYear[yb] = (costByYear[yb] || 0) + yearCost;
        }
      }
      const status = age >= endAge ? 'passed' : (age >= startAge ? 'current' : 'future');
      stages.push(Object.assign({}, s, { level: stageLevel, baseAnnualCost, yearsLeft: Math.round(yearsLeft * 10) / 10, futureCost, status }));
      if (isUni) { uniTotal += futureCost; uniBreakdown[s.key] = { level: stageLevel, cost: futureCost }; }
      else k12Total += futureCost;
    });
    const totalFuture = sum(stages, st => st.futureCost);
    const split = eduAssetPerChild(client);
    const eduSavings = Number(child.eduSavings || 0) + split.lump;
    const eduMonthly = Number(child.eduMonthly || 0) + split.monthly;
    const yearsToFinish = Math.max(0, ...stages.filter(s => s.status !== 'passed').map(s => s.startAge + s.years - age));

    const sim = simulateEduSavings(costByYear, eduSavings, eduMonthly, EDU_SAVINGS_RETURN);
    const gap = sim.shortfall;
    const covered = Math.max(totalFuture - gap, 0);
    /* ต้องออมเพิ่มเดือนละเท่าไร (นอกเหนือจากที่ออมอยู่) ให้จ่ายค่าเทอมได้ครบทุกปี — bisection บนการจำลองเดียวกัน */
    let reqMonthly = 0;
    if (gap > 0 && yearsToFinish > 0) {
      let lo = 0, hi = Math.max(totalFuture / 12, 1);
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (simulateEduSavings(costByYear, eduSavings, eduMonthly + mid, EDU_SAVINGS_RETURN).shortfall > 0) lo = mid; else hi = mid;
      }
      reqMonthly = hi;
    }
    return {
      age, level, stages, totalFuture, k12Total, uniTotal, uniBreakdown,
      eduSavings, eduMonthly, fvOfCurrentSavings: covered, covered, surplusAtEnd: sim.surplus,
      gap, reqMonthly, yearsToFinish, inflationPct, costByYear,
    };
  }
  /* ค่าใช้จ่าย/ปี ณ อายุ a ตามหมวด (living/care/tuition) จากตารางค่าใช้จ่าย */
  function sumYearlyCostByCategory(client, age, level, categories) {
    const table = eduCostTable(client);
    const li = levelIdx(level);
    let total = 0;
    EDU_COST_KEYS.forEach(k => {
      if (categories.indexOf(k.category) >= 0 && age >= k.ageMin && age < k.ageMax) total += Number((table[k.key] || [0, 0, 0])[li] || 0);
    });
    return total;
  }
  /* ค่าเลี้ยงดู (กินอยู่ + พี่เลี้ยง) จนถึงอายุ 21 รวมเงินเฟ้อ */
  function childRearing(child, client) {
    const age = ageYears(child && (child.dob || child.birthdate));
    if (age == null) return 0;
    const level = child.level || 'medium';
    const INFL = num(child.inflationRate, EDU_DEFAULT_INFLATION) / 100;
    let total = 0;
    for (let a = Math.floor(age); a < REARING_END_AGE; a++) {
      if (a < age) continue;
      const yearCost = sumYearlyCostByCategory(client, a, level, ['living', 'care']);
      if (yearCost > 0) total += yearCost * Math.pow(1 + INFL, a - age);
    }
    return total;
  }
  /* การศึกษา + เลี้ยงดู = "รวม" ในหน้าการศึกษาบุตร (ใช้กับแถว "บุตร" ในประกันชีวิต) · ไม่มีวันเกิด → ค่าเฉลี่ยตามระดับ */
  function childTotalCost(child, client) {
    const e = childEducation(child, client);
    if (!e) return [800000, 1500000, 3000000][levelIdx((child && child.level) || 'medium')] || 1500000;
    return e.totalFuture + childRearing(child, client);
  }

  /* ═══════════════════════════════════════════════
     4. ภาษี  (= tax2.html computeScope เดิม — หน้าลดหย่อนภาษี / คำนวณภาษี / PDF / ขั้นภาษีในสรุปกรมธรรม์)
  ═══════════════════════════════════════════════ */
  const TAX_BRACKETS = [
    { lo: 0,       hi: 150000,   rate: 0    },
    { lo: 150001,  hi: 300000,   rate: 0.05 },
    { lo: 300001,  hi: 500000,   rate: 0.10 },
    { lo: 500001,  hi: 750000,   rate: 0.15 },
    { lo: 750001,  hi: 1000000,  rate: 0.20 },
    { lo: 1000001, hi: 2000000,  rate: 0.25 },
    { lo: 2000001, hi: 5000000,  rate: 0.30 },
    { lo: 5000001, hi: Infinity, rate: 0.35 },
  ];
  /* เพดานรายช่อง (key = ชื่อช่องใน client.taxInputs) — แถวใน tax2.html อ่านเพดานจากที่นี่ */
  const TAX_CAPS = {
    personal: () => 60000,  spouse: () => 60000,  child: () => Infinity,  parent: () => 120000,  disabled: () => Infinity,
    lifeIns: () => 100000,  lifeInsSpouse: () => 10000,  healthIns: () => 25000,  parentIns: () => 15000,  mortgage: () => 100000,
    thaiesg: inc => Math.min(inc * 0.30, 300000),  thaiesgx: () => 500000,
    ssf: inc => Math.min(inc * 0.30, 200000),  rmf: inc => Math.min(inc * 0.30, 500000),
    pvd: inc => Math.min(inc * 0.15, 500000),  gpf: inc => Math.min(inc * 0.30, 500000),  nsf: () => 30000,
    annuity: inc => Math.min(inc * 0.15, 200000),
    sso: () => 9000,  maternity: () => 60000,  politicalDonate: () => 10000,  debitFee: () => Infinity,
  };
  const TAX_DEFAULTS = { personal: 60000, sso: 9000 };
  const TAX_RET_GROUP = ['ssf', 'rmf', 'pvd', 'gpf', 'nsf', 'annuity'];   /* รวมกันไม่เกิน 500,000 */
  const TAX_INCOME_KEYS = ['salary', 'bonus', 'other', 'inc402', 'inc403', 'inc404', 'inc405', 'inc406', 'inc407', 'inc408'];

  function taxIncome(ti) { ti = ti || {}; return TAX_INCOME_KEYS.reduce((s, k) => s + (Number(ti[k]) || 0), 0); }
  /* ค่าใช้จ่ายรายประเภท: 40(1)+(2) 50% รวมไม่เกิน 100,000 · 40(3) 50% ไม่เกิน 100,000 แยกเพดาน
     40(5) 30% · 40(6) 30% (แพทย์ 60%) · 40(7) 60% · 40(8) 60% — ใช้ค่าที่สูงกว่าระหว่างเหมากับ "ตามจริง" */
  function taxExpenseDetail(ti) {
    ti = ti || {};
    const n = k => Number(ti[k]) || 0;
    const salaryGroup = Math.min((n('salary') + n('bonus') + n('inc402')) * 0.5, 100000);
    const exp3Rate = Math.min(n('inc403') * 0.5, 100000), exp3 = Math.max(n('act403'), exp3Rate);
    const exp5Rate = n('inc405') * 0.30,                    exp5 = Math.max(n('act405'), exp5Rate);
    const exp6Rate = n('inc406') * (ti.isMedical ? 0.60 : 0.30), exp6 = Math.max(n('act406'), exp6Rate);
    const exp7Rate = n('inc407') * 0.60,                    exp7 = Math.max(n('act407'), exp7Rate);
    const exp8Rate = n('inc408') * 0.60,                    exp8 = Math.max(n('act408'), exp8Rate);
    return {
      salaryGroup, exp3, exp3Rate, exp5, exp5Rate, exp6, exp6Rate, exp7, exp7Rate, exp8, exp8Rate,
      rateTotal: salaryGroup + exp3Rate + exp5Rate + exp6Rate + exp7Rate + exp8Rate,
      total: salaryGroup + exp3 + exp5 + exp6 + exp7 + exp8,
    };
  }
  function taxExpense(ti) { return taxExpenseDetail(ti).total; }
  /* ภาษีอัตราก้าวหน้า + อัตราขั้นสูงสุดที่ถึง */
  function taxBracket(net) {
    if (!(net > 0)) return { tax: 0, rate: 0 };
    let tax = 0, rate = 0;
    for (const b of TAX_BRACKETS) {
      if (net <= b.lo) break;
      tax += Math.max(Math.min(net, b.hi) - b.lo + 1, 0) * b.rate;
      rate = b.rate;
      if (net <= b.hi) break;
    }
    return { tax, rate };
  }
  /* ค่าช่องลดหย่อน: scope 'cur' = taxInputs · 'imp' = taxInputs.improve (ยังไม่แก้ → ใช้ค่าปัจจุบัน) */
  function taxValue(ti, scope, key, defaultVal) {
    ti = ti || {};
    let v = (scope === 'imp' ? (ti.improve || {}) : ti)[key];
    if (scope === 'imp' && (v == null || v === '')) v = ti[key];
    if (v == null || v === '') { const d = defaultVal != null ? defaultVal : TAX_DEFAULTS[key]; return d || 0; }
    return Number(v) || 0;
  }
  /* extra = ค่าลดหย่อนที่เพิ่มเข้าไป (ใช้หาภาษีหลังใช้สิทธิ์เพิ่มใน PDF) */
  function taxScope(client, scope, extra) {
    const ti = (client && client.taxInputs) || {};
    const income = taxIncome(ti);
    const used = k => Math.min(taxValue(ti, scope, k), TAX_CAPS[k](income));
    let total = Object.keys(TAX_CAPS).reduce((s, k) => s + used(k), 0);
    /* ประกันชีวิต + สุขภาพ รวมไม่เกิน 100,000 */
    const lifeHealth = used('lifeIns') + used('healthIns');
    if (lifeHealth > 100000) total -= lifeHealth - 100000;
    /* กลุ่มออมเพื่อเกษียณ รวมไม่เกิน 500,000 */
    const retGroup = TAX_RET_GROUP.reduce((s, k) => s + used(k), 0);
    const retExcess = Math.max(retGroup - 500000, 0);
    total -= retExcess;
    total += extra || 0;

    /* เงินบริจาค 2 เท่า: หน้าลดหย่อนภาษีเก็บใน eduDonate · หน้าคำนวณภาษีเก็บใน donate (ช่องเดียวกันคนละชื่อ) → ใช้ eduDonate ก่อน ไม่มีค่อยใช้ donate */
    const impEdu = (ti.improve || {}).eduDonate;
    const curEdu = (ti.eduDonate != null && ti.eduDonate !== '') ? ti.eduDonate : (ti.donate || 0);
    const eduDonate = Number((scope === 'imp' && impEdu != null && impEdu !== '') ? impEdu : curEdu) || 0;
    const expense = taxExpense(ti);
    const afterExp = Math.max(income - expense, 0);
    const afterDeduct = afterExp - total;
    /* เงินบริจาคเพื่อการศึกษา ฯลฯ หัก 2 เท่า ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อน */
    const eduDeduct = Math.min(eduDonate * 2, Math.max(afterDeduct, 0) * 0.10);
    const net = afterDeduct - eduDeduct;
    const { tax: progressiveTax, rate } = taxBracket(Math.max(net, 0));
    /* วิธีเหมา 0.5%: เงินได้ที่ไม่ใช่เงินเดือน (40(2)–(8)) ตั้งแต่ 120,000 → เทียบกับอัตราก้าวหน้า เสียตามวิธีที่สูงกว่า
       ยกเว้นภาษีตามวิธีนี้ไม่เกิน 5,000 */
    const otherInc = ['inc402', 'inc403', 'inc404', 'inc405', 'inc406', 'inc407', 'inc408', 'other'].reduce((s, k) => s + (Number(ti[k]) || 0), 0);
    const flatTax = otherInc >= 120000 ? otherInc * 0.005 : 0;
    const flatApplies = flatTax > 5000;
    const tax = flatApplies ? Math.max(progressiveTax, flatTax) : progressiveTax;
    return { annualIncome: income, income, expense, totalDeduct: total, retExcess, afterDeduct, eduDonate, eduDeduct, net, tax, rate, progressiveTax, flatTax, flatApplies, otherInc };
  }

  /* ═══════════════════════════════════════════════
     5. สุขภาพ / ทุนประกันแนะนำ  (= health-insurance.html computeRecommendations + policies.html computeRecommendedCoverage เดิม)
  ═══════════════════════════════════════════════ */
  const HEALTH_ROWS = [
    { key: 'roomMeal',          label: 'ค่าห้อง ค่าอาหาร (ต่อวัน)' },
    { key: 'perVisit',          label: 'วงเงินค่ารักษา (ต่อครั้ง)' },
    { key: 'opdPerVisit',       label: 'ผู้ป่วยนอก (ต่อครั้ง)' },
    { key: 'opdPerYear',        label: 'ผู้ป่วยนอก (ต่อปี)' },
    { key: 'incomeReplace',     label: 'ชดเชยรายได้ (รายวัน)' },
    { key: 'ciEarly',           label: 'โรคร้ายแรง (ระยะต้น-ปานกลาง)' },
    { key: 'ciSevere',          label: 'โรคร้ายแรง (ระยะรุนแรง)' },
    { key: 'accidentWeekly',    label: 'ชดเชยอุบัติเหตุ (ต่อสัปดาห์)' },
    { key: 'accidentTreatment', label: 'ค่ารักษาอุบัติเหตุ (ต่อครั้ง)' },
    { key: 'disability',        label: 'ทุพพลภาพ' },
  ];
  const HEALTH_TIER = {
    state:         { perVisitMult: 100, opdRatio: 0.25, accidentTreat: 50000  },
    mid:           { perVisitMult: 130, opdRatio: 0.27, accidentTreat: 100000 },
    premium:       { perVisitMult: 150, opdRatio: 0.30, accidentTreat: 200000 },
    international: { perVisitMult: 200, opdRatio: 0.35, accidentTreat: 500000 },
  };
  function hospitalTier(rate) { return rate < 3000 ? 'state' : rate < 6000 ? 'mid' : rate < 10000 ? 'premium' : 'international'; }
  /* วงเงินแนะนำ 10 รายการ จากโรงพยาบาล/ห้องที่เลือก อายุ รายได้ · rec = รวมค่าที่ตัวแทนแก้เอง (customRecommendations) · auto = สูตรล้วน
     hi ไม่ส่ง → ใช้ client.healthInputs · เลือก VIP แต่โรงพยาบาลไม่มีราคา VIP → ใช้ห้องมาตรฐาน */
  function healthRecommend(client, hi) {
    client = client || {};
    hi = hi || client.healthInputs || {};
    const hospital = hi.hospital || null;
    const useVip = hi.tier === 'vip' && hospital && Number(hospital.vip) > 0;
    const hospitalRate = hospital ? Number(useVip ? hospital.vip : hospital.std) || 0 : 0;
    const rate = hospitalRate || 3000;
    const m = HEALTH_TIER[hospitalTier(rate)];
    const monthlyIncome = incomeAnnual(client) / 12;
    const annualIncome = monthlyIncome * 12;
    const dailyIncome = monthlyIncome / 30;
    const age = ageInt(client.dob || client.birthdate) || 35;
    const ageMult = age < 30 ? 0.85 : age < 45 ? 1.0 : age < 60 ? 1.2 : 1.4;
    const baseMonthly = monthlyIncome || 30000;
    const auto = {
      roomMeal:          rate,
      perVisit:          Math.max(Math.round(rate * m.perVisitMult * ageMult / 100000) * 100000, 100000),
      opdPerVisit:       Math.max(Math.round(rate * m.opdRatio / 100) * 100, 500),
      opdPerYear:        Math.max(Math.round(rate * m.opdRatio * 20 / 1000) * 1000, 5000),
      incomeReplace:     Math.max(Math.round(dailyIncome * 0.7 / 500) * 500, 1500),
      ciEarly:           Math.max(Math.round(annualIncome * 2 / 100000) * 100000, 500000),
      ciSevere:          Math.max(Math.round(annualIncome * 5 / 100000) * 100000, 2000000),
      accidentWeekly:    Math.max(Math.round(dailyIncome * 7 / 1000) * 1000, 5000),
      accidentTreatment: Math.max(Math.round(m.accidentTreat * ageMult / 10000) * 10000, 50000),
      disability:        Math.max(Math.round(baseMonthly * 24 * ageMult / 100000) * 100000, 1000000),
    };
    const custom = hi.customRecommendations || {};
    const rec = {};
    Object.keys(auto).forEach(k => { rec[k] = (custom[k] != null && custom[k] !== '') ? (Number(custom[k]) || 0) : auto[k]; });
    return { rec, auto, custom, hospital, rate, roomType: useVip ? 'VIP' : 'STD', tierKey: hospitalTier(rate), age, ageMult, monthlyIncome };
  }
  /* ความคุ้มครองที่มีจากสัญญาเพิ่มเติมในสรุปกรมธรรม์ (ชื่อช่องตรงกับฟอร์ม renderRiderFields) */
  function healthFromPolicies(client) {
    const out = {};
    const add = (k, v) => { const n = Number(v || 0); if (n > 0) out[k] = (out[k] || 0) + n; };
    ((client && client.policies) || []).forEach(p => {
      const riders = Array.isArray(p.riders) ? p.riders : [];
      riders.forEach(r => {
        if (r.type === 'medical') { add('roomMeal', r.roomMeal); add('perVisit', r.perVisit); add('opdPerVisit', r.opdPerVisit); add('opdPerYear', r.opdPerYear); }
        else if (r.type === 'income') add('incomeReplace', r.dailyComp);
        else if (r.type === 'critical') { add('ciEarly', r.ciEarly); add('ciSevere', r.ciSevere); }
        else if (r.type === 'accident') {
          const weekly = ['disComplete', 'disPartial'].filter(k => (r[k + 'Freq'] || 'ต่อสัปดาห์') === 'ต่อสัปดาห์').map(k => Number(r[k] || 0));
          add('accidentWeekly', Math.max(0, ...weekly));
        }
        else if (r.type === 'disability') add('disability', r.disabilityAmt);
      });
      /* กรมธรรม์รุ่นเก่าที่ไม่มีสัญญาเพิ่มเติมแบบใหม่ — ช่องเดี่ยว (coverage เฉพาะประเภทสุขภาพ ไม่เอาทุนชีวิตมานับ) */
      if (!riders.some(r => r.type === 'medical'))    add('perVisit', p.type === 'สุขภาพ' ? (p.coverage || p.riderHealthCov) : p.riderHealthCov);
      if (!riders.some(r => r.type === 'critical'))   add('ciSevere', p.riderCriticalCov);
      if (!riders.some(r => r.type === 'disability')) add('disability', p.riderDisabilityMonthly);
    });
    return out;
  }
  /* ตารางสุขภาพ: แนะนำ vs มีแล้ว (ค่าที่กรอกในคอลัมน์ "เตรียมไว้แล้ว" · ไม่ได้กรอก → จากสัญญาเพิ่มเติม) */
  function healthCalc(client) {
    client = client || {};
    const hi = client.healthInputs || {};
    const h = healthRecommend(client, hi);
    const fromPolicies = healthFromPolicies(client);
    const prepared = hi.prepared || {};
    const rows = HEALTH_ROWS.map(r => {
      const typed = prepared[r.key];
      const have = (typed != null && typed !== '') ? (Number(typed) || 0) : Number(fromPolicies[r.key] || 0);
      const need = Number(h.rec[r.key] || 0);
      return { key: r.key, label: r.label, have, need, ok: need > 0 && have >= need };
    });
    const ipd = rows.find(r => r.key === 'perVisit');
    return {
      target: ipd.need, have: ipd.have, gap: Math.max(ipd.need - ipd.have, 0),
      rows, okCount: rows.filter(r => r.ok).length,
      hospital: h.hospital, roomType: h.roomType, rate: h.rate, rec: h.rec, auto: h.auto,
    };
  }
  /* ทุนแนะนำ (หน้าแรก / สรุปกรมธรรม์ / PDF) — แต่ละค่า { value, basis }
     ชีวิต: ภาระที่นับรวมในหน้าประกันชีวิต · ไม่มี → 10× รายได้/ปี + หนี้สิน (ขั้นต่ำ 1M)
     สุขภาพ/โรคร้ายแรง/ชดเชยรายได้: สูตรหน้าประกันสุขภาพ (เคารพค่าที่ตัวแทนแก้เอง) · อุบัติเหตุ 2× รายได้ (ขั้นต่ำ 500K)
     ทุพพลภาพ (ชดเชยรายเดือน): 65% ของรายได้/เดือน (ขั้นต่ำ 30,000) */
  function recommendCoverage(client) {
    client = client || {};
    const annualIncome = incomeAnnual(client);
    const monthlyIncome = annualIncome / 12, dailyIncome = monthlyIncome / 30;
    const age = ageInt(client.dob || client.birthdate);
    const totalDebt = sum(client.liabilities, l => l.principal || l.amount);
    const li = client.lifeInputs || {};
    const need = sum([...(li.debts || []), ...(li.responsibilities || [])].filter(r => r && r.included !== false), r => r.amount);
    const life = need > 0
      ? { value: need, basis: 'ภาระที่นับรวมในหน้าประกันชีวิต' }
      : { value: Math.max(annualIncome * 10 + totalDebt, 1000000), basis: annualIncome > 0 ? '10× รายได้/ปี + หนี้สิน' : 'ค่าเริ่มต้น' };
    const h = healthRecommend(client);
    const isCustom = key => h.custom[key] != null && h.custom[key] !== '';
    const pick = (key, autoBasis) => isCustom(key)
      ? { value: Number(h.custom[key]) || 0, basis: 'ค่าที่กำหนดในหน้าประกันสุขภาพ' }
      : { value: h.auto[key], basis: autoBasis };
    const health = pick('perVisit', h.hospital ? `ตาม ${h.hospital.name} (${h.roomType}) ในหน้าประกันสุขภาพ` : 'ค่าห้องอ้างอิง 3,000/วัน — ยังไม่เลือกโรงพยาบาล');
    const ci = pick('ciSevere', annualIncome > 0 ? '5× รายได้/ปี' : 'ค่าเริ่มต้น');
    const incomeRep = pick('incomeReplace', dailyIncome > 0 ? '70% ของรายได้/วัน' : 'ค่าเริ่มต้น');
    const pa = { value: Math.max(annualIncome * 2, 500000), basis: annualIncome > 0 ? '2× รายได้/ปี' : 'ค่าเริ่มต้น' };
    const disability = { value: Math.max(Math.round(monthlyIncome * 0.65), 30000), basis: monthlyIncome > 0 ? '65% ของรายได้/เดือน' : 'ค่าเริ่มต้น' };
    return { annualIncome, age, totalDebt, life, health, ci, pa, incomeRep, disability };
  }
  /* ทุนชีวิตที่จะส่งต่อให้ทายาท = ทุนชีวิตรวมของกรมธรรม์ทุกแบบที่จ่ายเมื่อเสียชีวิต (ไม่นับสุขภาพ/โรคร้ายแรง/PA/อุบัติเหตุ) */
  const LIFE_TYPES = ['ชีวิต', 'ทุนชีวิต', 'ตลอดชีพ', 'สะสมทรัพย์', 'บำนาญ', 'Unit Linked', 'การศึกษา', 'เกษียณ', 'ลดหย่อนภาษี', 'ลงทุน', 'ส่งมอบ'];
  function legacyCover(client) {
    const pols = ((client && client.policies) || []).filter(p => LIFE_TYPES.includes(p.type) && Number(p.lifeCoverage || p.coverage || 0) > 0);
    return { cover: sum(pols, p => p.lifeCoverage || p.coverage), count: pols.length, legacyTypeCount: pols.filter(p => p.type === 'ส่งมอบ').length };
  }

  window.CALC = {
    VERSION: '1',
    num, ageYears, ageInt, incomeAnnual, annualContrib, fv, assetFV,
    RET_DEFAULT, RET_TYPES, isIncomeAsset, retirementPlan, retirementAssets, retirementDerived, retirementIncomeAfter, retirement,
    EDU_STAGES, EDU_LEVELS, LEVEL_INDEX, EDU_LEVEL_NAME_TH, EDU_DEFAULT_INFLATION, EDU_SAVINGS_RETURN, REARING_END_AGE,
    EDU_COST_KEYS, EDU_DEFAULT_COST_TABLE, EDU_HIGHER_FALLBACK, levelIdx,
    eduCostTable, eduStageCost, eduUniLevel, eduAssetPerChild, simulateEduSavings, childEducation, sumYearlyCostByCategory, childRearing, childTotalCost,
    TAX_BRACKETS, TAX_CAPS, TAX_DEFAULTS, TAX_RET_GROUP, TAX_INCOME_KEYS, taxIncome, taxExpenseDetail, taxExpense, taxBracket, taxValue, taxScope,
    HEALTH_ROWS, HEALTH_TIER, hospitalTier, healthRecommend, healthFromPolicies, healthCalc, recommendCoverage, LIFE_TYPES, legacyCover,
  };
})();
