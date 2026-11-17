// Umoja Payroll — calculation engine (no DOM). Shared by the app and the tests.
// All money in dollars, rounded to cents at each withheld amount.

const RATE_DEFAULTS = {
  2026: {
    year: 2026,
    // Social Security / Medicare — IRS Pub 15 (2026); SSA wage base announced Oct 24, 2025
    ssRate: 0.062,
    ssWageBase: 184500,
    medRate: 0.0145,
    addlMedRate: 0.009,
    addlMedThreshold: 200000,
    // Pub 15-T (2026) Worksheet 1A line 1g (Step 2 box NOT checked)
    line1gMFJ: 12900,
    line1gOther: 8600,
    // Georgia — DOR Employer's Withholding Tax Guide 2026 (rev. June 2026), HB 463
    gaRate: 0.0499,
    gaStdA: 15000, // Single
    gaStdB: 15000, // Married filing separate, or joint with both spouses working
    gaStdC: 30000, // Married filing joint, one spouse working
    gaStdD: 15000, // Head of household
    gaAllowance: 5000, // per dependent / additional allowance
    // Georgia DOL unemployment (employer only)
    sutaRate: 0.027, // new-employer total rate: 2.64% + 0.06% admin assessment
    sutaWageBase: 9500,
    // Federal optional flat rate for supplemental wages (bonuses) paid separately — IRS Pub 15 (2026)
    suppFlatRate: 0.22,
  },
};

// Pub 15-T (2026) Annual Percentage Method Tables for Automated Payroll Systems,
// Forms W-4 from 2020 or later. Row = [at least, tentative amount, percent]; "of excess over" = at least.
const FED_TABLES = {
  2026: {
    standard: {
      mfj: [[0, 0, 0], [19300, 0, 0.10], [44100, 2480, 0.12], [120100, 11600, 0.22], [230700, 35932, 0.24], [422850, 82048, 0.32], [531750, 116896, 0.35], [788000, 206583.50, 0.37]],
      single: [[0, 0, 0], [7500, 0, 0.10], [19900, 1240, 0.12], [57900, 5800, 0.22], [113200, 17966, 0.24], [209275, 41024, 0.32], [263725, 58448, 0.35], [648100, 192979.25, 0.37]],
      hoh: [[0, 0, 0], [15550, 0, 0.10], [33250, 1770, 0.12], [83000, 7740, 0.22], [121250, 16155, 0.24], [217300, 39207, 0.32], [271750, 56631, 0.35], [656150, 191171, 0.37]],
    },
    checkbox: {
      mfj: [[0, 0, 0], [16100, 0, 0.10], [28500, 1240, 0.12], [66500, 5800, 0.22], [121800, 17966, 0.24], [217875, 41024, 0.32], [272325, 58448, 0.35], [400450, 103291.75, 0.37]],
      single: [[0, 0, 0], [8050, 0, 0.10], [14250, 620, 0.12], [33250, 2900, 0.22], [60900, 8983, 0.24], [108938, 20512, 0.32], [136163, 29224, 0.35], [328350, 96489.63, 0.37]],
      hoh: [[0, 0, 0], [12075, 0, 0.10], [20925, 885, 0.12], [45800, 3870, 0.22], [64925, 8077.50, 0.24], [112950, 19603.50, 0.32], [140175, 28315.50, 0.35], [332375, 95585.50, 0.37]],
    },
  },
};

const PERIODS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

function ratesFor(year, overrides) {
  const base = RATE_DEFAULTS[year];
  if (!base) return null;
  return Object.assign({}, base, (overrides && overrides[year]) || {});
}

function fedLookup(year, step2, status, adj) {
  const t = FED_TABLES[year][step2 ? 'checkbox' : 'standard'][status];
  let row = t[0];
  for (const r of t) if (adj >= r[0]) row = r;
  return row[1] + (adj - row[0]) * row[2];
}

// Earning line types: 'hours' (sessions × hours × rate, default), 'bonus' (taxable amount), 'reimb' (non-taxable reimbursement).
function lineType(it) { return it.type || 'hours'; }
function lineAmount(it) { return lineType(it) === 'hours' ? r2(num(it.count) * num(it.hours) * num(it.rate)) : r2(num(it.amount)); }

