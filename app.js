// Umoja Payroll — website front end.
// Data lives in Supabase; row-level security only lets the owner's account read or write anything.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://lcvalnmvaqjpaasznzix.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmFsbm12YXFqcGFhc3pueml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MzI3MDQsImV4cCI6MjExMDUwODcwNH0.xWPJrpb22A1kn45BvmUAWZohmkXpeaNijyGYc4hilSk";
const SUPABASE_DASHBOARD = "https://supabase.com/dashboard/project/lcvalnmvaqjpaasznzix";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const { FED_TABLES, calcPaycheck, ratesFor, r2, lineAmount, lineType } = window;
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const NEC_THRESHOLD = { 2026: 2000 }; // Form 1099-NEC reporting threshold (OBBBA, payments made in 2026)

// ---------------- state ----------------
const NAV = [["home", "Home"], ["payroll", "Run payroll"], ["team", "Team"], ["contractors", "Contractors"], ["taxes", "Taxes & filings"], ["reports", "Reports"], ["settings", "Settings"], ["log", "Activity"]];
const DEFAULT_SETTINGS = {
  employerName: "Umoja Soccer Club, Inc.", ein: "42-4176322", gaWithholdingId: "3733868-SD", gaDolAccount: "", address: "", bankName: "",
  payFrequency: "", firstPayDate: "", payOffsetDays: 3, gaFrequency: "", sutaMethod: "contributory",
  presets: [{ name: "Practice", hours: "" }, { name: "League game", hours: "" }, { name: "Tournament day", hours: 4 }],
};
const S = { route: "home", sub: "", settings: {}, rateOverrides: {}, employees: {}, runs: {}, done: {}, log: [], contractors: {}, cpay: [], run: null, runStep: 1, repYear: null, repBy: null, personTab: "overview", user: null };
const settings = () => Object.assign({}, DEFAULT_SETTINGS, S.settings);
const rates = (y) => ratesFor(y, S.rateOverrides);

// ---------------- helpers ----------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (num(n) < 0 ? "−" : "") + "$" + Math.abs(num(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => "$" + Math.round(num(n)).toLocaleString("en-US");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const pd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return fd(d); };
const daysUntil = (s) => Math.round((pd(s) - pd(todayStr())) / 864e5);
const nice = (s) => (s ? pd(s).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "");
const niceShort = (s) => (s ? pd(s).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "");
const weekday = (s) => pd(s).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FREQ_LABEL = { weekly: "Every week", biweekly: "Every two weeks", semimonthly: "Twice a month", monthly: "Once a month" };
const W4_LABEL = { single: "Single or married filing separately", mfj: "Married filing jointly", hoh: "Head of household" };
const G4_LABEL = { A: "A: Single", B: "B: Married separate, or joint with both working", C: "C: Married joint, one spouse working", D: "D: Head of household" };
const PAY_METHOD = { direct_deposit: "Direct deposit", check: "Check", zelle: "Zelle", other: "Other" };
const REASONS = { bonus: ["Bonus", "Pay a bonus outside the regular schedule."], correction: ["Fix a past payroll", "Pay someone who was shorted on a finished payroll."], missed: ["Missed hours", "Pay sessions left off a regular payroll."], final: ["Final pay", "Pay a team member who is leaving."] };
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// Federal legal holidays (incl. DC Emancipation Day), with weekend observance — due dates roll to the next business day.
function nthDow(y, m, dow, n) { const d = new Date(Date.UTC(y, m, 1)); let c = 0; for (;;) { if (d.getUTCDay() === dow && ++c === n) return new Date(d); d.setUTCDate(d.getUTCDate() + 1); } }
function lastDow(y, m, dow) { const d = new Date(Date.UTC(y, m + 1, 0)); while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() - 1); return d; }
function observed(d) { const o = new Date(d); if (o.getUTCDay() === 6) o.setUTCDate(o.getUTCDate() - 1); if (o.getUTCDay() === 0) o.setUTCDate(o.getUTCDate() + 1); return o; }
const HOL = {};
function holidays(y) {
  if (HOL[y]) return HOL[y];
  const D = (m, d) => new Date(Date.UTC(y, m, d));
  HOL[y] = new Set([observed(D(0, 1)), nthDow(y, 0, 1, 3), nthDow(y, 1, 1, 3), observed(D(3, 16)), lastDow(y, 4, 1), observed(D(5, 19)), observed(D(6, 4)),
    nthDow(y, 8, 1, 1), nthDow(y, 9, 1, 2), observed(D(10, 11)), nthDow(y, 10, 4, 4), observed(D(11, 25)), observed(new Date(Date.UTC(y + 1, 0, 1)))].map(fd));
  return HOL[y];
}
const isBiz = (d) => { const w = d.getUTCDay(); const s = fd(d); return w !== 0 && w !== 6 && !holidays(d.getUTCFullYear()).has(s) && !holidays(d.getUTCFullYear() - 1).has(s); };
const nextBiz = (d) => { d = new Date(d); while (!isBiz(d)) d.setUTCDate(d.getUTCDate() + 1); return d; };
const addBizDays = (s, n) => { const d = pd(s); while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (isBiz(d)) n--; } return fd(d); };
const due15 = (y, m) => fd(nextBiz(new Date(Date.UTC(y, m + 1, 15))));
const dueEndNext = (y, m) => fd(nextBiz(new Date(Date.UTC(y, m + 2, 0))));