// emp: { w4:{onFile,status,step2,step3,step4a,step4b,step4c,exempt}, g4:{onFile,status,deps,addl,extra,exempt} }
// ytd: { gross, ssWages, sutaWages } from earlier finalized pay runs this calendar year
function calcPaycheck({ emp, items, ytd, freq, year, rates, sutaMethod, bonusFlat }) {
  const periods = PERIODS[freq];
  const R = rates;
  const steps = [];
  const sum = (t) => r2(items.filter((it) => lineType(it) === t).reduce((s, it) => s + lineAmount(it), 0));
  const regular = sum('hours'), bonus = sum('bonus'), reimb = sum('reimb');
  const gross = r2(regular + bonus); // taxable wages; reimbursements are not wages
  ytd = ytd || { gross: 0, ssWages: 0, sutaWages: 0 };

  // Federal income tax — Pub 15-T Worksheet 1A
  const w4 = emp.w4 || {};
  let fit = 0;
  if (w4.onFile && w4.exempt) {
    steps.push('Federal: W-4 claims exempt, so $0 withheld.');
  } else {
    const onFile = !!w4.onFile;
    const status = onFile ? (w4.status || 'single') : 'single';
    const step2 = onFile && !!w4.step2;
    const s3 = onFile ? num(w4.step3) : 0, s4a = onFile ? num(w4.step4a) : 0, s4b = onFile ? num(w4.step4b) : 0, s4c = onFile ? num(w4.step4c) : 0;
    const fedWages = bonusFlat ? regular : gross;
    const annual = fedWages * periods + s4a;
    const line1g = step2 ? 0 : (status === 'mfj' ? R.line1gMFJ : R.line1gOther);
    const adj = Math.max(0, annual - (s4b + line1g));
    const tentAnnual = fedLookup(year, step2, status, adj);
    const perPeriod = tentAnnual / periods;
    const afterCredits = Math.max(0, perPeriod - s3 / periods);
    const flatPart = bonusFlat ? r2(bonus * R.suppFlatRate) : 0;
    fit = r2((fedWages > 0 ? afterCredits : 0) + s4c + flatPart);
    if (!onFile) steps.push('Federal: no W-4 on file, so withheld as Single with no adjustments (Pub 15-T rule).');
    if (bonusFlat && bonus) steps.push(`Federal on the bonus: $${bonus.toFixed(2)} × ${(R.suppFlatRate * 100).toFixed(0)}% flat supplemental rate = $${flatPart.toFixed(2)}.`);
    if (fedWages > 0 || !bonusFlat) steps.push(`Federal: $${fedWages.toFixed(2)} × ${periods} pay periods${s4a ? ` + $${s4a} other income` : ''} − $${(s4b + line1g).toLocaleString()} = $${adj.toFixed(2)} a year; table gives $${tentAnnual.toFixed(2)} a year ÷ ${periods} = $${perPeriod.toFixed(2)}${s3 ? `, less $${(s3 / periods).toFixed(2)} credits` : ''}${s4c ? `, plus $${s4c.toFixed(2)} extra` : ''}.`);
  }

  // Social Security
  const ssRoom = Math.max(0, R.ssWageBase - num(ytd.ssWages));
  const ssWages = r2(Math.min(gross, ssRoom));
  const ssEe = r2(ssWages * R.ssRate);
  const ssEr = ssEe;
  // Medicare
  const medEe = r2(gross * R.medRate);
  const medEr = medEe;
  const before = Math.max(0, num(ytd.gross) - R.addlMedThreshold);
  const after = Math.max(0, num(ytd.gross) + gross - R.addlMedThreshold);
  const addlWages = r2(after - before);
  const addlMed = r2(addlWages * R.addlMedRate);

  // Georgia — percentage method, annualized
  const g4 = emp.g4 || {};
  let ga = 0;
  if (g4.onFile && g4.exempt) {
    steps.push('Georgia: G-4 claims exempt, so $0 withheld.');
  } else {
    const onFile = !!g4.onFile;
    const st = onFile ? (g4.status || 'A') : 'A';
    const allowances = onFile ? num(g4.deps) + num(g4.addl) : 0;
    const extra = onFile ? num(g4.extra) : 0;
    const std = R['gaStd' + st];
    const taxable = Math.max(0, gross * periods - std - R.gaAllowance * allowances);
    ga = r2(taxable * R.gaRate / periods + extra);
    if (!onFile) steps.push('Georgia: no G-4 on file, so withheld as Single with zero allowances.');
    steps.push(`Georgia: $${gross.toFixed(2)} × ${periods} − $${std.toLocaleString()} standard deduction${allowances ? ` − ${allowances} × $${R.gaAllowance.toLocaleString()}` : ''} = $${taxable.toFixed(2)} × ${(R.gaRate * 100).toFixed(2)}% ÷ ${periods}${extra ? ` + $${extra.toFixed(2)} extra` : ''}.`);
  }

  // Georgia unemployment (employer only)
  const sutaRoom = Math.max(0, R.sutaWageBase - num(ytd.sutaWages));
  const sutaWages = r2(Math.min(gross, sutaRoom));
  const suta = sutaMethod === 'contributory' ? r2(sutaWages * R.sutaRate) : 0;

  const employeeTaxes = r2(fit + ssEe + medEe + addlMed + ga);
  const net = r2(gross - employeeTaxes + reimb);
  const federalDeposit = r2(fit + ssEe + ssEr + medEe + medEr + addlMed);
  const employerCost = r2(gross + reimb + ssEr + medEr + suta);

  return { regular, bonus, reimb, gross, fit, ssWages, ssEe, ssEr, medWages: gross, medEe, medEr, addlWages, addlMed, gaWages: gross, ga, sutaWages, suta, employeeTaxes, net, federalDeposit, employerCost, steps, warn: net < 0 ? 'Withholding is more than this paycheck. Check the extra-withholding amounts on the W-4 or G-4.' : '' };
}

if (typeof module !== 'undefined') module.exports = { RATE_DEFAULTS, FED_TABLES, PERIODS, calcPaycheck, ratesFor, fedLookup, r2, lineAmount, lineType };
if (typeof window !== 'undefined') Object.assign(window, { RATE_DEFAULTS, FED_TABLES, PERIODS, calcPaycheck, ratesFor, r2, lineAmount, lineType });