function download(filename, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
const fix2 = (v) => (typeof v === "number" ? v.toFixed(2) : v);

// ---------------- dialogs ----------------
const dlg = $("#dlg");
function dialog(html) {
  return new Promise((resolve) => {
    dlg.innerHTML = html; dlg.returnValue = ""; dlg.showModal();
    const first = $("input:not([type=radio]),textarea,select", dlg); if (first) first.focus();
    dlg.onclose = () => resolve(dlg.returnValue);
  });
}
async function notice(title, body) { await dialog(`<form method="dialog"><h3>${esc(title)}</h3><p>${body}</p><div class="row"><button class="btn" value="ok">OK</button></div></form>`); }
async function confirmBox(title, body, okLabel, withReason) {
  const p = dialog(`<form method="dialog" id="cf"><h3>${esc(title)}</h3><p>${body}</p>
    ${withReason ? '<label for="cf-reason">Reason (saved in the activity log)</label><textarea id="cf-reason" rows="2" required></textarea>' : ""}
    <div class="row"><button class="btn secondary" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">${esc(okLabel)}</button></div></form>`);
  let captured = ""; $("#cf", dlg).addEventListener("submit", () => { captured = ($("#cf-reason", dlg)?.value || "").trim(); });
  if ((await p) !== "ok") return null;
  return withReason ? captured || null : true;
}
// Small form dialog: fields = [{id,label,type,value,required,options}] → returns values or null
async function formDialog(title, intro, fields, okLabel) {
  const f = (x) => x.type === "select" ? `<select id="fd-${x.id}">${x.options.map(([k, l]) => `<option value="${esc(k)}" ${String(x.value) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`
    : `<input id="fd-${x.id}" type="${x.type || "text"}" ${x.required ? "required" : ""} ${x.type === "number" ? 'step="any" min="0"' : ""} value="${esc(x.value ?? "")}" ${x.placeholder ? `placeholder="${esc(x.placeholder)}"` : ""}>`;
  const p = dialog(`<form method="dialog" id="fdx"><h3>${esc(title)}</h3>${intro ? `<p class="small muted">${intro}</p>` : ""}${fields.map((x) => `<label for="fd-${x.id}" style="margin-top:10px">${esc(x.label)}</label>${f(x)}`).join("")}
    <div class="row"><button class="btn secondary" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">${esc(okLabel || "Save")}</button></div></form>`);
  let out = null; $("#fdx", dlg).addEventListener("submit", () => { out = Object.fromEntries(fields.map((x) => [x.id, $("#fd-" + x.id, dlg).value.trim()])); });
  return (await p) === "ok" ? out : null;
}

// ---------------- data ----------------
class Asleep extends Error {}
function check({ data, error }) {
  if (error) {
    const m = String(error.message || error);
    if (/fetch|network|timeout|503|502|504|540/i.test(m) || error.status >= 500) throw new Asleep(m);
    throw new Error(m);
  }
  return data;
}
const empFromRow = (r) => ({ id: r.id, name: r.name, email: r.email || "", phone: r.phone || "", address: r.address || "", title: r.title || "", rate: r.rate == null ? "" : Number(r.rate), hireDate: r.hire_date || "",
  status: r.status || (r.active === false ? "dismissed" : "active"), dismissedOn: r.dismissed_on || "", payMethod: r.pay_method || "", w4: r.w4 || {}, g4: r.g4 || {}, onboarding: r.onboarding || {}, compHistory: r.comp_history || [] });
const empToRow = (e) => ({ name: e.name, email: e.email || null, phone: e.phone || null, address: e.address || null, title: e.title || null, rate: e.rate === "" || e.rate == null ? null : num(e.rate), hire_date: e.hireDate || null,
  status: e.status, active: e.status === "active", dismissed_on: e.dismissedOn || null, pay_method: e.payMethod || null, w4: e.w4, g4: e.g4, onboarding: e.onboarding || {}, comp_history: e.compHistory || [] });
const runFromRow = (r) => ({ id: r.id, status: r.status, kind: r.kind || "regular", reason: r.reason || "", options: r.options || {}, freq: r.freq, periodStart: r.period_start || "", periodEnd: r.period_end || "", payDate: r.pay_date, lines: r.lines || {}, results: r.results, ratesUsed: r.rates_used, finalizedAt: r.finalized_at, voidReason: r.void_reason });
const runToRow = (x) => ({ id: x.id, status: x.status, kind: x.kind, reason: x.reason || null, options: x.options || {}, freq: x.freq, period_start: x.periodStart || null, period_end: x.periodEnd || null, pay_date: x.payDate, lines: x.lines, results: x.results || null, rates_used: x.ratesUsed || null, void_reason: x.voidReason || null });

async function loadAll() {
  const [st, ro, em, ru, dn, lg, co, cp] = await Promise.all([
    sb.from("settings").select("data").eq("id", 1).maybeSingle(),
    sb.from("rate_overrides").select("year,data"),
    sb.from("employees").select("*").order("name"),
    sb.from("pay_runs").select("*").order("pay_date"),
    sb.from("filings_done").select("*"),
    sb.from("activity_log").select("*").order("at", { ascending: false }).limit(500),
    sb.from("contractors").select("*").order("name"),
    sb.from("contractor_payments").select("*").order("paid_on"),
  ]);
  S.settings = check(st)?.data || {};
  S.rateOverrides = Object.fromEntries((check(ro) || []).map((r) => [r.year, r.data]));
  S.employees = Object.fromEntries((check(em) || []).map((r) => [r.id, empFromRow(r)]));
  S.runs = Object.fromEntries((check(ru) || []).map((r) => [r.id, runFromRow(r)]));
  S.done = Object.fromEntries((check(dn) || []).map((r) => [r.key, { key: r.key, date: r.done_date, confirmation: r.confirmation || "", amount: r.amount == null ? null : Number(r.amount) }]));
  S.log = check(lg) || [];
  S.contractors = Object.fromEntries((check(co) || []).map((r) => [r.id, { id: r.id, name: r.name, businessName: r.business_name || "", email: r.email || "", address: r.address || "", w9: r.w9_received || "", active: r.active }]));
  S.cpay = (check(cp) || []).map((r) => ({ id: r.id, contractorId: r.contractor_id, paidOn: r.paid_on, amount: Number(r.amount), memo: r.memo || "" }));
}
async function addLog(action, detail) { check(await sb.from("activity_log").insert({ action, detail })); }
async function act(fn) {
  try { await fn(); await loadAll(); render(); return true; }
  catch (e) {
    if (e instanceof Asleep) { showAsleep(); return false; }
    await notice("That wasn’t saved", esc(e.message) + "<br><br>Nothing was changed.");
    try { await loadAll(); render(); } catch (_) {}
    return false;
  }
}

// ---------------- payroll logic ----------------
const isSample = (e) => /^test\b/i.test(e?.name || "");
const activeTeam = () => Object.values(S.employees).filter((e) => e.status === "active").sort((a, b) => a.name.localeCompare(b.name));
const finalRuns = () => Object.values(S.runs).filter((r) => r.status === "final")
  .sort((a, b) => (a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : (a.finalizedAt || "") < (b.finalizedAt || "") ? -1 : 1));
function ytdBefore(empId, payDate, runId) {
  const y = payDate.slice(0, 4);
  const t = { gross: 0, ssWages: 0, sutaWages: 0, fit: 0, ssEe: 0, medEe: 0, addlMed: 0, ga: 0, net: 0, medWages: 0, reimb: 0 };
  const runs = finalRuns(); const self = S.runs[runId];
  const idx = self && self.status === "final" ? runs.findIndex((r) => r.id === runId) : -1;
  const list = (idx >= 0 ? runs.slice(0, idx) : runs.filter((r) => r.payDate <= payDate && r.id !== runId)).filter((r) => r.payDate.slice(0, 4) === y);
  for (const r of list) { const x = r.results && r.results[empId]; if (!x) continue; for (const k in t) t[k] = r2(t[k] + num(x[k])); }
  return t;
}
function computeRun(run) {
  const y = +run.payDate.slice(0, 4); const R = rates(y); if (!R) return null;
  const out = {};
  for (const empId in run.lines || {}) {
    const emp = S.employees[empId]; const items = (run.lines[empId].items || []).filter((it) => lineAmount(it) > 0);
    if (!emp || !items.length) continue;
    out[empId] = calcPaycheck({ emp, items, ytd: ytdBefore(empId, run.payDate, run.id), freq: run.freq, year: y, rates: R, sutaMethod: settings().sutaMethod, bonusFlat: !!run.options?.bonusFlat });
  }
  return out;
}
const runResults = (run) => (run.status === "draft" ? computeRun(run) || {} : run.results || {});
const totals = (res) => Object.values(res).reduce((t, x) => { for (const k of ["gross", "reimb", "net", "fit", "ga", "suta", "federalDeposit", "employerCost", "employeeTaxes", "ssEr", "medEr"]) t[k] = r2((t[k] || 0) + num(x[k])); return t; }, {});
const bankTotal = (t) => r2((t.net || 0) + (t.federalDeposit || 0) + (t.ga || 0) + (t.suta || 0));
const kindLabel = (r) => (r.kind === "off_cycle" ? REASONS[r.reason]?.[0] || "Off-cycle" : "Regular");

// Pay schedule
function schedule(count = 6) {
  const st = settings(); const f = st.payFrequency; if (!f) return [];
  const off = Math.max(0, Math.round(num(st.payOffsetDays))); const out = [];
  const from = addDays(todayStr(), -45);
  if (f === "weekly" || f === "biweekly") {
    if (!st.firstPayDate) return [];
    const step = f === "weekly" ? 7 : 14; let p = st.firstPayDate;
    while (p < from) p = addDays(p, step);
    for (let i = 0; i < count + 4; i++) { const end = addDays(p, -off); out.push({ periodStart: addDays(end, -(step - 1)), periodEnd: end, payDate: p }); p = addDays(p, step); }
  } else {
    const t = pd(from); let y = t.getUTCFullYear(), m = t.getUTCMonth();
    while (out.length < count + 6) {
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (const [a, b] of f === "monthly" ? [[1, last]] : [[1, 15], [16, last]]) { const end = fd(new Date(Date.UTC(y, m, b))); out.push({ periodStart: fd(new Date(Date.UTC(y, m, a))), periodEnd: end, payDate: addDays(end, off) }); }
      if (++m > 11) { m = 0; y++; }
    }
  }
  return out.filter((p) => p.payDate >= from);
}
function upcomingPayrolls(n = 4) {
  const regular = Object.values(S.runs).filter((r) => r.kind === "regular" && r.status !== "void");
  return schedule(n + 6).map((p) => {
    const run = regular.find((r) => r.payDate === p.payDate || (r.periodStart === p.periodStart && r.periodEnd === p.periodEnd));
    const state = run ? (run.status === "final" ? "paid" : "draft") : daysUntil(p.payDate) < 0 ? "late" : "due";
    return Object.assign({}, p, { run, state });
  }).filter((p) => p.state !== "paid" || daysUntil(p.payDate) >= -14).slice(0, n + 2);
}
const nextPayroll = () => upcomingPayrolls(8).find((p) => p.state !== "paid");

// Deposits & filings
function liabilities() {
  const m = {};
  for (const r of finalRuns()) {
    const k = r.payDate.slice(0, 7);
    const o = (m[k] = m[k] || { fed: 0, ga: 0, suta: 0, fit: 0, ss: 0, med: 0, addl: 0, gross: 0, sutaWages: 0, ssWages: 0, addlWages: 0 });
    for (const x of Object.values(r.results || {})) {
      o.fed = r2(o.fed + x.federalDeposit); o.ga = r2(o.ga + x.ga); o.suta = r2(o.suta + x.suta); o.fit = r2(o.fit + x.fit);
      o.ss = r2(o.ss + x.ssEe + x.ssEr); o.med = r2(o.med + x.medEe + x.medEr); o.addl = r2(o.addl + x.addlMed); o.gross = r2(o.gross + x.gross);
      o.sutaWages = r2(o.sutaWages + x.sutaWages); o.ssWages = r2(o.ssWages + x.ssWages); o.addlWages = r2(o.addlWages + x.addlWages);
    }
  }
  return m;
}
const mkey = (y, mm) => `${y}-${String(mm + 1).padStart(2, "0")}`;
const sumMonths = (m, y, months, f) => r2(months.reduce((s, mm) => s + num((m[mkey(y, mm)] || {})[f]), 0));
const contractorYear = (id, y) => r2(S.cpay.filter((p) => p.contractorId === id && p.paidOn.slice(0, 4) === String(y)).reduce((s, p) => s + p.amount, 0));
function deadlines() {
  const st = settings(); const m = liabilities(); const items = []; const reimb = st.sutaMethod === "reimbursable";
  const end = new Date(Date.UTC(2028, 2, 1));
  for (let d = new Date(Date.UTC(2026, 10, 1)); d < end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), L = m[mkey(y, mo)] || {};
    items.push({ key: `fed-${mkey(y, mo)}`, due: due15(y, mo), where: "IRS, EFTPS", what: `Federal deposit for ${MONTHS[mo]} ${y} paychecks`, amount: L.fed || 0, pay: true });
    if (st.gaFrequency === "monthly") items.push({ key: `ga-${mkey(y, mo)}`, due: due15(y, mo), where: "Georgia Tax Center", what: `Georgia withholding for ${MONTHS[mo]} ${y}`, amount: L.ga || 0, pay: true });
    if (mo % 3 === 2) {
      const q = (mo / 3 | 0) + 1, qm = [mo - 2, mo - 1, mo], qk = `${y}-Q${q}`, dq = dueEndNext(y, mo);
      items.push({ key: `941-${qk}`, due: dq, where: "IRS", what: `Form 941 for Q${q} ${y}`, amount: sumMonths(m, y, qm, "fed"), form: true });
      if (st.gaFrequency === "quarterly") items.push({ key: `ga-${qk}`, due: dq, where: "Georgia Tax Center", what: `Georgia withholding for Q${q} ${y}`, amount: sumMonths(m, y, qm, "ga"), pay: true });
      if (st.gaFrequency !== "annual") items.push({ key: `g7-${qk}`, due: dq, where: "Georgia Tax Center", what: `Form G-7 for Q${q} ${y}`, amount: sumMonths(m, y, qm, "ga"), form: true });
      items.push({ key: `dol-${qk}`, due: dq, where: "GA DOL Employer Portal", what: `Form DOL-4N for Q${q} ${y}${reimb ? " (wage report)" : " and unemployment tax"}`, amount: reimb ? undefined : sumMonths(m, y, qm, "suta"), pay: !reimb, form: true });
    }
    if (mo === 11) {
      const dj = fd(nextBiz(new Date(Date.UTC(y + 1, 0, 31))));
      items.push({ key: `w2emp-${y}`, due: dj, where: "Team", what: `Give each team member their ${y} W-2`, form: true });
      items.push({ key: `w3-${y}`, due: dj, where: "Social Security Administration", what: `File ${y} W-2s and W-3`, form: true });
      items.push({ key: `g1003-${y}`, due: dj, where: "Georgia Tax Center", what: `File ${y} G-1003 with W-2s${st.gaFrequency === "annual" ? " and the annual G-7 with payment" : ""}`, amount: st.gaFrequency === "annual" ? sumMonths(m, y, [...Array(12).keys()], "ga") : undefined, pay: st.gaFrequency === "annual", form: true });
      const over = Object.values(S.contractors).filter((c) => contractorYear(c.id, y) >= (NEC_THRESHOLD[y] || 2000)).length;
      if (over) items.push({ key: `1099-${y}`, due: dj, where: "IRS and contractors", what: `File ${y} Form 1099-NEC for ${over} contractor${over > 1 ? "s" : ""} and send them copies`, form: true });
    }
  }
  return items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

// Onboarding
const ONBOARD = [
  { key: "w4", label: "Federal W-4", auto: (e) => e.w4?.onFile, how: "Enter their W-4 answers on the Taxes tab.", tab: "taxes" },
  { key: "g4", label: "Georgia G-4", auto: (e) => e.g4?.onFile, how: "Enter their G-4 answers on the Taxes tab.", tab: "taxes" },
  { key: "i9", label: "Form I-9 completed", due: (e) => e.hireDate && addBizDays(e.hireDate, 3), how: "Due within 3 business days of their start date." },
  { key: "newhire", label: "Georgia new hire report filed", due: (e) => e.hireDate && addDays(e.hireDate, 10), how: "Due within 10 days of their hire date." },
  { key: "paymethod", label: "Payment method set", auto: (e) => !!e.payMethod, how: "Choose how they’re paid on the Pay tab.", tab: "pay" },
];
const obDone = (e, it) => (it.auto ? !!it.auto(e) : !!e.onboarding?.[it.key]);
const obCount = (e) => ONBOARD.filter((it) => obDone(e, it)).length;

function todos() {
  const st = settings(); const t = [];
  if (!st.gaFrequency) t.push({ level: "warn", title: "Set your Georgia filing frequency", detail: "It’s shown in your Georgia Tax Center account.", go: "settings/company" });
  const np = nextPayroll();
  if (np) { const d = daysUntil(np.payDate); if (d <= 7) t.push({ level: d < 0 ? "bad" : "warn", title: np.state === "draft" ? "Finish payroll" : "Run payroll", detail: `Pay date ${weekday(np.payDate)}, ${nice(np.payDate)}${d < 0 ? ` (${-d} day${d === -1 ? "" : "s"} late)` : d === 0 ? " (today)" : ` (in ${d} day${d === 1 ? "" : "s"})`}.`, go: "payroll" }); }
  for (const r of Object.values(S.runs).filter((r) => r.status === "draft" && r.kind === "off_cycle")) t.push({ level: "warn", title: "Finish off-cycle payroll", detail: `${kindLabel(r)}, pay date ${nice(r.payDate)}.`, go: "payroll" });
  const anyPay = finalRuns().length > 0;
  for (const i of deadlines()) {
    if (S.done[i.key] || daysUntil(i.due) > 21) continue;
    if (i.pay && !(i.amount > 0)) continue;
    if (!i.pay && !anyPay) continue;
    const d = daysUntil(i.due); t.push({ level: d < 0 ? "bad" : d <= 7 ? "warn" : "ok", title: i.what, detail: `${i.where}, due ${nice(i.due)}${i.amount ? `, ${money(i.amount)}` : ""}.`, go: i.pay ? "taxes/pay" : "taxes/calendar" });
  }
  const unfinished = activeTeam().filter((e) => !isSample(e) && obCount(e) < ONBOARD.length);
  if (unfinished.length) {
    const dues = unfinished.flatMap((e) => ONBOARD.filter((it) => it.due && !obDone(e, it)).map((it) => it.due(e))).filter(Boolean).sort();
    const late = dues.length && daysUntil(dues[0]) < 0; const one = unfinished.length === 1 ? unfinished[0] : null;
    t.push({ level: late ? "bad" : "warn", title: one ? `Finish onboarding ${one.name}` : `Finish onboarding for ${unfinished.length} people`, detail: dues.length ? `${late ? "Overdue since" : "Next item due"} ${nice(dues[0])}.` : "Tax forms or payment method still missing.", go: one ? `team/${one.id}` : "team", tab: one ? "onboarding" : undefined });
  }
  for (const c of Object.values(S.contractors)) if (!isSample(c) && !c.w9 && S.cpay.some((p) => p.contractorId === c.id)) t.push({ level: "warn", title: `Get a W-9 from ${c.name}`, detail: "Needed before filing their 1099.", go: "contractors" });
  if (np) { const ny = +np.payDate.slice(0, 4); if (!rates(ny)) t.push({ level: "bad", title: `${ny} tax tables needed`, detail: `Ask Claude to add the ${ny} rates before paying anyone in ${ny}.`, go: "settings/rates" }); }
  if (!st.gaDolAccount) t.push({ level: "ok", title: "Add your GA DOL account number", detail: "Enter it in Settings when Georgia sends it.", go: "settings/company" });
  const order = { bad: 0, warn: 1, ok: 2 };
  return t.sort((a, b) => order[a.level] - order[b.level]);
}

// ---------------- router & render ----------------
function go(route, tab) {
  const [r, s] = String(route).split("/"); S.route = r; S.sub = s || ""; if (r !== "payroll") { S.run = null; S.runStep = 1; } if (tab) S.personTab = tab;
  try { history.replaceState(null, "", "#" + r + (s ? "-" + s : "")); } catch (_) {}
  render(); window.scrollTo(0, 0); $("#view").focus({ preventScroll: true });
}
function render() {
  const n = todos().filter((t) => t.level !== "ok").length;
  $("#nav").innerHTML = NAV.map(([k, l]) => `<button type="button" data-go="${k}" ${S.route === k ? 'aria-current="page"' : ""}>${l}${k === "home" && n ? `<span class="badge">${n}</span>` : ""}</button>`).join("");
  $("#view").innerHTML = (VIEWS[S.route] || VIEWS.home)();
  (BIND[S.route] || (() => {}))();
  $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go, b.dataset.tab)));
}
const VIEWS = {}, BIND = {};
const head = (title, lede, actions = "") => `<div class="page-head"><div><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>${actions}</div>`;
const scoreboard = (t, first = "Total Umoja needs in the bank", foot = true) => `<div class="scoreboard"><div class="cell"><div class="label">${first}</div><div class="num">${money(bankTotal(t))}</div></div>
  <div class="cell"><div class="label">To team members</div><div class="num">${money(t.net || 0)}</div></div>
  <div class="cell"><div class="label">To the IRS</div><div class="num">${money(t.federalDeposit || 0)}</div></div>
  <div class="cell"><div class="label">To Georgia</div><div class="num">${money(r2((t.ga || 0) + (t.suta || 0)))}</div></div>
  ${foot ? `<div class="foot">The big number covers everything. ${money(r2((t.ssEr || 0) + (t.medEr || 0) + (t.suta || 0)))} of it is Umoja’s own tax${t.reimb ? ` and ${money(t.reimb)} is reimbursements` : ""}. The rest is the team’s pay.</div>` : ""}</div>`;

// ----- Home -----
VIEWS.home = () => {
  const np = nextPayroll(); const list = todos(); const runs = finalRuns().slice(-6);
  const max = Math.max(1, ...runs.map((r) => bankTotal(totals(r.results || {}))));
  const y = String(new Date().getFullYear()); const yr = finalRuns().filter((r) => r.payDate.slice(0, 4) === y).map((r) => totals(r.results || {}));
  const sum = (k) => r2(yr.reduce((s, t) => s + (t[k] || 0), 0));
  const hour = new Date().getHours(); const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const nC = Object.keys(S.contractors).length; const shown = S.allTodos ? list : list.slice(0, 5);
  return head(`${greet}, Juliana`) +
    `<div class="cols"><div>
      ${np ? `<div class="next-pay"><div class="small" style="color:var(--chalk)">${np.state === "draft" ? "Payroll in progress" : np.state === "late" ? "Payroll is late" : "Next payroll"}</div>
        <div class="when">${weekday(np.payDate)}, ${niceShort(np.payDate)}</div>
        <p>Work from ${nice(np.periodStart)} to ${nice(np.periodEnd)}</p>
        <div class="row"><button class="btn" data-start="${np.payDate}">${np.state === "draft" ? "Continue payroll" : "Run payroll"}</button><button class="btn secondary" data-go="payroll">All payrolls</button></div></div>`
      : `<div class="next-pay"><div class="when">Set up your pay schedule</div><p>Your payrolls will line up here on their own.</p><button class="btn" data-go="settings/schedule">Set it up</button></div>`}
      <div class="panel"><h2>To do</h2>${list.length ? `<ul class="todo">${shown.map((t) => `<li><span class="dot ${t.level}"></span><div><div class="t">${esc(t.title)}</div><div class="d">${esc(t.detail)}</div></div><button class="btn quiet" data-go="${t.go}" ${t.tab ? `data-tab="${t.tab}"` : ""}>Open</button></li>`).join("")}</ul>${list.length > 5 ? `<button class="more" id="moretodo">${S.allTodos ? "Show fewer" : `Show all ${list.length}`}</button>` : ""}` : `<p class="empty">You’re all caught up.</p>`}</div>
    </div><div>
      ${!runs.length ? `<div class="panel"><h2>${y} so far</h2><p class="empty">Costs and trends show up here after your first payroll.</p></div>` : `<div class="panel"><h2>Payroll cost</h2>${runs.length ? `<div class="bars">${runs.map((r) => { const v = bankTotal(totals(r.results || {})); return `<div class="bar"><span class="v">${money0(v)}</span><i style="height:${Math.max(3, (v / max) * 100)}%"></i><span class="l">${niceShort(r.payDate)}</span></div>`; }).join("")}</div>` : `<p class="empty">Your finished payrolls show up here.</p>`}</div>
      <div class="panel"><h2>${y} so far</h2><div class="stats">
        <div class="stat"><div class="label">Total payroll cost</div><div class="num">${money0(yr.reduce((s, t) => s + bankTotal(t), 0))}</div></div>
        <div class="stat"><div class="label">Team’s gross pay</div><div class="num">${money0(sum("gross"))}</div></div>
        <div class="stat"><div class="label">Umoja’s own taxes</div><div class="num">${money0(r2(sum("ssEr") + sum("medEr") + sum("suta")))}</div></div>
        <div class="stat"><div class="label">Payrolls run</div><div class="num">${yr.length}</div></div>
      </div></div>`}
      <div class="panel tint"><h2>Team</h2><p class="small" style="margin:0 0 10px">${activeTeam().length} active team member${activeTeam().length === 1 ? "" : "s"}${nC ? `, ${nC} contractor${nC === 1 ? "" : "s"}` : ""}.</p><button class="btn secondary" data-go="team">Open team</button></div>
    </div></div>`;
};
BIND.home = () => { $$("[data-start]").forEach((b) => b.addEventListener("click", () => startRegular(b.dataset.start))); $("#moretodo")?.addEventListener("click", () => { S.allTodos = !S.allTodos; render(); }); };

// ----- Payroll -----
function startRegular(payDate) {
  const p = upcomingPayrolls(8).find((x) => x.payDate === payDate);
  if (!p) return;
  S.run = p.run ? structuredClone(p.run) : { id: newId(), status: "draft", kind: "regular", reason: "", options: {}, freq: settings().payFrequency, periodStart: p.periodStart, periodEnd: p.periodEnd, payDate: p.payDate, lines: {} };
  S.runStep = S.run.status === "final" ? 3 : 1; S.route = "payroll"; S.sub = ""; render(); window.scrollTo(0, 0);
}
VIEWS.payroll = () => (S.run ? runFlow() : payrollList());
function payrollList() {
  const ups = upcomingPayrolls(4); const offDrafts = Object.values(S.runs).filter((r) => r.status === "draft" && r.kind === "off_cycle");
  const hist = Object.values(S.runs).filter((r) => r.status !== "draft").sort((a, b) => (a.payDate < b.payDate ? 1 : -1));
  const label = { due: '<span class="pill plain">Not started</span>', late: '<span class="pill bad">Late</span>', draft: '<span class="pill warn">In progress</span>', paid: '<span class="pill ok">Paid</span>' };
  return head("Run payroll", "Regular payrolls follow your pay schedule. Use an off-cycle payroll for bonuses, corrections, missed hours or final pay.", `<button class="btn secondary" id="offcycle" ${activeTeam().length ? "" : "disabled"}>Run an off-cycle payroll</button>`) +
    (ups.length ? `<div class="panel"><h2>Regular payrolls</h2><table><tr><th>Pay date</th><th>Work period</th><th>Status</th><th></th></tr>${ups.map((p) => `<tr><td><strong>${weekday(p.payDate)}, ${nice(p.payDate)}</strong></td><td>${nice(p.periodStart)} – ${nice(p.periodEnd)}</td><td>${label[p.state]}</td><td class="n">${p.state === "paid" ? `<button class="btn quiet" data-receipt="${p.run.id}">View</button>` : `<button class="btn ${p.state === "due" ? "secondary" : ""}" data-start="${p.payDate}">${p.state === "draft" ? "Continue" : "Run payroll"}</button>`}</td></tr>`).join("")}</table></div>`
      : `<div class="note warn">Set your pay schedule in Settings and your payrolls will line up here. <button class="btn quiet" data-go="settings/schedule">Set it up</button></div>`) +
    (offDrafts.length ? `<div class="panel"><h2>Off-cycle in progress</h2><table>${offDrafts.map((r) => `<tr><td>${esc(kindLabel(r))}</td><td>Pay date ${nice(r.payDate)}</td><td class="n"><button class="btn" data-open="${r.id}">Continue</button></td></tr>`).join("")}</table></div>` : "") +
    `<div class="panel"><h2>Payroll history</h2>${hist.length ? `<table><tr><th>Pay date</th><th>Type</th><th class="n">People</th><th class="n">Total cost</th><th>Status</th><th></th></tr>${hist.map((r) => `<tr><td>${nice(r.payDate)}</td><td>${esc(kindLabel(r))}</td><td class="n">${Object.keys(r.results || {}).length}</td><td class="n">${money(bankTotal(totals(r.results || {})))}</td><td>${r.status === "final" ? '<span class="pill ok">Paid</span>' : '<span class="pill bad">Voided</span>'}</td><td class="n"><button class="btn quiet" data-receipt="${r.id}">View</button></td></tr>`).join("")}</table>` : `<p class="empty">No payrolls yet.</p>`}</div>`;
}
function runFlow() {
  const run = S.run; const step = S.runStep;
  if (step === 3) return receiptView(S.runs[run.id] || run);
  const title = run.kind === "off_cycle" ? `Off-cycle payroll: ${kindLabel(run)}` : "Regular payroll";
  const steps = `<ol class="steps">${["Hours and earnings", "Review", "Finished"].map((l, i) => `<li class="${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}">${l}</li>`).join("")}</ol>`;
  const y = +run.payDate.slice(0, 4); const R = rates(y); const res = R ? computeRun(run) : {}; const t = totals(res || {});
  let h = head(title, `Pay date ${weekday(run.payDate)}, ${nice(run.payDate)} · work from ${nice(run.periodStart)} to ${nice(run.periodEnd)}`, `<button class="btn quiet" id="exitrun">Save and exit</button>`) + steps;
  if (!R) h += `<div class="note bad">The ${y} tax tables aren’t loaded yet. The IRS publishes them in December; ask Claude to add them before paying anyone in ${y}.</div>`;
  if (step === 1) {
    if (run.kind === "off_cycle") h += `<div class="panel"><div class="grid"><div><label for="r-pd">Pay date</label><input type="date" id="r-pd" value="${esc(run.payDate)}"></div><div><label for="r-ps">Work period start</label><input type="date" id="r-ps" value="${esc(run.periodStart)}"></div><div><label for="r-pe">Work period end</label><input type="date" id="r-pe" value="${esc(run.periodEnd)}"></div></div>
      <label class="inline-check" style="margin-top:14px"><input type="checkbox" id="r-flat" ${run.options?.bonusFlat ? "checked" : ""}> Withhold federal tax on bonuses at the flat 22% rate</label></div>`;
    const team = Object.values(S.employees).filter((e) => e.status === "active" || run.lines[e.id]).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of team) {
      const lines = (run.lines[e.id] || {}).items || [];
      const hourLines = lines.map((it, i) => [it, i]).filter(([it]) => lineType(it) === "hours");
      const bonus = lines.find((it) => lineType(it) === "bonus"); const reimb = lines.find((it) => lineType(it) === "reimb");
      const x = res && res[e.id];
      h += `<div class="coach"><div class="coach-head"><div class="person"><span class="avatar">${initials(e.name)}</span><div><h3>${esc(e.name)}</h3><div class="small muted">${esc(e.title || "Team member")} · ${e.rate !== "" ? money(e.rate) + " an hour" : "No rate set"}</div></div></div>
        <div class="small" style="text-align:right">${x ? `Gross ${money(x.gross)}<br><strong>Take-home ${money(x.net)}</strong>` : '<span class="muted">Not on this payroll</span>'}</div></div><div class="coach-body">
        ${hourLines.length ? `<table><tr><th>What</th><th class="n">Sessions</th><th class="n">Hours each</th><th class="n">Rate</th><th class="n">Amount</th><th></th></tr>${hourLines.map(([it, i]) => `<tr>
          <td><input class="wide" aria-label="What" data-e="${e.id}" data-i="${i}" data-k="desc" value="${esc(it.desc)}"></td>
          <td class="n"><input class="num-in" type="number" min="0" step="1" aria-label="Sessions" data-e="${e.id}" data-i="${i}" data-k="count" value="${esc(it.count)}"></td>
          <td class="n"><input class="num-in" type="number" min="0" step="0.25" aria-label="Hours each" data-e="${e.id}" data-i="${i}" data-k="hours" value="${esc(it.hours)}"></td>
          <td class="n"><input class="num-in" type="number" min="0" step="0.01" aria-label="Rate" data-e="${e.id}" data-i="${i}" data-k="rate" value="${esc(it.rate)}"></td>
          <td class="n">${money(lineAmount(it))}</td><td class="n"><button class="btn quiet" data-rm="${e.id}:${i}">Remove</button></td></tr>`).join("")}</table>` : ""}
        <div class="row small" style="margin-top:8px"><span class="muted">Add</span>${settings().presets.map((p, pi) => `<button class="btn quiet" data-add="${e.id}:${pi}">${esc(p.name)}</button>`).join("")}<button class="btn quiet" data-add="${e.id}:-1">Other hours</button></div>
        <div class="row earn-grid" style="margin-top:10px"><div><label for="b-${e.id}">Bonus</label><input id="b-${e.id}" type="number" min="0" step="0.01" data-extra="bonus" data-e="${e.id}" value="${esc(bonus?.amount || "")}"></div>
          <div><label for="m-${e.id}">Reimbursement (not taxed)</label><input id="m-${e.id}" type="number" min="0" step="0.01" data-extra="reimb" data-e="${e.id}" value="${esc(reimb?.amount || "")}"></div></div>
      </div></div>`;
    }
    const n = Object.keys(res || {}).length;
    h += `<div class="runbar"><div><div class="label">${n ? `${n} ${n === 1 ? "person" : "people"} · Umoja needs` : "Add hours to see the total"}</div><div class="num">${money(bankTotal(t))}</div></div>
      <div class="row"><button class="btn quiet" id="deldraft">Delete this payroll</button><button class="btn" id="toreview" ${R && n ? "" : "disabled"}>Continue to review</button></div></div>`;
    return h;
  }
  h += scoreboard(t) + `<div class="panel"><h2>What each person gets</h2><table><tr><th>Team member</th><th class="n">Gross pay</th><th class="n">Taxes withheld</th><th class="n">Reimbursement</th><th class="n">Take-home</th><th>Paid by</th></tr>
    ${Object.entries(res).map(([id, x]) => { const e = S.employees[id]; return `<tr><td>${esc(e.name)}${!(e.w4?.onFile && e.g4?.onFile) ? ' <span class="pill warn">Default withholding</span>' : ""}</td><td class="n">${money(x.gross)}</td><td class="n">${money(x.employeeTaxes)}</td><td class="n">${x.reimb ? money(x.reimb) : "—"}</td><td class="n"><strong>${money(x.net)}</strong></td><td>${esc(PAY_METHOD[e.payMethod] || "Not set")}</td></tr>`; }).join("")}
    <tr><td><strong>Total</strong></td><td class="n"><strong>${money(t.gross)}</strong></td><td class="n"><strong>${money(t.employeeTaxes)}</strong></td><td class="n"><strong>${t.reimb ? money(t.reimb) : "—"}</strong></td><td class="n"><strong>${money(t.net)}</strong></td><td></td></tr></table>
    <details><summary>How each paycheck was figured</summary>${Object.entries(res).map(([id, x]) => `<p class="small" style="margin:10px 0 2px"><strong>${esc(S.employees[id].name)}</strong></p><ul class="small">${x.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`).join("")}</details></div>
    <div class="row"><button class="btn" id="finalize">Finish payroll</button><button class="btn secondary" id="back">Back to hours</button></div>
    <p class="small muted">Finishing locks the numbers, adds them to year-to-date totals and makes the pay stubs. A finished payroll can be voided with a reason but never edited or deleted.</p>`;
  return h;
}
const saveDraft = (run) => act(async () => check(await sb.from("pay_runs").upsert(runToRow(run))));
BIND.payroll = () => {
  $$("[data-start]").forEach((b) => b.addEventListener("click", () => startRegular(b.dataset.start)));
  $$("[data-open]").forEach((b) => b.addEventListener("click", () => { S.run = structuredClone(S.runs[b.dataset.open]); S.runStep = 1; render(); }));
  $$("[data-receipt]").forEach((b) => b.addEventListener("click", () => { S.run = structuredClone(S.runs[b.dataset.receipt]); S.runStep = 3; render(); window.scrollTo(0, 0); }));
  $("#offcycle")?.addEventListener("click", startOffCycle);
  if (!S.run) return;
  const run = S.run;
  if (S.runStep === 3) return bindReceipt(S.runs[run.id] || run);
  $("#exitrun").addEventListener("click", async () => { if (Object.keys(run.lines).length || S.runs[run.id]) { if (!(await saveDraft(run))) return; } S.run = null; render(); });
  if (S.runStep === 1) {
    $("#r-pd")?.addEventListener("change", (ev) => { run.payDate = ev.target.value || run.payDate; render(); });
    $("#r-ps")?.addEventListener("change", (ev) => { run.periodStart = ev.target.value; render(); });
    $("#r-pe")?.addEventListener("change", (ev) => { run.periodEnd = ev.target.value; render(); });
    $("#r-flat")?.addEventListener("change", (ev) => { run.options = Object.assign({}, run.options, { bonusFlat: ev.target.checked }); render(); });
    $$("input[data-i]").forEach((inp) => inp.addEventListener("change", (ev) => { const { e, i, k } = ev.target.dataset; run.lines[e].items[+i][k] = ev.target.value; render(); }));
    $$("input[data-extra]").forEach((inp) => inp.addEventListener("change", (ev) => {
      const { e, extra } = ev.target.dataset; run.lines[e] = run.lines[e] || { items: [] };
      const items = run.lines[e].items.filter((it) => lineType(it) !== extra);
      if (num(ev.target.value) > 0) items.push({ type: extra, desc: extra === "bonus" ? "Bonus" : "Reimbursement", amount: num(ev.target.value) });
      run.lines[e].items = items; if (!items.length) delete run.lines[e]; render();
    }));
    $$("[data-add]").forEach((b) => b.addEventListener("click", () => {
      const [e, pi] = b.dataset.add.split(":"); const p = +pi >= 0 ? settings().presets[+pi] : { name: "", hours: "" };
      run.lines[e] = run.lines[e] || { items: [] }; run.lines[e].items.push({ type: "hours", desc: p.name, count: 1, hours: p.hours, rate: S.employees[e].rate }); render();
    }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { const [e, i] = b.dataset.rm.split(":"); run.lines[e].items.splice(+i, 1); if (!run.lines[e].items.length) delete run.lines[e]; render(); }));
    $("#toreview").addEventListener("click", async () => {
      if (!run.payDate || !run.periodStart || !run.periodEnd) { await notice("Dates needed", "Enter the pay date and the work period."); return; }
      if (await saveDraft(run)) { S.runStep = 2; render(); window.scrollTo(0, 0); }
    });
    $("#deldraft").addEventListener("click", async () => {
      if (!(await confirmBox("Delete this payroll?", "Nothing has been paid from it. The deletion is recorded in the activity log.", "Delete"))) return;
      const saved = !!S.runs[run.id]; S.run = null;
      if (saved) await act(async () => check(await sb.from("pay_runs").delete().eq("id", run.id))); else render();
    });
  } else {
    $("#back").addEventListener("click", () => { S.runStep = 1; render(); });
    $("#finalize").addEventListener("click", async () => {
      const res = computeRun(run); const t = totals(res);
      if (!(await confirmBox("Finish this payroll?", `${Object.keys(res).length} ${Object.keys(res).length > 1 ? "people" : "person"}, paid ${nice(run.payDate)}. Umoja needs ${money(bankTotal(t))} in the bank.`, "Finish payroll"))) return;
      const final = Object.assign({}, run, { status: "final", results: res, ratesUsed: rates(+run.payDate.slice(0, 4)) });
      if (await act(async () => check(await sb.from("pay_runs").upsert(runToRow(final))))) { S.run = structuredClone(S.runs[run.id]); S.runStep = 3; render(); window.scrollTo(0, 0); }
    });
  }
};
async function startOffCycle() {
  const p = dialog(`<form method="dialog" id="oc"><h3>Off-cycle payroll</h3><p>What is this payroll for?</p>
    <div class="choice">${Object.entries(REASONS).map(([k, [l, d]], i) => `<label><input type="radio" name="why" value="${k}" ${i === 0 ? "checked" : ""}>${l}<small>${d}</small></label>`).join("")}</div>
    <label for="oc-pd">Pay date</label><input id="oc-pd" type="date" required value="${todayStr()}">
    <div class="row"><button class="btn secondary" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">Continue</button></div></form>`);
  let why = "bonus", payDate = todayStr();
  $("#oc", dlg).addEventListener("submit", () => { why = $("input[name=why]:checked", dlg).value; payDate = $("#oc-pd", dlg).value; });
  if ((await p) !== "ok") return;
  S.run = { id: newId(), status: "draft", kind: "off_cycle", reason: why, options: { bonusFlat: why === "bonus" }, freq: settings().payFrequency || "biweekly", periodStart: payDate, periodEnd: payDate, payDate, lines: {} };
  S.runStep = 1; S.route = "payroll"; render();
}

// ----- Receipt -----
function receiptView(run) {
  const res = run.results || {}; const t = totals(res);
  const dl = deadlines(); const fedDue = dl.find((i) => i.key === `fed-${run.payDate.slice(0, 7)}`);
  const gaDue = dl.find((i) => i.key === `ga-${run.payDate.slice(0, 7)}`) || dl.find((i) => i.key.startsWith("g7-") && i.due >= run.payDate);
  const fresh = run.status === "final" && run.finalizedAt && Date.now() - Date.parse(run.finalizedAt) < 10 * 60e3;
  return head(fresh ? "Payroll finished" : "Payroll receipt", `${esc(kindLabel(run))} payroll · pay date ${weekday(run.payDate)}, ${nice(run.payDate)}`, `<button class="btn quiet" id="closercpt">Back to payrolls</button>`) +
    (fresh ? `<ol class="steps"><li class="done">Hours and earnings</li><li class="done">Review</li><li class="on">Finished</li></ol>` : "") +
    (run.status === "void" ? `<div class="note bad">This payroll was voided: ${esc(run.voidReason)}</div>` : "") + scoreboard(t, "Total payroll cost", false) +
    `<div class="cols"><div class="panel"><h2>Pay your team by ${nice(run.payDate)}</h2><div class="receipt-pay three">${Object.entries(res).map(([id, x]) => `<span>${esc(S.employees[id]?.name || "(deleted)")} <span class="small muted">${esc(PAY_METHOD[S.employees[id]?.payMethod] || "")}</span></span><strong>${money(x.net)}</strong>${run.status === "final" ? `<button class="btn quiet" data-stub="${id}">Pay stub</button>` : "<span></span>"}`).join("")}</div>
      ${run.status === "final" ? `<div class="row" style="margin-top:16px"><button class="btn" id="allstubs">Download all pay stubs</button></div>` : ""}</div>
      <div class="panel"><h2>Set aside for taxes</h2><div class="receipt-pay small">
        <span>IRS (EFTPS)${fedDue ? `, due ${nice(fedDue.due)}` : ""}</span><strong>${money(t.federalDeposit || 0)}</strong>
        <span>Georgia DOR${gaDue ? `, due ${nice(gaDue.due)}` : ""}</span><strong>${money(t.ga || 0)}</strong>
        ${t.suta ? `<span>GA DOL, with the quarterly report</span><strong>${money(t.suta)}</strong>` : ""}
      </div><p class="small muted">Already added to Taxes & filings.</p>
      ${run.status === "final" ? `<div class="row" style="margin-top:10px"><button class="btn secondary" id="rcptpdf">Download receipt</button><button class="btn quiet" id="voidrun">Void this payroll</button></div>` : ""}</div></div>`;
}
function bindReceipt(run) {
  $("#closercpt").addEventListener("click", () => { S.run = null; S.runStep = 1; render(); });
  $("#allstubs")?.addEventListener("click", () => stubsPdf(run, Object.keys(run.results)));
  $$("[data-stub]").forEach((b) => b.addEventListener("click", () => stubsPdf(run, [b.dataset.stub])));
  $("#rcptpdf")?.addEventListener("click", () => receiptPdf(run));
  $("#voidrun")?.addEventListener("click", async () => {
    const reason = await confirmBox("Void this payroll?", "Its amounts come out of year-to-date totals, deposits and forms. It stays in history, marked voided.", "Void payroll", true);
    if (!reason) return;
    if (await act(async () => check(await sb.from("pay_runs").update({ status: "void", void_reason: reason }).eq("id", run.id)))) { S.run = structuredClone(S.runs[run.id]); render(); }
  });
}

// ----- PDFs -----
function pdfDoc() { if (!window.jspdf) throw new Error("The PDF tool is still loading. Try again in a moment."); return new window.jspdf.jsPDF({ unit: "pt", format: "letter" }); }
function drawStub(doc, run, empId) {
  const st = settings(); const e = S.employees[empId] || { name: "Team member", address: "" };
  const x = run.results[empId]; const prev = ytdBefore(empId, run.payDate, run.id);
  const ytd = {}; for (const k of ["gross", "fit", "ssEe", "medEe", "addlMed", "ga", "net", "reimb"]) ytd[k] = r2(num(prev[k]) + num(x[k]));
  const items = ((run.lines[empId] || {}).items || []).filter((it) => lineAmount(it) > 0);
  const L = 54, R = 558; let y = 60; const t = (s, xx, yy, o) => doc.text(String(s), xx, yy, o || {}); const rule = () => { doc.setDrawColor(210); doc.line(L, y, R, y); };
  doc.setFillColor(14, 77, 58); doc.rect(0, 0, 612, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); t(st.employerName, L, y); doc.setFontSize(10); t("Earnings statement", R, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); y += 14; if (st.address) { t(st.address, L, y); y += 12; } t("EIN " + st.ein, L, y);
  y += 30; doc.setFontSize(10); doc.setFont("helvetica", "bold"); t(e.name, L, y); doc.setFont("helvetica", "normal"); t("Pay date: " + nice(run.payDate), R, y, { align: "right" });
  y += 13; if (e.address) t(e.address, L, y); t("Pay period: " + nice(run.periodStart) + " to " + nice(run.periodEnd), R, y, { align: "right" });
  y += 30; doc.setFont("helvetica", "bold"); t("Earnings", L, y); t("Sessions", 310, y, { align: "right" }); t("Hours each", 380, y, { align: "right" }); t("Rate", 450, y, { align: "right" }); t("Amount", R, y, { align: "right" });
  doc.setFont("helvetica", "normal"); y += 6; rule(); y += 15;
  for (const it of items.filter((i) => lineType(i) !== "reimb")) { if (lineType(it) === "hours") { t(it.desc || "Hours", L, y); t(num(it.count), 310, y, { align: "right" }); t(num(it.hours), 380, y, { align: "right" }); t(money(it.rate), 450, y, { align: "right" }); } else t(it.desc || "Bonus", L, y); t(money(lineAmount(it)), R, y, { align: "right" }); y += 15; }
  rule(); y += 16; doc.setFont("helvetica", "bold"); t("Gross pay", L, y); t(money(x.gross), R, y, { align: "right" }); y += 32;
  t("Taxes withheld", L, y); t("This period", 450, y, { align: "right" }); t("Year to date", R, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 6; rule(); y += 15;
  const rows = [["Federal income tax", "fit"], ["Social Security", "ssEe"], ["Medicare", "medEe"]]; if (ytd.addlMed) rows.push(["Additional Medicare", "addlMed"]); rows.push(["Georgia income tax", "ga"]);
  for (const [l, k] of rows) { t(l, L, y); t(money(x[k]), 450, y, { align: "right" }); t(money(ytd[k]), R, y, { align: "right" }); y += 15; }
  if (x.reimb || ytd.reimb) { rule(); y += 16; t("Reimbursement (not taxed)", L, y); t(money(x.reimb || 0), 450, y, { align: "right" }); t(money(ytd.reimb), R, y, { align: "right" }); y += 15; }
  rule(); y += 16; t("Gross pay", L, y); t(money(x.gross), 450, y, { align: "right" }); t(money(ytd.gross), R, y, { align: "right" }); y += 22;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); t("Net pay", L, y); t(money(x.net), 450, y, { align: "right" }); t(money(ytd.net), R, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); y += 22; if (e.payMethod) t("Paid by " + PAY_METHOD[e.payMethod].toLowerCase(), L, y);
}
async function stubsPdf(run, ids) {
  try {
    const doc = pdfDoc(); ids.forEach((id, i) => { if (i) doc.addPage(); drawStub(doc, run, id); });
    const name = ids.length === 1 ? (S.employees[ids[0]]?.name || "Team member") : "all";
    doc.save(`Umoja pay stub${ids.length > 1 ? "s" : ""} - ${name} - ${run.payDate}.pdf`);
    try { await addLog("Pay stubs downloaded", `${ids.length === 1 ? name : ids.length + " people"}, pay date ${run.payDate}`); } catch (_) {}
  } catch (e) { await notice("Download didn’t start", esc(e.message)); }
}
async function receiptPdf(run) {
  try {
    const doc = pdfDoc(); const st = settings(); const res = run.results; const t = totals(res); let y = 60; const L = 54, R = 558; const tx = (s, x, yy, o) => doc.text(String(s), x, yy, o || {});
    doc.setFillColor(14, 77, 58); doc.rect(0, 0, 612, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); tx(st.employerName, L, y); doc.setFontSize(10); tx("Payroll receipt", R, y, { align: "right" });
    doc.setFont("helvetica", "normal"); y += 18; tx(`${kindLabel(run)} payroll · pay date ${nice(run.payDate)} · work from ${nice(run.periodStart)} to ${nice(run.periodEnd)}`, L, y);
    y += 30; doc.setFont("helvetica", "bold"); tx("Team member", L, y); tx("Gross", 330, y, { align: "right" }); tx("Withheld", 410, y, { align: "right" }); tx("Reimb.", 480, y, { align: "right" }); tx("Net pay", R, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 16;
    for (const [id, x] of Object.entries(res)) { tx(S.employees[id]?.name || "(deleted)", L, y); tx(money(x.gross), 330, y, { align: "right" }); tx(money(x.employeeTaxes), 410, y, { align: "right" }); tx(money(x.reimb || 0), 480, y, { align: "right" }); tx(money(x.net), R, y, { align: "right" }); y += 15; }
    y += 14; const line = (l, v, b) => { doc.setFont("helvetica", b ? "bold" : "normal"); tx(l, L, y); tx(money(v), R, y, { align: "right" }); y += 16; };
    line("Paid to team members", t.net); line("Federal deposit (income tax, Social Security, Medicare)", t.federalDeposit); line("Georgia income tax withheld", t.ga); if (t.suta) line("Georgia unemployment", t.suta); line("Total payroll cost", bankTotal(t), true);
    doc.save(`Umoja payroll receipt - ${run.payDate}.pdf`);
  } catch (e) { await notice("Download didn’t start", esc(e.message)); }
}

// ----- Team -----
VIEWS.team = () => (S.sub ? personView(S.sub) : teamList());
function teamList() {
  const all = Object.values(S.employees).sort((a, b) => (a.status !== "active") - (b.status !== "active") || a.name.localeCompare(b.name));
  return head("Team", "Everyone on Umoja’s payroll. Social Security and bank account numbers are never stored here.", `<button class="btn" id="addperson">Add a team member</button>`) +
    `<div class="panel">${all.length ? `<table><tr><th>Name</th><th>Role</th><th>Rate</th><th>Onboarding</th><th>Status</th></tr>${all.map((e) => `<tr class="click" data-go="team/${e.id}" data-tab="overview"><td><div class="person"><span class="avatar">${initials(e.name)}</span><div><strong>${esc(e.name)}</strong>${isSample(e) ? ' <span class="pill plain">Sample</span>' : ""}<div class="small muted">${esc(e.email)}</div></div></div></td><td>${esc(e.title || "—")}</td><td>${e.rate !== "" ? money(e.rate) + "/hr" : "—"}</td><td><span class="progress"><i style="width:${(obCount(e) / ONBOARD.length) * 100}%"></i></span> <span class="small muted">${obCount(e)} of ${ONBOARD.length}</span></td><td>${e.status === "active" ? '<span class="pill ok">Active</span>' : `<span class="pill plain">Left ${nice(e.dismissedOn)}</span>`}</td></tr>`).join("")}</table>` : `<p class="empty">No team members yet.</p>`}</div>`;
}
function personView(id) {
  const e = S.employees[id]; if (!e) return `<p class="empty">That team member wasn’t found.</p>`;
  const tab = S.personTab || "overview";
  const tabs = [["overview", "Overview"], ["pay", "Pay"], ["taxes", "Taxes"], ["onboarding", `Onboarding ${obCount(e)}/${ONBOARD.length}`], ["stubs", "Pay stubs"]];
  const stubs = finalRuns().filter((r) => r.results?.[id]).reverse();
  const ytd = ytdBefore(id, `${new Date().getFullYear()}-12-31`, null);
  const sel = (fid, opts, v) => `<select id="${fid}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const yn = (fid, v, no = "No", yes = "Yes") => sel(fid, [["0", no], ["1", yes]], v ? "1" : "0");
  const w = e.w4 || {}, g = e.g4 || {};
  let body = "";
  if (tab === "overview") body = `<form class="panel" id="pf"><div class="grid">
      <div><label for="f-name">Full legal name</label><input id="f-name" required value="${esc(e.name)}"></div>
      <div><label for="f-title">Role</label><input id="f-title" value="${esc(e.title)}" placeholder="Head coach"></div>
      <div><label for="f-email">Email</label><input id="f-email" type="email" value="${esc(e.email)}"></div>
      <div><label for="f-phone">Phone</label><input id="f-phone" value="${esc(e.phone)}"></div>
      <div><label for="f-hire">Start date</label><input id="f-hire" type="date" value="${esc(e.hireDate)}"></div>
      <div style="grid-column:1/-1"><label for="f-addr">Home address (prints on W-2 and pay stubs)</label><input id="f-addr" value="${esc(e.address)}"></div>
    </div><div class="row" style="margin-top:16px"><button class="btn" type="submit">Save</button></div></form>
    <div class="panel tint"><h2>${e.status === "active" ? "Leaving Umoja?" : "Coming back?"}</h2>${e.status === "active" ? `<p class="small">Marking them as leaving takes them off future payrolls. Run their final pay as an off-cycle payroll. Their records stay.</p><div class="row"><button class="btn danger" id="dismiss">Mark as leaving</button>` : `<p class="small">Left on ${nice(e.dismissedOn)}.</p><div class="row"><button class="btn secondary" id="rehire">Make active again</button>`}
    ${!Object.values(S.runs).some((r) => r.lines[id]) ? `<button class="btn quiet" id="delperson">Delete (never paid)</button>` : ""}</div></div>`;
  if (tab === "pay") body = `<form class="panel" id="payf"><div class="grid">
      <div><label for="p-rate">Hourly rate</label><input id="p-rate" type="number" min="0" step="0.01" value="${esc(e.rate)}"></div>
      <div><label for="p-eff">If the rate changes, it starts on</label><input id="p-eff" type="date" value="${todayStr()}"></div>
      <div><label for="p-method">How they’re paid</label>${sel("p-method", [["", "Choose"], ...Object.entries(PAY_METHOD)], e.payMethod)}</div>
    </div><p class="small muted">Bank account numbers aren’t stored here; keep them with your bank.</p><div class="row"><button class="btn" type="submit">Save</button></div></form>
    <div class="panel"><h2>Rate history</h2>${(e.compHistory || []).length ? `<table><tr><th>Starting</th><th>Role</th><th class="n">Rate</th></tr>${[...e.compHistory].reverse().map((c) => `<tr><td>${nice(c.effective)}</td><td>${esc(c.title || "")}</td><td class="n">${money(c.rate)}/hr</td></tr>`).join("")}</table>` : `<p class="empty">No changes recorded yet.</p>`}</div>
    <div class="panel tint"><h2>This year</h2><div class="stats"><div class="stat"><div class="label">Gross pay</div><div class="num">${money(ytd.gross)}</div></div><div class="stat"><div class="label">Taxes withheld</div><div class="num">${money(r2(ytd.fit + ytd.ssEe + ytd.medEe + ytd.addlMed + ytd.ga))}</div></div><div class="stat"><div class="label">Take-home</div><div class="num">${money(ytd.net)}</div></div></div></div>`;
  if (tab === "taxes") body = `<form class="panel" id="taxf"><h2>Federal W-4</h2><div class="grid">
      <div><label for="w-on">W-4 on file?</label>${yn("w-on", w.onFile, "No (withhold as Single)")}</div>
      <div><label for="w-st">Step 1(c) filing status</label>${sel("w-st", Object.entries(W4_LABEL), w.status || "single")}</div>
      <div><label for="w-s2">Step 2(c) box checked?</label>${yn("w-s2", w.step2)}</div>
      <div><label for="w-s3">Step 3 credits (per year)</label><input id="w-s3" type="number" min="0" value="${esc(w.step3 || "")}"></div>
      <div><label for="w-s4a">Step 4(a) other income (per year)</label><input id="w-s4a" type="number" min="0" value="${esc(w.step4a || "")}"></div>
      <div><label for="w-s4b">Step 4(b) deductions (per year)</label><input id="w-s4b" type="number" min="0" value="${esc(w.step4b || "")}"></div>
      <div><label for="w-s4c">Step 4(c) extra per paycheck</label><input id="w-s4c" type="number" min="0" value="${esc(w.step4c || "")}"></div>
      <div><label for="w-ex">Wrote “Exempt”?</label>${yn("w-ex", w.exempt)}</div></div>
      <h2 style="margin-top:22px">Georgia G-4</h2><div class="grid">
      <div><label for="g-on">G-4 on file?</label>${yn("g-on", g.onFile, "No (Single, zero allowances)")}</div>
      <div><label for="g-st">Line 3 marital status</label>${sel("g-st", Object.entries(G4_LABEL), g.status || "A")}</div>
      <div><label for="g-dep">Line 4 dependent allowances</label><input id="g-dep" type="number" min="0" value="${esc(g.deps || "")}"></div>
      <div><label for="g-add">Line 5 additional allowances</label><input id="g-add" type="number" min="0" value="${esc(g.addl || "")}"></div>
      <div><label for="g-ext">Line 6 extra per paycheck</label><input id="g-ext" type="number" min="0" value="${esc(g.extra || "")}"></div>
      <div><label for="g-ex">Line 8 exempt?</label>${yn("g-ex", g.exempt)}</div></div>
      <div class="row" style="margin-top:16px"><button class="btn" type="submit">Save tax forms</button></div></form>`;
  if (tab === "onboarding") body = `<div class="panel">${ONBOARD.map((it) => { const done = obDone(e, it); const due = it.due ? it.due(e) : null; return `<div class="check"><span class="box ${done ? "on" : ""}">${done ? "✓" : ""}</span><div><strong>${it.label}</strong><div class="small muted">${done && !it.auto ? `Done ${nice(e.onboarding[it.key])}` : it.how}${!done && due ? ` Due ${nice(due)}.` : ""}</div></div>
      ${it.auto ? (done ? "" : `<button class="btn quiet" data-ptab="${it.tab}">Open</button>`) : done ? `<button class="btn quiet" data-undo="${it.key}">Undo</button>` : `<button class="btn quiet" data-odone="${it.key}">Mark done</button>`}</div>`; }).join("")}</div>`;
  if (tab === "stubs") body = `<div class="panel">${stubs.length ? `<table><tr><th>Pay date</th><th class="n">Gross</th><th class="n">Take-home</th><th></th></tr>${stubs.map((r) => `<tr><td>${nice(r.payDate)}${r.kind === "off_cycle" ? ` <span class="pill plain">${esc(kindLabel(r))}</span>` : ""}</td><td class="n">${money(r.results[id].gross)}</td><td class="n">${money(r.results[id].net)}</td><td class="n"><button class="btn quiet" data-stubrun="${r.id}">Download</button></td></tr>`).join("")}</table>` : `<p class="empty">No pay stubs yet.</p>`}</div>`;
  return `<button class="btn quiet" data-go="team" style="margin-bottom:10px">← Team</button>` +
    `<div class="page-head"><div class="person"><span class="avatar big">${initials(e.name)}</span><div><h1>${esc(e.name)}</h1><p class="lede">${esc(e.title || "Team member")}${e.rate !== "" ? ` · ${money(e.rate)} an hour` : ""} · ${e.status === "active" ? "Active" : "Left " + nice(e.dismissedOn)}</p></div></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-ptab="${k}">${l}</button>`).join("")}</div>` + body;
}
async function newPerson() {
  const v = await formDialog("Add a team member", "", [{ id: "name", label: "Full legal name", required: true }, { id: "title", label: "Role", placeholder: "Head coach" }, { id: "rate", label: "Hourly rate", type: "number" }, { id: "hire", label: "Start date", type: "date", value: todayStr() }], "Add");
  if (!v || !v.name) return;
  const e = { name: v.name, title: v.title, rate: v.rate, hireDate: v.hire, status: "active", w4: { onFile: false, status: "single" }, g4: { onFile: false, status: "A" }, onboarding: {}, compHistory: v.rate !== "" ? [{ effective: v.hire || todayStr(), rate: num(v.rate), title: v.title }] : [] };
  let created = null;
  await act(async () => { const d = check(await sb.from("employees").insert(empToRow(e)).select("id").single()); created = d?.id; });
  if (created) go(`team/${created}`, "taxes");
}
BIND.team = () => {
  $("#addperson")?.addEventListener("click", newPerson);
  if (!S.sub || !S.employees[S.sub]) return;
  const id = S.sub; const e = structuredClone(S.employees[id]);
  const save = (patch) => act(async () => check(await sb.from("employees").update(empToRow(Object.assign(e, patch))).eq("id", id)));
  $$("[data-ptab]").forEach((b) => b.addEventListener("click", () => { S.personTab = b.dataset.ptab; render(); }));
  const v = (s) => $(s).value; const b = (s) => $(s).value === "1";
  $("#pf")?.addEventListener("submit", (ev) => { ev.preventDefault(); save({ name: v("#f-name").trim(), title: v("#f-title").trim(), email: v("#f-email").trim(), phone: v("#f-phone").trim(), hireDate: v("#f-hire"), address: v("#f-addr").trim() }); });
  $("#payf")?.addEventListener("submit", (ev) => {
    ev.preventDefault(); const rate = v("#p-rate"); const patch = { payMethod: v("#p-method") };
    if (rate !== "" && num(rate) !== num(e.rate)) { patch.rate = num(rate); patch.compHistory = [...(e.compHistory || []), { effective: v("#p-eff") || todayStr(), rate: num(rate), title: e.title }]; }
    save(patch);
  });
  $("#taxf")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    save({ w4: { onFile: b("#w-on"), status: v("#w-st"), step2: b("#w-s2"), step3: num(v("#w-s3")), step4a: num(v("#w-s4a")), step4b: num(v("#w-s4b")), step4c: num(v("#w-s4c")), exempt: b("#w-ex") },
      g4: { onFile: b("#g-on"), status: v("#g-st"), deps: num(v("#g-dep")), addl: num(v("#g-add")), extra: num(v("#g-ext")), exempt: b("#g-ex") } });
  });
  $$("[data-odone]").forEach((btn) => btn.addEventListener("click", async () => {
    const r = await formDialog("Mark done", ONBOARD.find((i) => i.key === btn.dataset.odone).label, [{ id: "d", label: "Date", type: "date", value: todayStr(), required: true }]);
    if (r) save({ onboarding: Object.assign({}, e.onboarding, { [btn.dataset.odone]: r.d }) });
  }));
  $$("[data-undo]").forEach((btn) => btn.addEventListener("click", () => { const o = Object.assign({}, e.onboarding); delete o[btn.dataset.undo]; save({ onboarding: o }); }));
  $$("[data-stubrun]").forEach((btn) => btn.addEventListener("click", () => stubsPdf(S.runs[btn.dataset.stubrun], [id])));
  $("#dismiss")?.addEventListener("click", async () => {
    const r = await formDialog(`Mark ${e.name} as leaving`, "Run their final pay as an off-cycle payroll.", [{ id: "d", label: "Last day", type: "date", value: todayStr(), required: true }], "Mark as leaving");
    if (r) save({ status: "dismissed", dismissedOn: r.d });
  });
  $("#rehire")?.addEventListener("click", () => save({ status: "active", dismissedOn: "" }));
  $("#delperson")?.addEventListener("click", async () => { if (await confirmBox(`Delete ${e.name}?`, "They’ve never been on a payroll. The deletion is recorded in the activity log.", "Delete")) { if (await act(async () => check(await sb.from("employees").delete().eq("id", id)))) go("team"); } });
};

// ----- Contractors -----
VIEWS.contractors = () => {
  const y = new Date().getFullYear(); const th = NEC_THRESHOLD[y] || 2000;
  const list = Object.values(S.contractors).sort((a, b) => a.name.localeCompare(b.name));
  return head("Contractors", `People you pay without withholding taxes, like referees or trainers. Anyone paid ${money0(th)} or more in ${y} gets a Form 1099-NEC by January 31. Taxpayer ID numbers are never stored here.`, `<div class="row"><button class="btn secondary" id="addcon">Add a contractor</button><button class="btn" id="paycon" ${list.length ? "" : "disabled"}>Record a payment</button></div>`) +
    `<div class="panel">${list.length ? `<table><tr><th>Contractor</th><th>W-9</th><th class="n">Paid in ${y}</th><th>1099-NEC</th><th></th></tr>${list.map((c) => { const paid = contractorYear(c.id, y); return `<tr><td><strong>${esc(c.name)}</strong>${c.businessName ? `<div class="small muted">${esc(c.businessName)}</div>` : ""}</td><td>${c.w9 ? `Received ${nice(c.w9)}` : '<span class="pill warn">Missing</span>'}</td><td class="n">${money(paid)}</td><td>${paid >= th ? '<span class="pill warn">Needed</span>' : '<span class="small muted">Not needed yet</span>'}</td><td class="n"><button class="btn quiet" data-econ="${c.id}">Edit</button></td></tr>`; }).join("")}</table>` : `<p class="empty">No contractors yet.</p>`}</div>
    <div class="panel"><h2>Payments</h2>${S.cpay.length ? `<table><tr><th>Date</th><th>Contractor</th><th>For</th><th class="n">Amount</th><th></th></tr>${[...S.cpay].reverse().map((p) => `<tr><td>${nice(p.paidOn)}</td><td>${esc(S.contractors[p.contractorId]?.name || "")}</td><td>${esc(p.memo)}</td><td class="n">${money(p.amount)}</td><td class="n"><button class="btn quiet" data-delpay="${p.id}">Delete</button></td></tr>`).join("")}</table>` : `<p class="empty">No payments yet.</p>`}</div>`;
};
BIND.contractors = () => {
  const conForm = async (c) => {
    c = c || {};
    const v = await formDialog(c.id ? "Edit contractor" : "Add a contractor", "", [{ id: "name", label: "Name", value: c.name, required: true }, { id: "biz", label: "Business name (if any)", value: c.businessName }, { id: "email", label: "Email", type: "email", value: c.email }, { id: "addr", label: "Mailing address (for the 1099)", value: c.address }, { id: "w9", label: "Date their W-9 was received", type: "date", value: c.w9 }]);
    if (!v || !v.name) return;
    const row = { name: v.name, business_name: v.biz || null, email: v.email || null, address: v.addr || null, w9_received: v.w9 || null };
    await act(async () => check(c.id ? await sb.from("contractors").update(row).eq("id", c.id) : await sb.from("contractors").insert(row)));
  };
  $("#addcon").addEventListener("click", () => conForm(null));
  $$("[data-econ]").forEach((b) => b.addEventListener("click", () => conForm(S.contractors[b.dataset.econ])));
  $("#paycon")?.addEventListener("click", async () => {
    const list = Object.values(S.contractors).sort((a, b) => a.name.localeCompare(b.name));
    const v = await formDialog("Record a contractor payment", "", [{ id: "c", label: "Contractor", type: "select", options: list.map((c) => [c.id, c.name]), value: list[0]?.id }, { id: "d", label: "Paid on", type: "date", value: todayStr(), required: true }, { id: "a", label: "Amount", type: "number", required: true }, { id: "m", label: "What it was for", placeholder: "Referee, Dec 5 games" }]);
    if (!v || !(num(v.a) > 0)) return;
    await act(async () => check(await sb.from("contractor_payments").insert({ contractor_id: v.c, paid_on: v.d, amount: num(v.a), memo: v.m || null })));
  });
  $$("[data-delpay]").forEach((b) => b.addEventListener("click", async () => { if (await confirmBox("Delete this payment?", "The deletion is recorded in the activity log.", "Delete")) await act(async () => check(await sb.from("contractor_payments").delete().eq("id", b.dataset.delpay))); }));
};

// ----- Taxes & filings -----
function status(it) {
  const d = S.done[it.key]; if (d) return `<span class="pill ok">Done ${niceShort(d.date)}</span>`;
  const days = daysUntil(it.due); if (days < 0) return '<span class="pill bad">Past due</span>'; if (days <= 10) return '<span class="pill warn">Due soon</span>'; return "";
}
VIEWS.taxes = () => {
  const tab = S.sub || "pay"; const st = settings();
  const tabs = `<div class="tabs" role="tablist">${[["pay", "To pay"], ["calendar", "Deadlines"], ["forms", "Forms"]].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-go="taxes/${k}">${l}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "pay") {
    const all = deadlines().filter((i) => i.pay); const open = all.filter((i) => !S.done[i.key] && i.amount > 0); const paid = all.filter((i) => S.done[i.key]);
    body = `<div class="panel"><h2>To pay</h2>${open.length ? `<table><tr><th>Due</th><th>Where</th><th>For</th><th class="n">Amount</th><th></th></tr>${open.map((i) => `<tr><td>${nice(i.due)} ${status(i)}</td><td>${esc(i.where)}</td><td>${esc(i.what)}</td><td class="n"><strong>${money(i.amount)}</strong></td><td class="n"><button class="btn quiet" data-fdone="${i.key}">Mark paid</button></td></tr>`).join("")}</table>` : `<p class="empty">Nothing owed right now.</p>`}
      <p class="small muted">Schedule EFTPS payments by 8 p.m. Eastern the day before they’re due. Umoja deposits federal taxes monthly. If a quarter’s federal total stays under $2,500, the IRS lets you pay it with Form 941 instead.${st.sutaMethod === "reimbursable" ? " Georgia unemployment is set to reimbursable, so Georgia bills Umoja only if a former team member collects benefits." : ""}</p></div>
      <div class="panel"><h2>Paid</h2>${paid.length ? `<table><tr><th>Paid</th><th>For</th><th class="n">Amount</th><th>Confirmation</th><th></th></tr>${paid.map((i) => { const d = S.done[i.key]; const changed = d.amount != null && Math.abs(d.amount - i.amount) > 0.004; return `<tr><td>${nice(d.date)}</td><td>${esc(i.what)}</td><td class="n">${money(d.amount ?? i.amount)}${changed ? ` <span class="pill bad">Now ${money(i.amount)}</span>` : ""}</td><td>${esc(d.confirmation || "—")}</td><td class="n"><button class="btn quiet" data-fdone="${i.key}">Undo</button></td></tr>`; }).join("")}</table>` : `<p class="empty">Nothing yet.</p>`}</div>`;
  } else if (tab === "calendar") {
    let cur = "";
    body = `<div class="panel"><table>${deadlines().map((i) => { const mk = i.due.slice(0, 7); let row = ""; if (mk !== cur) { cur = mk; const d = pd(i.due); row = `<tr class="month"><td colspan="5">${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}</td></tr>`; }
      return row + `<tr><td style="white-space:nowrap">${nice(i.due)}</td><td class="small muted">${esc(i.where)}</td><td>${esc(i.what)}</td><td class="n">${i.amount !== undefined ? (i.amount > 0 ? money(i.amount) : '<span class="muted">$0 so far</span>') : ""}</td><td class="n" style="white-space:nowrap">${status(i)} <button class="btn quiet" data-fdone="${i.key}">${S.done[i.key] ? "Undo" : "Mark done"}</button></td></tr>`; }).join("")}</table>
      <p class="small muted">Dates already move to the next business day when they land on a weekend or federal holiday. Unverified: Georgia agencies follow state holidays, which can differ by a day.</p></div>`;
  } else body = formsView();
  return head("Taxes & filings", "Every deposit and form, with the amounts already figured.") + tabs + body;
};
function w2Totals(y) {
  const W = {};
  for (const r of finalRuns().filter((r) => r.payDate.slice(0, 4) === y)) for (const [id, x] of Object.entries(r.results || {})) {
    const w = (W[id] = W[id] || { b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0, b16: 0, b17: 0 });
    w.b1 = r2(w.b1 + x.gross); w.b2 = r2(w.b2 + x.fit); w.b3 = r2(w.b3 + x.ssWages); w.b4 = r2(w.b4 + x.ssEe); w.b5 = r2(w.b5 + x.medWages); w.b6 = r2(w.b6 + x.medEe + x.addlMed); w.b16 = r2(w.b16 + x.gaWages); w.b17 = r2(w.b17 + x.ga);
  }
  return W;
}
function formsView() {
  const years = [...new Set(finalRuns().map((r) => r.payDate.slice(0, 4)))]; if (!years.length) years.push(String(new Date().getFullYear()));
  const y = S.repYear && years.includes(S.repYear) ? S.repYear : years[years.length - 1];
  const st = settings(); const m = liabilities(); const W = w2Totals(y); const runs = finalRuns().filter((r) => r.payDate.slice(0, 4) === y);
  const quarters = [1, 2, 3, 4].map((q) => {
    const qm = [0, 1, 2].map((i) => (q - 1) * 3 + i); const f = (k) => sumMonths(m, +y, qm, k);
    const d12 = `${y}-${String(q * 3).padStart(2, "0")}-12`;
    const count = new Set(runs.filter((r) => r.periodStart <= d12 && r.periodEnd >= d12).flatMap((r) => Object.keys(r.results || {}))).size;
    const l5a = r2(f("ssWages") * 0.124), l5c = r2(f("gross") * 0.029), l5d = r2(f("addlWages") * 0.009), l5e = r2(l5a + l5c + l5d), l6 = r2(f("fit") + l5e), actual = r2(f("fit") + f("ss") + f("med") + f("addl"));
    const dep = r2(qm.map((mm) => S.done[`fed-${mkey(y, mm)}`]).filter(Boolean).reduce((s, d) => s + num(d.amount), 0));
    return { q, qm, count, wages: f("gross"), fit: f("fit"), ssW: f("ssWages"), l5a, l5c, addW: f("addlWages"), l5d, l5e, l6, l7: r2(actual - l6), total: actual, dep, months: qm.map((mm) => num((m[mkey(y, mm)] || {}).fed)), gaMonths: qm.map((mm) => num((m[mkey(y, mm)] || {}).ga)), ga: f("ga"), sutaW: f("sutaWages"), suta: f("suta") };
  }).filter((q) => q.wages > 0);
  const sum = (pairs) => `<div class="sum small">${pairs.map(([a, b, tot]) => `<span${tot ? ' class="total"' : ""}>${a}</span><span${tot ? ' class="total"' : ""}>${b}</span>`).join("")}</div>`;
  const th = NEC_THRESHOLD[y] || 2000; const cons = Object.values(S.contractors).map((c) => [c, contractorYear(c.id, y)]).filter(([, a]) => a > 0);
  return `<div class="row" style="margin-bottom:14px"><label for="ry" style="margin:0">Year</label><select id="ry" style="width:auto">${years.map((v) => `<option ${v === y ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    <div class="panel"><div class="spread"><h2>W-2s</h2><button class="btn secondary" id="w2csv" ${Object.keys(W).length ? "" : "disabled"}>Download spreadsheet</button></div>
    ${Object.keys(W).length ? `<table><tr><th>Team member</th><th class="n">Box 1</th><th class="n">Box 2</th><th class="n">Box 3</th><th class="n">Box 4</th><th class="n">Box 5</th><th class="n">Box 6</th><th class="n">Box 16</th><th class="n">Box 17</th></tr>${Object.entries(W).map(([id, w]) => `<tr><td>${esc(S.employees[id]?.name || "(deleted)")}</td>${["b1", "b2", "b3", "b4", "b5", "b6", "b16", "b17"].map((k) => `<td class="n">${money(w[k])}</td>`).join("")}</tr>`).join("")}</table>
    <p class="small muted">Box 1 wages, 2 federal tax, 3 Social Security wages, 4 Social Security tax, 5 Medicare wages, 6 Medicare tax, 16 Georgia wages, 17 Georgia tax. Box 15: GA, ${esc(st.gaWithholdingId)}. EIN ${esc(st.ein)}. Reimbursements aren’t wages and aren’t included.</p>` : `<p class="empty">No finished payrolls in ${y}.</p>`}</div>
    ${cons.length ? `<div class="panel"><h2>1099-NEC</h2><table><tr><th>Contractor</th><th class="n">Box 1, nonemployee compensation</th><th>Needed?</th></tr>${cons.map(([c, a]) => `<tr><td>${esc(c.name)}</td><td class="n">${money(a)}</td><td>${a >= th ? "Yes" : `No, under ${money0(th)}`}</td></tr>`).join("")}</table></div>` : ""}` +
    quarters.map((q) => `<div class="panel"><h2>Q${q.q} ${y}</h2><div class="money">
      <div><h3 style="margin-bottom:6px">Form 941</h3>${sum([[`Line 1, people paid for the period with ${["Mar", "Jun", "Sep", "Dec"][q.q - 1]} 12`, q.count], ["Line 2, wages", money(q.wages)], ["Line 3, income tax withheld", money(q.fit)], ["Line 5a, column 2", money(q.l5a)], ["Line 5c, column 2", money(q.l5c)], ...(q.addW ? [["Line 5d, column 2", money(q.l5d)]] : []), ["Line 5e", money(q.l5e)], ["Line 6", money(q.l6)], ["Line 7, fractions of cents", money(q.l7)], ["Lines 10 and 12", money(q.total), true], ["Line 13, deposits marked paid", money(q.dep)], ["Line 16, months 1 / 2 / 3", q.months.map(money).join(" / ")]])}
      <p class="small muted">Line 5a column 1 is ${money(q.ssW)}; line 5c column 1 is ${money(q.wages)}.</p></div>
      <div><h3 style="margin-bottom:6px">Georgia G-7</h3>${sum([...q.qm.map((mm, i) => [`${MONTHS[mm]} withheld`, money(q.gaMonths[i])]), ["Quarter total", money(q.ga), true]])}</div>
      <div><h3 style="margin-bottom:6px">GA DOL-4N</h3>${sum([["Item 2, gross wages", money(q.wages)], ["Item 3, wages over $9,500", money(r2(q.wages - q.sutaW))], ["Item 4, taxable wages", money(q.sutaW)], ["Tax due", money(q.suta), true]])}${!st.gaDolAccount ? '<p class="small muted">DOL account number not entered yet.</p>' : ""}</div>
    </div></div>`).join("");
}
BIND.taxes = () => {
  $$("[data-fdone]").forEach((b) => b.addEventListener("click", async () => {
    const key = b.dataset.fdone; const it = deadlines().find((i) => i.key === key);
    if (S.done[key]) {
      const reason = await confirmBox("Undo this?", `${esc(it ? it.what : key)} will show as not done again.`, "Undo", true); if (!reason) return;
      await act(async () => { check(await sb.from("filings_done").delete().eq("key", key)); await addLog("Reason for undo", `${it ? it.what : key}: ${reason}`); }); return;
    }
    const v = await formDialog("Mark done", `${esc(it.what)}${it.amount !== undefined ? ` · <strong>${money(it.amount)}</strong>` : ""}`, [{ id: "d", label: "Date paid or filed", type: "date", value: todayStr(), required: true }, { id: "c", label: "Confirmation number" }]);
    if (!v) return;
    await act(async () => check(await sb.from("filings_done").upsert({ key, done_date: v.d, confirmation: v.c || null, amount: it.amount === undefined ? null : it.amount })));
  }));
  $("#ry")?.addEventListener("change", (ev) => { S.repYear = ev.target.value; render(); });
  $("#w2csv")?.addEventListener("click", async () => {
    const y = $("#ry").value; const W = w2Totals(y); const st = settings();
    const rows = [["Team member", "Address", "Box 1", "Box 2", "Box 3", "Box 4", "Box 5", "Box 6", "Box 15 state ID", "Box 16", "Box 17"]];
    for (const [id, w] of Object.entries(W)) { const e = S.employees[id] || {}; rows.push([e.name, e.address, w.b1, w.b2, w.b3, w.b4, w.b5, w.b6, st.gaWithholdingId, w.b16, w.b17].map(fix2)); }
    download(`Umoja W-2 totals ${y}.csv`, csv(rows), "text/csv"); try { await addLog("W-2 totals downloaded", y); } catch (_) {}
  });
};

// ----- Reports -----
VIEWS.reports = () => {
  const years = [...new Set([...finalRuns().map((r) => r.payDate.slice(0, 4)), String(new Date().getFullYear())])].sort();
  const y = S.repYear && years.includes(S.repYear) ? S.repYear : years[years.length - 1];
  const by = S.repBy || "month";
  const runs = finalRuns().filter((r) => r.payDate.slice(0, 4) === y);
  const groups = {};
  for (const r of runs) { const mo = +r.payDate.slice(5, 7) - 1; const k = by === "month" ? MONTHS[mo] : by === "quarter" ? `Q${(mo / 3 | 0) + 1}` : by === "payroll" ? `${nice(r.payDate)} (${kindLabel(r)})` : y; const t = totals(r.results || {}); const g = (groups[k] = groups[k] || {}); for (const [kk, vv] of Object.entries(t)) g[kk] = r2((g[kk] || 0) + vv); g.bank = r2((g.bank || 0) + bankTotal(t)); }
  const cols = [["gross", "Gross pay"], ["employeeTaxes", "Taxes withheld"], ["reimb", "Reimbursements"], ["net", "Take-home"], ["er", "Umoja’s taxes"], ["bank", "Total cost"]];
  for (const g of Object.values(groups)) g.er = r2((g.ssEr || 0) + (g.medEr || 0) + (g.suta || 0));
  const tot = {}; for (const g of Object.values(groups)) for (const [k] of cols) tot[k] = r2((tot[k] || 0) + (g[k] || 0));
  const hasCon = S.cpay.some((p) => p.paidOn.slice(0, 4) === y);
  const rep = (id, title, desc, on) => `<div class="check" style="grid-template-columns:1fr auto"><div><strong>${title}</strong><div class="small muted">${desc}</div></div><button class="btn secondary" id="${id}" ${on ? "" : "disabled"}>Download</button></div>`;
  return head("Reports", "Download any report as a spreadsheet for your treasurer or accountant.", `<select id="ry2" style="width:auto" aria-label="Year">${years.map((v) => `<option ${v === y ? "selected" : ""}>${v}</option>`).join("")}</select>`) +
    `<div class="panel"><div class="spread"><h2>Payroll summary</h2><div class="row"><select id="by" style="width:auto" aria-label="Group by">${[["payroll", "By payroll"], ["month", "By month"], ["quarter", "By quarter"], ["year", "Whole year"]].map(([k, l]) => `<option value="${k}" ${by === k ? "selected" : ""}>${l}</option>`).join("")}</select><button class="btn secondary" id="sumcsv" ${runs.length ? "" : "disabled"}>Download</button></div></div>
    ${runs.length ? `<table><tr><th></th>${cols.map(([, l]) => `<th class="n">${l}</th>`).join("")}</tr>${Object.entries(groups).map(([k, g]) => `<tr><td>${esc(k)}</td>${cols.map(([c]) => `<td class="n">${money(g[c] || 0)}</td>`).join("")}</tr>`).join("")}<tr><td><strong>Total</strong></td>${cols.map(([c]) => `<td class="n"><strong>${money(tot[c] || 0)}</strong></td>`).join("")}</tr></table>` : `<p class="empty">No finished payrolls in ${y}.</p>`}</div>
    <div class="panel"><h2>More reports</h2>
      ${rep("journal", "Payroll journal", "Every paycheck line by line: earnings, each tax, take-home and Umoja’s cost. What accountants ask for.", runs.length)}
      ${rep("ytdcsv", "Year to date by team member", "Totals for each person so far this year.", runs.length)}
      ${rep("concsv", "Contractor payments", `Every contractor payment in ${y}.`, hasCon)}
      ${rep("depcsv", "Tax deposits and filings", "What’s due, what’s paid, with confirmation numbers.", true)}</div>`;
};
BIND.reports = () => {
  const y = () => $("#ry2").value; const runsY = () => finalRuns().filter((r) => r.payDate.slice(0, 4) === y());
  $("#ry2").addEventListener("change", (ev) => { S.repYear = ev.target.value; render(); });
  $("#by").addEventListener("change", (ev) => { S.repBy = ev.target.value; render(); });
  $("#sumcsv")?.addEventListener("click", () => {
    const rows = [["Pay date", "Type", "Gross pay", "Taxes withheld", "Reimbursements", "Take-home", "Umoja Social Security", "Umoja Medicare", "Georgia unemployment", "Total cost"]];
    for (const r of runsY()) { const t = totals(r.results || {}); rows.push([r.payDate, kindLabel(r), t.gross, t.employeeTaxes, t.reimb || 0, t.net, t.ssEr, t.medEr, t.suta || 0, bankTotal(t)].map(fix2)); }
    download(`Umoja payroll summary ${y()}.csv`, csv(rows), "text/csv");
  });
  $("#journal")?.addEventListener("click", () => {
    const rows = [["Pay date", "Type", "Period start", "Period end", "Team member", "Hours pay", "Bonus", "Reimbursement", "Gross wages", "Federal income tax", "Social Security (employee)", "Medicare (employee)", "Additional Medicare", "Georgia income tax", "Take-home", "Social Security (Umoja)", "Medicare (Umoja)", "Georgia unemployment", "Total cost"]];
    for (const r of runsY()) for (const [id, x] of Object.entries(r.results || {})) rows.push([r.payDate, kindLabel(r), r.periodStart, r.periodEnd, S.employees[id]?.name || "", x.regular ?? x.gross, x.bonus || 0, x.reimb || 0, x.gross, x.fit, x.ssEe, x.medEe, x.addlMed, x.ga, x.net, x.ssEr, x.medEr, x.suta, x.employerCost].map(fix2));
    download(`Umoja payroll journal ${y()}.csv`, csv(rows), "text/csv");
  });
  $("#ytdcsv")?.addEventListener("click", () => {
    const rows = [["Team member", "Gross pay", "Federal income tax", "Social Security", "Medicare", "Georgia income tax", "Reimbursements", "Take-home"]];
    for (const e of Object.values(S.employees)) { const t = ytdBefore(e.id, `${y()}-12-31`, null); if (!t.gross && !t.reimb) continue; rows.push([e.name, t.gross, t.fit, t.ssEe, r2(t.medEe + t.addlMed), t.ga, t.reimb, t.net].map(fix2)); }
    download(`Umoja year to date ${y()}.csv`, csv(rows), "text/csv");
  });
  $("#concsv")?.addEventListener("click", () => {
    const rows = [["Date", "Contractor", "Business", "For", "Amount"]];
    for (const p of S.cpay.filter((p) => p.paidOn.slice(0, 4) === y())) { const c = S.contractors[p.contractorId] || {}; rows.push([p.paidOn, c.name, c.businessName, p.memo, p.amount.toFixed(2)]); }
    download(`Umoja contractor payments ${y()}.csv`, csv(rows), "text/csv");
  });
  $("#depcsv").addEventListener("click", () => {
    const rows = [["Due", "Where", "What", "Amount", "Done on", "Confirmation"]];
    for (const i of deadlines()) { const d = S.done[i.key]; rows.push([i.due, i.where, i.what, i.amount === undefined ? "" : i.amount.toFixed(2), d?.date || "", d?.confirmation || ""]); }
    download(`Umoja tax deposits and filings.csv`, csv(rows), "text/csv");
  });
};

// ----- Settings (includes tax rates) -----
const RATE_META = [
  ["ssRate", "Social Security, each of coach and Umoja", "pct", "IRS Publication 15 (2026)"],
  ["ssWageBase", "Social Security stops after this much pay", "$", "Social Security Administration, Oct 24, 2025"],
  ["medRate", "Medicare, each of coach and Umoja", "pct", "IRS Publication 15 (2026)"],
  ["addlMedRate", "Additional Medicare, coach only", "pct", "IRS Publication 15 (2026)"],
  ["addlMedThreshold", "Additional Medicare starts after", "$", "IRS Publication 15 (2026)"],
  ["suppFlatRate", "Federal flat rate for bonuses (optional)", "pct", "IRS Publication 15 (2026)"],
  ["line1gMFJ", "Federal adjustment, married filing jointly", "$", "IRS Publication 15-T (2026), Worksheet 1A line 1g"],
  ["line1gOther", "Federal adjustment, everyone else", "$", "IRS Publication 15-T (2026), Worksheet 1A line 1g"],
  ["gaRate", "Georgia income tax", "pct", "Georgia DOR Employer’s Tax Guide 2026, June revision (HB 463)"],
  ["gaStdA", "Georgia standard deduction, status A", "$", "Georgia DOR guide 2026, June revision"],
  ["gaStdB", "Georgia standard deduction, status B", "$", "Georgia DOR guide 2026, June revision"],
  ["gaStdC", "Georgia standard deduction, status C", "$", "Georgia DOR guide 2026, June revision"],
  ["gaStdD", "Georgia standard deduction, status D", "$", "Georgia DOR guide 2026, June revision"],
  ["gaAllowance", "Georgia allowance, per dependent or extra allowance", "$", "Georgia DOR guide 2026, June revision"],
  ["sutaRate", "Georgia unemployment, if paying quarterly tax", "pct", "Unverified: new-employer rate until your DOL rate notice arrives", true],
  ["sutaWageBase", "Georgia unemployment stops after this much pay", "$", "Georgia Department of Labor"],
];
VIEWS.settings = () => {
  const st = settings(); const tab = S.sub || "company";
  const tabs = `<div class="tabs" role="tablist">${[["company", "Company"], ["schedule", "Pay schedule"], ["rates", "Tax rates"], ["account", "Your account"]].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-go="settings/${k}">${l}</button>`).join("")}</div>`;
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(st[v]) === String(k) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  let body = "";
  if (tab === "company") body = `<form class="panel" id="sf"><div class="grid">
      <div><label for="s-employerName">Employer name</label><input id="s-employerName" value="${esc(st.employerName)}"></div>
      <div><label for="s-ein">EIN</label><input id="s-ein" value="${esc(st.ein)}"></div>
      <div><label for="s-gaWithholdingId">Georgia withholding ID</label><input id="s-gaWithholdingId" value="${esc(st.gaWithholdingId)}"></div>
      <div><label for="s-gaDolAccount">GA DOL account number</label><input id="s-gaDolAccount" value="${esc(st.gaDolAccount)}" placeholder="Not received yet"></div>
      <div style="grid-column:1/-1"><label for="s-address">Mailing address (prints on pay stubs)</label><input id="s-address" value="${esc(st.address)}"></div>
      <div><label for="s-bankName">Bank payroll is paid from</label><input id="s-bankName" value="${esc(st.bankName)}" placeholder="Bank name only"></div>
      <div><label for="s-gaFrequency">Georgia withholding filing frequency</label>${sel("s-gaFrequency", [["", "Choose"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"]], "gaFrequency")}</div>
      <div><label for="s-sutaMethod">Georgia unemployment</label>${sel("s-sutaMethod", [["reimbursable", "Reimbursable (nonprofit election)"], ["contributory", "Pay quarterly tax"]], "sutaMethod")}</div>
    </div><div class="row" style="margin-top:18px"><button class="btn" type="submit">Save</button></div></form>`;
  if (tab === "schedule") { const sch = schedule(4).filter((p) => daysUntil(p.payDate) >= 0).slice(0, 4); body = `<form class="panel" id="schf"><div class="grid">
      <div><label for="s-payFrequency">How often you pay</label>${sel("s-payFrequency", [["", "Choose"], ...Object.entries(FREQ_LABEL)], "payFrequency")}</div>
      <div><label for="s-firstPayDate">Any one pay date on this schedule</label><input id="s-firstPayDate" type="date" value="${esc(st.firstPayDate)}"><div class="small muted">Needed for every week and every two weeks.</div></div>
      <div><label for="s-payOffsetDays">Days between end of work and pay date</label><input id="s-payOffsetDays" type="number" min="0" max="14" value="${esc(st.payOffsetDays)}"></div>
    </div><div class="row" style="margin-top:18px"><button class="btn" type="submit">Save pay schedule</button></div></form>
    ${sch.length ? `<div class="panel"><h2>Your next pay dates</h2><table><tr><th>Pay date</th><th>Work period</th></tr>${sch.map((p) => `<tr><td>${weekday(p.payDate)}, ${nice(p.payDate)}</td><td>${nice(p.periodStart)} – ${nice(p.periodEnd)}</td></tr>`).join("")}</table></div>` : ""}
    <form class="panel" id="pf"><h2>Quick-add session types</h2><p class="small muted">The buttons under each person on a payroll. Leave hours blank to type them each time.</p>
      <table><tr><th>Name</th><th>Hours</th><th></th></tr>${st.presets.map((p, i) => `<tr><td><input data-pn="${i}" value="${esc(p.name)}" aria-label="Session type name"></td><td><input class="num-in" type="number" min="0" step="0.25" data-ph="${i}" value="${esc(p.hours)}" aria-label="Hours"></td><td class="n"><button type="button" class="btn quiet" data-prm="${i}">Remove</button></td></tr>`).join("")}</table>
      <div class="row" style="margin-top:10px"><button type="button" class="btn quiet" id="padd">Add a type</button><button class="btn secondary" type="submit">Save session types</button></div></form>`; }
  if (tab === "rates") { const yr = 2026; const R = rates(yr); const T = FED_TABLES[yr]; const nm = { mfj: "Married filing jointly", single: "Single or married filing separately", hoh: "Head of household" };
    body = `<div class="panel"><p class="small muted" style="margin-top:0">Every rate the calculator uses, with its source. Change one only if an agency tells you to. Finished payrolls keep the rates they were figured with.</p><table><tr><th>Rate</th><th class="n">Value</th><th>Source</th><th></th></tr>${RATE_META.map(([k, l, t, src, unv]) => { const ov = S.rateOverrides[yr] && S.rateOverrides[yr][k] !== undefined; return `<tr><td>${l}</td><td class="n"><strong>${t === "pct" ? (R[k] * 100).toFixed(2) + "%" : money(R[k])}</strong>${ov ? ' <span class="pill warn">Changed</span>' : ""}</td><td class="small">${unv ? '<span class="pill warn">Unverified</span> ' : ""}${esc(src)}</td><td class="n"><button class="btn quiet" data-rate="${k}">Change</button></td></tr>`; }).join("")}</table></div>
    <div class="panel"><h2>Federal withholding tables</h2><p class="small muted">IRS Publication 15-T (2026), annual percentage method tables for automated payroll, W-4s from 2020 or later.</p><div class="money">${["standard", "checkbox"].flatMap((sch) => Object.keys(T[sch]).map((s) => `<div><h3 class="small" style="margin-bottom:4px">${nm[s]}, Step 2 ${sch === "standard" ? "not checked" : "checked"}</h3><table class="small"><tr><th class="n">Yearly pay from</th><th class="n">Base tax</th><th class="n">Plus</th></tr>${T[sch][s].map((r) => `<tr><td class="n">${money(r[0])}</td><td class="n">${money(r[1])}</td><td class="n">${(r[2] * 100).toFixed(0)}%</td></tr>`).join("")}</table></div>`)).join("")}</div></div>`; }
  if (tab === "account") body = `<div class="panel"><p style="margin-top:0">Signed in as ${esc(S.user?.email || "")}.</p><div class="row"><button class="btn secondary" id="chpw">Change password</button><button class="btn secondary" id="backup">Download a backup</button></div><p class="small muted">Everything saves as you go. A backup is an extra copy for your own files.</p></div>`;
  return head("Settings") + tabs + body;
};
BIND.settings = () => {
  const saveSettings = (patch) => act(async () => check(await sb.from("settings").upsert({ id: 1, data: Object.assign({}, DEFAULT_SETTINGS, S.settings, patch) })));
  $("#sf")?.addEventListener("submit", (ev) => { ev.preventDefault(); const p = {}; for (const k of ["employerName", "ein", "gaWithholdingId", "gaDolAccount", "address", "bankName", "gaFrequency", "sutaMethod"]) p[k] = $("#s-" + k).value.trim(); saveSettings(p); });
  $("#schf")?.addEventListener("submit", (ev) => { ev.preventDefault(); saveSettings({ payFrequency: $("#s-payFrequency").value, firstPayDate: $("#s-firstPayDate").value, payOffsetDays: num($("#s-payOffsetDays").value) }); });
  if ($("#pf")) {
    let presets = structuredClone(settings().presets);
    const sync = () => $$("[data-pn]").forEach((i) => { const k = +i.dataset.pn; presets[k] = { name: i.value, hours: $(`[data-ph="${k}"]`).value }; });
    $("#padd").addEventListener("click", () => { sync(); presets.push({ name: "", hours: "" }); S.settings = Object.assign({}, S.settings, { presets }); render(); });
    $$("[data-prm]").forEach((b) => b.addEventListener("click", () => { sync(); presets.splice(+b.dataset.prm, 1); S.settings = Object.assign({}, S.settings, { presets }); render(); }));
    $("#pf").addEventListener("submit", (ev) => { ev.preventDefault(); sync(); saveSettings({ presets: presets.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), hours: p.hours === "" ? "" : num(p.hours) })) }); });
  }
  $$("[data-rate]").forEach((b) => b.addEventListener("click", async () => {
    const k = b.dataset.rate; const meta = RATE_META.find((m) => m[0] === k); const y = 2026; const R = rates(y); const pct = meta[2] === "pct";
    const p = dialog(`<form method="dialog" id="rf"><h3>Change rate</h3><p>${esc(meta[1])}</p>
      <label for="rv">New value ${pct ? "(percent)" : "(dollars)"}</label><input id="rv" type="number" step="any" required value="${pct ? r2(R[k] * 10000) / 100 : R[k]}">
      <label for="rr" style="margin-top:10px">Why (saved in the activity log)</label><textarea id="rr" rows="2" required></textarea>
      <div class="row"><button class="btn quiet" value="restore" formnovalidate>Restore the sourced value</button><button class="btn secondary" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">Save</button></div></form>`);
    let val = null, reason = ""; $("#rf", dlg).addEventListener("submit", () => { val = num($("#rv", dlg).value); if (pct) val = val / 100; reason = $("#rr", dlg).value.trim(); });
    const choice = await p; if (choice !== "ok" && choice !== "restore") return;
    const data = Object.assign({}, S.rateOverrides[y] || {}); if (choice === "restore") delete data[k]; else data[k] = val;
    await act(async () => { check(await sb.from("rate_overrides").upsert({ year: y, data })); await addLog("Reason for rate change", `${meta[1]}: ${choice === "restore" ? "restored sourced value" : reason}`); });
  }));
  $("#chpw")?.addEventListener("click", () => showSetPassword(true));
  $("#backup")?.addEventListener("click", async () => {
    download(`Umoja payroll backup ${todayStr()}.json`, JSON.stringify({ exported: new Date().toISOString(), settings: S.settings, rateOverrides: S.rateOverrides, team: S.employees, payrolls: S.runs, done: S.done, contractors: S.contractors, contractorPayments: S.cpay }, null, 2), "application/json");
    try { await addLog("Backup downloaded", ""); } catch (_) {}
  });
};

// ----- Activity -----
VIEWS.log = () => head("Activity", "Every change, recorded by the database itself. Entries can’t be edited or deleted.") +
  `<div class="panel">${S.log.length ? `<table><tr><th>When</th><th>What</th><th>Details</th></tr>${S.log.map((e) => `<tr><td class="small" style="white-space:nowrap">${new Date(e.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td><td>${esc(e.action)}</td><td class="small">${esc(e.detail)}</td></tr>`).join("")}</table>` : `<p class="empty">Nothing yet.</p>`}</div>`;

// ---------------- auth & boot ----------------
function show(id) { for (const s of ["signin", "setpass", "app"]) $("#" + s).classList.toggle("hidden", s !== id); }
function showAsleep() {
  show("signin");
  $("#si-error").innerHTML = `The payroll database is asleep. It rests after a week without use. Open <a href="${SUPABASE_DASHBOARD}" target="_blank" rel="noopener">the umoja-payroll project in Supabase</a>, click Resume project, wait two minutes, then reload this page.`;
}
function showSetPassword(optional) {
  show("setpass"); $("#sp-error").textContent = ""; $("#sp-1").value = ""; $("#sp-2").value = ""; $("#sp-1").focus();
  if (optional && !$("#sp-cancel")) $("#setpass-form").insertAdjacentHTML("beforeend", '<button type="button" class="btn secondary" id="sp-cancel" style="margin-top:10px">Cancel</button>');
  $("#sp-cancel")?.addEventListener("click", () => { show("app"); render(); }, { once: true });
}
async function enterApp(session) {
  S.user = session.user;
  if (S.user.user_metadata?.must_change_password) { showSetPassword(false); return; }
  try { await loadAll(); } catch (e) { if (e instanceof Asleep) return showAsleep(); $("#si-error").textContent = e.message; show("signin"); return; }
  $("#who").textContent = S.user.email;
  const h = (location.hash || "").slice(1).split("-"); if (NAV.some(([k]) => k === h[0])) { S.route = h[0]; S.sub = h.slice(1).join("-"); }
  show("app"); render();
}
$("#signin-form").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("#si-error").textContent = "Signing in…";
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#si-email").value.trim(), password: $("#si-pass").value });
    if (error) { if (/fetch|network/i.test(error.message) || error.status >= 500) showAsleep(); else $("#si-error").textContent = "That email and password don’t match."; return; }
    $("#si-pass").value = ""; $("#si-error").textContent = ""; await enterApp(data.session);
  } catch (e) { showAsleep(); }
});
$("#setpass-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const a = $("#sp-1").value, b = $("#sp-2").value;
  if (a !== b) { $("#sp-error").textContent = "The two passwords don’t match."; return; }
  if (a.length < 12) { $("#sp-error").textContent = "Use at least 12 characters."; return; }
  const { data, error } = await sb.auth.updateUser({ password: a, data: { must_change_password: false } });
  if (error) { $("#sp-error").textContent = error.message; return; }
  try { await addLog("Password changed", ""); } catch (_) {}
  const { data: s } = await sb.auth.getSession(); await enterApp(s.session || { user: data.user });
});
$("#signout").addEventListener("click", async () => { await sb.auth.signOut(); S.run = null; show("signin"); $("#si-pass").focus(); });
(async () => { const { data } = await sb.auth.getSession(); if (data.session) await enterApp(data.session); else show("signin"); })();
window.addEventListener("beforeunload", (e) => { if (S.run && S.run.status === "draft" && S.runStep < 3) { e.preventDefault(); e.returnValue = ""; } });
