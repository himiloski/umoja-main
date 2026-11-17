// Umoja Payroll — website front end.
// Data lives in Supabase; row-level security only lets the owner's account read or write anything.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://lcvalnmvaqjpaasznzix.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmFsbm12YXFqcGFhc3pueml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MzI3MDQsImV4cCI6MjExMDUwODcwNH0.xWPJrpb22A1kn45BvmUAWZohmkXpeaNijyGYc4hilSk";
const SUPABASE_DASHBOARD = "https://supabase.com/dashboard/project/lcvalnmvaqjpaasznzix";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

// Engine globals come from engine.js (loaded first as a classic script).
const { RATE_DEFAULTS, FED_TABLES, PERIODS, calcPaycheck, ratesFor, r2, lineAmount } = window;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

// ---------------- state ----------------
const TABS = [
  ["run", "Pay run"], ["coaches", "Coaches"], ["history", "Pay stubs"], ["deposits", "Deposits"],
  ["calendar", "Deadlines"], ["reports", "Year-end & forms"], ["rates", "Tax rates"], ["settings", "Settings"], ["log", "Activity log"],
];
const DEFAULT_SETTINGS = {
  employerName: "Umoja Soccer Club, Inc.", ein: "42-4176322", gaWithholdingId: "3733868-SD", gaDolAccount: "", address: "",
  payFrequency: "", gaFrequency: "", sutaMethod: "contributory",
  presets: [{ name: "Practice", hours: "" }, { name: "League game", hours: "" }, { name: "Tournament day", hours: 4 }],
};
const S = { tab: "run", settings: {}, rateOverrides: {}, employees: {}, runs: {}, done: {}, log: [], editRun: null, repYear: null, user: null };
const settings = () => Object.assign({}, DEFAULT_SETTINGS, S.settings);
const rates = (y) => ratesFor(y, S.rateOverrides);

// ---------------- helpers ----------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (num(n) < 0 ? "−" : "") + "$" + Math.abs(num(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const pd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fd = (d) => d.toISOString().slice(0, 10);
const nice = (s) => (s ? pd(s).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FREQ_LABEL = { weekly: "Weekly", biweekly: "Every two weeks", semimonthly: "Twice a month", monthly: "Monthly" };
const W4_LABEL = { single: "Single or married filing separately", mfj: "Married filing jointly", hoh: "Head of household" };
const G4_LABEL = { A: "A: Single", B: "B: Married separate, or joint with both working", C: "C: Married joint, one spouse working", D: "D: Head of household" };

// Federal legal holidays (incl. DC Emancipation Day) with weekend observance — due dates roll to the next business day.
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
const due15 = (y, m) => fd(nextBiz(new Date(Date.UTC(y, m + 1, 15))));
const dueEndNext = (y, m) => fd(nextBiz(new Date(Date.UTC(y, m + 2, 0))));

function download(filename, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------- dialogs ----------------
const dlg = $("#dlg");
function dialog(html) {
  return new Promise((resolve) => {
    dlg.innerHTML = html; dlg.returnValue = ""; dlg.showModal();
    const first = $("input,textarea,select", dlg); if (first) first.focus();
    dlg.onclose = () => resolve(dlg.returnValue);
  });
}
async function notice(title, body) {
  await dialog(`<form method="dialog"><h3>${esc(title)}</h3><p>${body}</p><div class="row"><button class="btn" value="ok">OK</button></div></form>`);
}
async function confirmBox(title, body, okLabel, withReason) {
  const html = `<form method="dialog" id="cf"><h3>${esc(title)}</h3><p>${body}</p>
    ${withReason ? '<label for="cf-reason">Reason (saved in the activity log)</label><textarea id="cf-reason" rows="2" required></textarea>' : ""}
    <div class="row"><button class="btn secondary" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">${esc(okLabel)}</button></div></form>`;
  const p = dialog(html);
  const reason = () => ($("#cf-reason", dlg)?.value || "").trim();
  let captured = "";
  $("#cf", dlg).addEventListener("submit", () => { captured = reason(); });
  const v = await p;
  if (v !== "ok") return null;
  return withReason ? captured || null : true;
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
const empFromRow = (r) => ({ id: r.id, name: r.name, email: r.email || "", address: r.address || "", rate: r.rate == null ? "" : Number(r.rate), hireDate: r.hire_date || "", active: r.active, w4: r.w4 || {}, g4: r.g4 || {} });
const empToRow = (e) => ({ name: e.name, email: e.email || null, address: e.address || null, rate: e.rate === "" ? null : num(e.rate), hire_date: e.hireDate || null, active: e.active !== false, w4: e.w4, g4: e.g4 });
const runFromRow = (r) => ({ id: r.id, status: r.status, freq: r.freq, periodStart: r.period_start || "", periodEnd: r.period_end || "", payDate: r.pay_date, lines: r.lines || {}, results: r.results, ratesUsed: r.rates_used, finalizedAt: r.finalized_at, voidReason: r.void_reason });
const runToRow = (x) => ({ id: x.id, status: x.status, freq: x.freq, period_start: x.periodStart || null, period_end: x.periodEnd || null, pay_date: x.payDate, lines: x.lines, results: x.results || null, rates_used: x.ratesUsed || null, void_reason: x.voidReason || null });

async function loadAll() {
  const [st, ro, em, ru, dn, lg] = await Promise.all([
    sb.from("settings").select("data").eq("id", 1).maybeSingle(),
    sb.from("rate_overrides").select("year,data"),
    sb.from("employees").select("*").order("name"),
    sb.from("pay_runs").select("*").order("pay_date"),
    sb.from("filings_done").select("*"),
    sb.from("activity_log").select("*").order("at", { ascending: false }).limit(500),
  ]);
  S.settings = check(st)?.data || {};
  S.rateOverrides = Object.fromEntries((check(ro) || []).map((r) => [r.year, r.data]));
  S.employees = Object.fromEntries((check(em) || []).map((r) => [r.id, empFromRow(r)]));
  S.runs = Object.fromEntries((check(ru) || []).map((r) => [r.id, runFromRow(r)]));
  S.done = Object.fromEntries((check(dn) || []).map((r) => [r.key, { key: r.key, date: r.done_date, confirmation: r.confirmation || "", amount: r.amount == null ? null : Number(r.amount) }]));
  S.log = check(lg) || [];
}
async function addLog(action, detail) { check(await sb.from("activity_log").insert({ action, detail })); }

// Run a change, reload, re-render. Shows a clear message on failure; nothing is lost silently.
async function act(fn) {
  try { await fn(); await loadAll(); render(); return true; }
  catch (e) {
    if (e instanceof Asleep) { showAsleep(); return false; }
    await notice("That wasn’t saved", esc(e.message) + "<br><br>Nothing was changed.");
    try { await loadAll(); render(); } catch (_) {}
    return false;
  }
}

// ---------------- payroll glue ----------------
const finalRuns = () => Object.values(S.runs).filter((r) => r.status === "final")
  .sort((a, b) => (a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : (a.finalizedAt || "") < (b.finalizedAt || "") ? -1 : 1));
function ytdBefore(empId, payDate, runId) {
  const y = payDate.slice(0, 4);
  const t = { gross: 0, ssWages: 0, sutaWages: 0, fit: 0, ssEe: 0, medEe: 0, addlMed: 0, ga: 0, net: 0, medWages: 0 };
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
    const emp = S.employees[empId]; const items = run.lines[empId].items || [];
    if (!emp || !items.length) continue;
    out[empId] = calcPaycheck({ emp, items, ytd: ytdBefore(empId, run.payDate, run.id), freq: run.freq, year: y, rates: R, sutaMethod: settings().sutaMethod });
  }
  return out;
}
const runResults = (run) => (run.status === "draft" ? computeRun(run) || {} : run.results || {});
const totals = (res) => Object.values(res).reduce((t, x) => { for (const k of ["gross", "net", "federalDeposit", "ga", "suta", "employerCost"]) t[k] = r2((t[k] || 0) + x[k]); return t; }, {});

// ---------------- render ----------------
function render() {
  $("#nav").innerHTML = TABS.map(([k, l]) => `<button type="button" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ""}>${l}</button>`).join("");
  $$("#nav button").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; try { history.replaceState(null, "", "#" + S.tab); } catch (_) {} render(); $("#view").focus(); }));
  $("#view").innerHTML = (VIEWS[S.tab] || VIEWS.run)();
  (BIND[S.tab] || (() => {}))();
}
const VIEWS = {}, BIND = {};
const head = (title, lede, actions = "") => `<div class="page-head"><div><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>${actions}</div>`;
function setupNotes() {
  const st = settings(); let h = "";
  if (!st.payFrequency) h += `<div class="note warn">Choose how often coaches are paid in Settings before running payroll.</div>`;
  if (!st.gaFrequency) h += `<div class="note warn">Set your Georgia withholding filing frequency in Settings. It’s shown in your Georgia Tax Center account.</div>`;
  return h;
}

// ----- Pay run -----
VIEWS.run = () => {
  const st = settings();
  if (!S.editRun) {
    const drafts = Object.values(S.runs).filter((r) => r.status === "draft").sort((a, b) => (a.payDate < b.payDate ? -1 : 1));
    const last = finalRuns().slice(-1)[0];
    const canStart = st.payFrequency && Object.values(S.employees).some((e) => e.active !== false);
    return head("Pay run", "Enter each coach’s sessions, check the numbers, then finish the run to lock it and make pay stubs.",
      `<button class="btn" id="newrun" ${canStart ? "" : "disabled"}>Start a pay run</button>`) + setupNotes() +
      (!Object.keys(S.employees).length ? `<div class="note warn">Add your coaches first.</div>` : "") +
      `<div class="panel"><h2>In progress</h2>${drafts.length ? `<table><tr><th>Pay date</th><th>Period</th><th class="n">Total needed</th><th></th></tr>${drafts.map((r) => { const t = totals(runResults(r)); return `<tr><td>${nice(r.payDate)}</td><td>${nice(r.periodStart)} – ${nice(r.periodEnd)}</td><td class="n">${money(r2((t.net || 0) + (t.federalDeposit || 0) + (t.ga || 0) + (t.suta || 0)))}</td><td class="n"><button class="btn quiet" data-open="${r.id}">Open</button></td></tr>`; }).join("")}</table>` : `<p class="empty">No pay run in progress.</p>`}</div>` +
      (last ? `<div class="panel tint"><h2>Last finished</h2><p>Paid ${nice(last.payDate)} to ${Object.keys(last.results || {}).length} coaches. The stubs are under Pay stubs.</p></div>` : "");
  }
  const run = S.editRun; const y = +run.payDate.slice(0, 4); const R = rates(y);
  const res = R ? computeRun(run) : {};
  const t = totals(res || {});
  const bank = r2((t.net || 0) + (t.federalDeposit || 0) + (t.ga || 0) + (t.suta || 0));
  const emps = Object.values(S.employees).filter((e) => e.active !== false || run.lines[e.id]).sort((a, b) => a.name.localeCompare(b.name));
  let h = head("Pay run", `${FREQ_LABEL[run.freq]} · not finished yet`) +
    `<div class="scoreboard" aria-label="Pay run totals">
      <div class="cell"><div class="label">Total Umoja needs in the bank</div><div class="num">${money(bank)}</div></div>
      <div class="cell"><div class="label">To coaches</div><div class="num">${money(t.net || 0)}</div></div>
      <div class="cell"><div class="label">To the IRS</div><div class="num">${money(t.federalDeposit || 0)}</div></div>
      <div class="cell"><div class="label">To Georgia</div><div class="num">${money(r2((t.ga || 0) + (t.suta || 0)))}</div></div>
      <div class="foot">The big number covers everything; nothing gets added to it. ${money(r2(bank - (t.gross || 0)))} of it is Umoja’s own tax. The rest is the coaches’ pay.</div>
    </div>
    <div class="panel"><div class="grid">
      <div><label for="r-ps">Period start</label><input type="date" id="r-ps" value="${esc(run.periodStart)}"></div>
      <div><label for="r-pe">Period end</label><input type="date" id="r-pe" value="${esc(run.periodEnd)}"></div>
      <div><label for="r-pd">Pay date</label><input type="date" id="r-pd" value="${esc(run.payDate)}"></div>
    </div>${!R ? `<div class="note bad" style="margin:14px 0 0">The ${y} tax tables aren’t loaded yet. The IRS publishes them in December; ask Claude to add them before paying anyone in ${y}.</div>` : ""}</div>`;
  for (const e of emps) {
    const items = (run.lines[e.id] || {}).items || []; const x = res && res[e.id];
    const forms = [!(e.w4 && e.w4.onFile) ? '<span class="pill warn">No W-4</span>' : "", !(e.g4 && e.g4.onFile) ? '<span class="pill warn">No G-4</span>' : ""].join(" ");
    h += `<div class="coach"><div class="coach-head"><h3>${esc(e.name)}</h3><div class="row small muted">${e.rate !== "" ? money(e.rate) + " an hour" : "No rate set"} ${forms}</div></div><div class="coach-body">
      ${items.length ? `<table><tr><th>What</th><th class="n">Sessions</th><th class="n">Hours each</th><th class="n">Rate</th><th class="n">Amount</th><th></th></tr>
      ${items.map((it, i) => `<tr><td><input class="wide" aria-label="What" data-e="${e.id}" data-i="${i}" data-k="desc" value="${esc(it.desc)}"></td>
        <td class="n"><input class="num-in" type="number" min="0" step="1" aria-label="Sessions" data-e="${e.id}" data-i="${i}" data-k="count" value="${esc(it.count)}"></td>
        <td class="n"><input class="num-in" type="number" min="0" step="0.25" aria-label="Hours each" data-e="${e.id}" data-i="${i}" data-k="hours" value="${esc(it.hours)}"></td>
        <td class="n"><input class="num-in" type="number" min="0" step="0.01" aria-label="Rate" data-e="${e.id}" data-i="${i}" data-k="rate" value="${esc(it.rate)}"></td>
        <td class="n">${money(lineAmount(it))}</td><td class="n"><button class="btn quiet" data-rm="${e.id}:${i}">Remove</button></td></tr>`).join("")}</table>` : `<p class="empty small">Not on this pay run.</p>`}
      <div class="row small" style="margin-top:8px"><span class="muted">Add</span>${st.presets.map((p, pi) => `<button class="btn quiet" data-add="${e.id}:${pi}">${esc(p.name)}</button>`).join("")}<button class="btn quiet" data-add="${e.id}:-1">Something else</button></div>
      ${x ? `<div class="money">
        <div class="sum"><span>Gross pay</span><span>${money(x.gross)}</span><span>Federal income tax</span><span>−${money(x.fit)}</span><span>Social Security</span><span>−${money(x.ssEe)}</span><span>Medicare</span><span>−${money(x.medEe)}</span>${x.addlMed ? `<span>Additional Medicare</span><span>−${money(x.addlMed)}</span>` : ""}<span>Georgia income tax</span><span>−${money(x.ga)}</span><span class="total">Net pay</span><span class="total">${money(x.net)}</span></div>
        <div class="sum muted"><span>Umoja’s Social Security</span><span>${money(x.ssEr)}</span><span>Umoja’s Medicare</span><span>${money(x.medEr)}</span><span>Georgia unemployment</span><span>${money(x.suta)}</span><span class="total">Cost to Umoja</span><span class="total">${money(x.employerCost)}</span></div>
      </div>${x.warn ? `<div class="note bad" style="margin-top:10px">${esc(x.warn)}</div>` : ""}
      <details><summary>How these were figured</summary><ul class="small">${x.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></details>` : ""}
    </div></div>`;
  }
  h += `<div class="row" style="margin-top:8px"><button class="btn" id="finalize" ${R && Object.keys(res || {}).length ? "" : "disabled"}>Finish pay run</button><button class="btn secondary" id="savedraft">Save and close</button><button class="btn danger" id="deldraft">Delete draft</button></div>
    <p class="small muted">Finishing locks the numbers and makes the pay stubs. A finished run can be voided with a reason but never edited or deleted.</p>`;
  return h;
};
BIND.run = () => {
  const st = settings();
  $("#newrun")?.addEventListener("click", () => {
    const last = finalRuns().slice(-1)[0]; let ps = "";
    if (last && last.periodEnd) { const d = pd(last.periodEnd); d.setUTCDate(d.getUTCDate() + 1); ps = fd(d); }
    S.editRun = { id: newId(), status: "draft", freq: st.payFrequency, periodStart: ps, periodEnd: "", payDate: todayStr(), lines: {} };
    render();
  });
  $$("[data-open]").forEach((b) => b.addEventListener("click", () => { S.editRun = structuredClone(S.runs[b.dataset.open]); render(); }));
  if (!S.editRun) return;
  const run = S.editRun;
  [["#r-ps", "periodStart"], ["#r-pe", "periodEnd"], ["#r-pd", "payDate"]].forEach(([sel, k]) => $(sel).addEventListener("change", (ev) => { run[k] = ev.target.value || (k === "payDate" ? todayStr() : ""); render(); }));
  $$("input[data-e]").forEach((inp) => inp.addEventListener("change", (ev) => { const { e, i, k } = ev.target.dataset; run.lines[e].items[+i][k] = ev.target.value; render(); }));
  $$("[data-add]").forEach((b) => b.addEventListener("click", () => {
    const [e, pi] = b.dataset.add.split(":"); const p = +pi >= 0 ? st.presets[+pi] : { name: "", hours: "" };
    run.lines[e] = run.lines[e] || { items: [] };
    run.lines[e].items.push({ desc: p.name, count: 1, hours: p.hours, rate: S.employees[e].rate });
    render();
  }));
  $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { const [e, i] = b.dataset.rm.split(":"); run.lines[e].items.splice(+i, 1); if (!run.lines[e].items.length) delete run.lines[e]; render(); }));
  $("#savedraft").addEventListener("click", async () => { if (await act(async () => check(await sb.from("pay_runs").upsert(runToRow(run))))) { S.editRun = null; render(); } });
  $("#deldraft").addEventListener("click", async () => {
    if (!(await confirmBox("Delete this draft?", "Nothing has been paid from it. The deletion is recorded in the activity log.", "Delete draft"))) return;
    const saved = !!S.runs[run.id]; S.editRun = null;
    if (saved) await act(async () => check(await sb.from("pay_runs").delete().eq("id", run.id))); else render();
  });
  $("#finalize").addEventListener("click", async () => {
    if (!run.periodStart || !run.periodEnd || !run.payDate) { await notice("Dates needed", "Enter the period start, period end and pay date."); return; }
    const res = computeRun(run); const n = Object.keys(res).length; const t = totals(res);
    const missing = Object.keys(res).filter((id) => !(S.employees[id].w4?.onFile && S.employees[id].g4?.onFile)).map((id) => esc(S.employees[id].name));
    const ok = await confirmBox("Finish this pay run?", `${n} coach${n > 1 ? "es" : ""}, paid ${nice(run.payDate)}. Umoja needs ${money(r2(t.net + t.federalDeposit + t.ga + t.suta))} in the bank.${missing.length ? `<br><br>No W-4 or G-4 on file for ${missing.join(", ")}, so they’re withheld at the default rates.` : ""}`, "Finish pay run");
    if (!ok) return;
    const final = Object.assign({}, run, { status: "final", results: res, ratesUsed: rates(+run.payDate.slice(0, 4)) });
    if (await act(async () => check(await sb.from("pay_runs").upsert(runToRow(final))))) { S.editRun = null; S.tab = "history"; render(); }
  });
};

// ----- Coaches -----
VIEWS.coaches = () => {
  const list = Object.values(S.employees).sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name));
  const onRun = (id) => Object.values(S.runs).some((r) => r.lines[id]);
  return head("Coaches", "Social Security numbers are never stored here. Add them on the W-2s at filing time.", `<button class="btn" id="addemp">Add a coach</button>`) +
    `<div class="panel">${list.length ? `<table><tr><th>Name</th><th>Rate</th><th>W-4</th><th>G-4</th><th>Hired</th><th></th></tr>${list.map((e) => `<tr>
      <td><strong>${esc(e.name)}</strong>${e.active === false ? ' <span class="pill plain">Inactive</span>' : ""}<div class="small muted">${esc(e.email)}</div></td>
      <td>${e.rate !== "" ? money(e.rate) : "—"}</td>
      <td>${e.w4?.onFile ? (e.w4.exempt ? "Exempt" : esc(W4_LABEL[e.w4.status] || "Single") + (e.w4.step2 ? ", Step 2 checked" : "")) : '<span class="pill warn">Not on file</span>'}</td>
      <td>${e.g4?.onFile ? (e.g4.exempt ? "Exempt" : "Status " + esc(e.g4.status || "A") + `, ${num(e.g4.deps) + num(e.g4.addl)} allowances`) : '<span class="pill warn">Not on file</span>'}</td>
      <td>${nice(e.hireDate)}</td>
      <td class="n" style="white-space:nowrap"><button class="btn quiet" data-edit="${e.id}">Edit</button>${onRun(e.id) ? "" : `<button class="btn quiet" data-del="${e.id}">Delete</button>`}</td></tr>`).join("")}</table>` : `<p class="empty">No coaches yet.</p>`}</div><div id="empform"></div>`;
};
function empForm(e) {
  const isNew = !e;
  e = e || { name: "", email: "", address: "", rate: "", hireDate: "", active: true, w4: { onFile: false, status: "single" }, g4: { onFile: false, status: "A" } };
  const w = e.w4 || {}, g = e.g4 || {};
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const yn = (id, v, no = "No", yes = "Yes") => sel(id, [["0", no], ["1", yes]], v ? "1" : "0");
  return `<form class="panel" id="ef"><h2>${isNew ? "New coach" : "Edit " + esc(e.name)}</h2>
    <div class="grid">
      <div><label for="f-name">Full legal name</label><input id="f-name" required value="${esc(e.name)}"></div>
      <div><label for="f-email">Email (for pay stubs)</label><input id="f-email" type="email" value="${esc(e.email)}"></div>
      <div><label for="f-rate">Hourly rate</label><input id="f-rate" type="number" min="0" step="0.01" value="${esc(e.rate)}"></div>
      <div><label for="f-hire">Hire date at the Inc.</label><input id="f-hire" type="date" value="${esc(e.hireDate)}"></div>
      <div style="grid-column:1/-1"><label for="f-addr">Mailing address (prints on the W-2)</label><input id="f-addr" value="${esc(e.address)}"></div>
      <div><label for="f-active">Status</label>${sel("f-active", [["1", "Active"], ["0", "Inactive"]], e.active !== false ? "1" : "0")}</div>
    </div>
    <h3 style="margin:22px 0 10px">Federal W-4</h3>
    <div class="grid">
      <div><label for="w-on">W-4 on file?</label>${yn("w-on", w.onFile, "No (withhold as Single)")}</div>
      <div><label for="w-st">Step 1(c) filing status</label>${sel("w-st", Object.entries(W4_LABEL), w.status || "single")}</div>
      <div><label for="w-s2">Step 2(c) box checked?</label>${yn("w-s2", w.step2)}</div>
      <div><label for="w-s3">Step 3 credits (per year)</label><input id="w-s3" type="number" min="0" value="${esc(w.step3 || "")}"></div>
      <div><label for="w-s4a">Step 4(a) other income (per year)</label><input id="w-s4a" type="number" min="0" value="${esc(w.step4a || "")}"></div>
      <div><label for="w-s4b">Step 4(b) deductions (per year)</label><input id="w-s4b" type="number" min="0" value="${esc(w.step4b || "")}"></div>
      <div><label for="w-s4c">Step 4(c) extra per paycheck</label><input id="w-s4c" type="number" min="0" value="${esc(w.step4c || "")}"></div>
      <div><label for="w-ex">Wrote “Exempt”?</label>${yn("w-ex", w.exempt)}</div>
    </div>
    <h3 style="margin:22px 0 10px">Georgia G-4</h3>
    <div class="grid">
      <div><label for="g-on">G-4 on file?</label>${yn("g-on", g.onFile, "No (Single, zero allowances)")}</div>
      <div><label for="g-st">Line 3 marital status</label>${sel("g-st", Object.entries(G4_LABEL), g.status || "A")}</div>
      <div><label for="g-dep">Line 4 dependent allowances</label><input id="g-dep" type="number" min="0" value="${esc(g.deps || "")}"></div>
      <div><label for="g-add">Line 5 additional allowances</label><input id="g-add" type="number" min="0" value="${esc(g.addl || "")}"></div>
      <div><label for="g-ext">Line 6 extra per paycheck</label><input id="g-ext" type="number" min="0" value="${esc(g.extra || "")}"></div>
      <div><label for="g-ex">Line 8 exempt?</label>${yn("g-ex", g.exempt)}</div>
    </div>
    <div class="row" style="margin-top:20px"><button class="btn" type="submit">Save coach</button><button class="btn secondary" type="button" id="ef-cancel">Cancel</button></div></form>`;
}
BIND.coaches = () => {
  const open = (id) => {
    const e = id ? structuredClone(S.employees[id]) : null;
    $("#empform").innerHTML = empForm(e); $("#empform").scrollIntoView({ behavior: "smooth" }); $("#f-name").focus();
    $("#ef-cancel").addEventListener("click", () => ($("#empform").innerHTML = ""));
    $("#ef").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = (s) => $(s).value; const b = (s) => $(s).value === "1";
      const row = empToRow({
        name: v("#f-name").trim(), email: v("#f-email").trim(), address: v("#f-addr").trim(), rate: v("#f-rate"), hireDate: v("#f-hire"), active: b("#f-active"),
        w4: { onFile: b("#w-on"), status: v("#w-st"), step2: b("#w-s2"), step3: num(v("#w-s3")), step4a: num(v("#w-s4a")), step4b: num(v("#w-s4b")), step4c: num(v("#w-s4c")), exempt: b("#w-ex") },
        g4: { onFile: b("#g-on"), status: v("#g-st"), deps: num(v("#g-dep")), addl: num(v("#g-add")), extra: num(v("#g-ext")), exempt: b("#g-ex") },
      });
      await act(async () => check(id ? await sb.from("employees").update(row).eq("id", id) : await sb.from("employees").insert(row)));
    });
  };
  $("#addemp").addEventListener("click", () => open(null));
  $$("[data-edit]").forEach((b) => b.addEventListener("click", () => open(b.dataset.edit)));
  $$("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const e = S.employees[b.dataset.del];
    if (!(await confirmBox(`Delete ${e.name}?`, "They’ve never been on a pay run, so nothing else changes. The deletion is recorded in the activity log.", "Delete"))) return;
    await act(async () => check(await sb.from("employees").delete().eq("id", e.id)));
  }));
};

// ----- Pay stubs / history -----
VIEWS.history = () => {
  const runs = Object.values(S.runs).filter((r) => r.status !== "draft").sort((a, b) => (a.payDate < b.payDate ? 1 : -1));
  return head("Pay stubs", "Every finished pay run. Download each coach’s stub as a PDF to send them.") +
    (runs.length ? runs.map((r) => `<div class="panel"><div class="spread"><h2>Paid ${nice(r.payDate)}</h2>${r.status === "final" ? '<span class="pill ok">Finished</span>' : '<span class="pill bad">Voided</span>'}</div>
      <p class="small muted" style="margin:-4px 0 10px">Work from ${nice(r.periodStart)} to ${nice(r.periodEnd)}${r.status === "void" ? `. Voided: ${esc(r.voidReason)}` : ""}</p>
      <table><tr><th>Coach</th><th class="n">Gross</th><th class="n">Taxes withheld</th><th class="n">Net pay</th><th></th></tr>
      ${Object.entries(r.results || {}).map(([id, x]) => `<tr><td>${esc(S.employees[id]?.name || "(deleted coach)")}</td><td class="n">${money(x.gross)}</td><td class="n">${money(x.employeeTaxes)}</td><td class="n">${money(x.net)}</td>
        <td class="n">${r.status === "final" ? `<button class="btn quiet" data-stub="${r.id}:${id}">Download stub</button>` : ""}</td></tr>`).join("")}</table>
      ${r.status === "final" ? `<div class="row" style="margin-top:10px"><button class="btn quiet" data-void="${r.id}">Void this pay run</button></div>` : ""}</div>`).join("")
      : `<div class="panel"><p class="empty">No finished pay runs yet.</p></div>`);
};
BIND.history = () => {
  $$("[data-stub]").forEach((b) => b.addEventListener("click", () => { const [r, e] = b.dataset.stub.split(":"); stubPdf(S.runs[r], e); }));
  $$("[data-void]").forEach((b) => b.addEventListener("click", async () => {
    const r = S.runs[b.dataset.void];
    const reason = await confirmBox("Void this pay run?", "Its amounts come out of year-to-date totals, deposits and forms. It stays in the list, marked voided.", "Void pay run", true);
    if (!reason) return;
    await act(async () => check(await sb.from("pay_runs").update({ status: "void", void_reason: reason }).eq("id", r.id)));
  }));
};
async function stubPdf(run, empId) {
  if (!window.jspdf) { await notice("Still loading", "The PDF tool is still loading. Try again in a moment."); return; }
  const st = settings(); const e = S.employees[empId] || { name: "Coach", address: "" };
  const x = run.results[empId]; const prev = ytdBefore(empId, run.payDate, run.id);
  const ytd = {}; for (const k of ["gross", "fit", "ssEe", "medEe", "addlMed", "ga", "net"]) ytd[k] = r2(num(prev[k]) + num(x[k]));
  const items = (run.lines[empId] || {}).items || [];
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" }); const L = 54, R = 558; let y = 60;
  const t = (s, xx, yy, o) => doc.text(String(s), xx, yy, o || {});
  const rule = () => { doc.setDrawColor(210); doc.line(L, y, R, y); };
  doc.setFillColor(14, 77, 58); doc.rect(0, 0, 612, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); t(st.employerName, L, y); doc.setFontSize(10); t("Earnings statement", R, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); y += 14; if (st.address) { t(st.address, L, y); y += 12; } t("EIN " + st.ein, L, y);
  y += 30; doc.setFontSize(10); doc.setFont("helvetica", "bold"); t(e.name, L, y); doc.setFont("helvetica", "normal");
  t("Pay date: " + nice(run.payDate), R, y, { align: "right" }); y += 13; if (e.address) t(e.address, L, y);
  t("Pay period: " + nice(run.periodStart) + " to " + nice(run.periodEnd), R, y, { align: "right" });
  y += 30; doc.setFont("helvetica", "bold"); t("Earnings", L, y); t("Sessions", 310, y, { align: "right" }); t("Hours each", 380, y, { align: "right" }); t("Rate", 450, y, { align: "right" }); t("Amount", R, y, { align: "right" });
  doc.setFont("helvetica", "normal"); y += 6; rule(); y += 15;
  for (const it of items) { t(it.desc || "Hours", L, y); t(num(it.count), 310, y, { align: "right" }); t(num(it.hours), 380, y, { align: "right" }); t(money(it.rate), 450, y, { align: "right" }); t(money(lineAmount(it)), R, y, { align: "right" }); y += 15; }
  rule(); y += 16; doc.setFont("helvetica", "bold"); t("Gross pay", L, y); t(money(x.gross), R, y, { align: "right" }); y += 32;
  t("Taxes withheld", L, y); t("This period", 450, y, { align: "right" }); t("Year to date", R, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 6; rule(); y += 15;
  const rows = [["Federal income tax", "fit"], ["Social Security", "ssEe"], ["Medicare", "medEe"]]; if (ytd.addlMed) rows.push(["Additional Medicare", "addlMed"]); rows.push(["Georgia income tax", "ga"]);
  for (const [l, k] of rows) { t(l, L, y); t(money(x[k]), 450, y, { align: "right" }); t(money(ytd[k]), R, y, { align: "right" }); y += 15; }
  rule(); y += 16; t("Gross pay", L, y); t(money(x.gross), 450, y, { align: "right" }); t(money(ytd.gross), R, y, { align: "right" }); y += 22;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); t("Net pay", L, y); t(money(x.net), 450, y, { align: "right" }); t(money(ytd.net), R, y, { align: "right" });
  doc.save(`Umoja pay stub - ${e.name} - ${run.payDate}.pdf`);
  try { await addLog("Pay stub downloaded", `${e.name}, pay date ${run.payDate}`); } catch (_) {}
}

// ----- Deposits & deadlines -----
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
function deadlines() {
  const st = settings(); const m = liabilities(); const items = []; const reimb = st.sutaMethod === "reimbursable";
  const end = new Date(Date.UTC(2028, 2, 1));
  for (let d = new Date(Date.UTC(2026, 10, 1)); d < end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), L = m[mkey(y, mo)] || {};
    items.push({ key: `fed-${mkey(y, mo)}`, due: due15(y, mo), where: "IRS, EFTPS", what: `Federal deposit for ${MONTHS[mo]} ${y} paychecks`, amount: L.fed || 0, pay: true });
    if (st.gaFrequency === "monthly") items.push({ key: `ga-${mkey(y, mo)}`, due: due15(y, mo), where: "Georgia Tax Center", what: `Georgia withholding for ${MONTHS[mo]} ${y}`, amount: L.ga || 0, pay: true });
    if (mo % 3 === 2) {
      const q = (mo / 3 | 0) + 1, qm = [mo - 2, mo - 1, mo], qk = `${y}-Q${q}`, dq = dueEndNext(y, mo);
      items.push({ key: `941-${qk}`, due: dq, where: "IRS", what: `Form 941 for Q${q} ${y}`, amount: sumMonths(m, y, qm, "fed") });
      if (st.gaFrequency === "quarterly") items.push({ key: `ga-${qk}`, due: dq, where: "Georgia Tax Center", what: `Georgia withholding for Q${q} ${y}`, amount: sumMonths(m, y, qm, "ga"), pay: true });
      if (st.gaFrequency !== "annual") items.push({ key: `g7-${qk}`, due: dq, where: "Georgia Tax Center", what: `Form G-7 for Q${q} ${y}`, amount: sumMonths(m, y, qm, "ga") });
      items.push({ key: `dol-${qk}`, due: dq, where: "GA DOL Employer Portal", what: `Form DOL-4N for Q${q} ${y}${reimb ? " (wage report, no tax)" : " and unemployment tax"}`, amount: reimb ? undefined : sumMonths(m, y, qm, "suta"), pay: !reimb });
    }
    if (mo === 11) {
      const dj = fd(nextBiz(new Date(Date.UTC(y + 1, 0, 31))));
      items.push({ key: `w2emp-${y}`, due: dj, where: "Coaches", what: `Give each coach their ${y} W-2` });
      items.push({ key: `w3-${y}`, due: dj, where: "Social Security Administration", what: `File ${y} W-2s and W-3` });
      items.push({ key: `g1003-${y}`, due: dj, where: "Georgia Tax Center", what: `File ${y} G-1003 with W-2s${st.gaFrequency === "annual" ? " and the annual G-7 with payment" : ""}`, amount: st.gaFrequency === "annual" ? sumMonths(m, y, [...Array(12).keys()], "ga") : undefined, pay: st.gaFrequency === "annual" });
    }
  }
  for (const e of Object.values(S.employees)) if (e.hireDate) { const d = pd(e.hireDate); d.setUTCDate(d.getUTCDate() + 10); items.push({ key: `newhire-${e.id}`, due: fd(d), where: "Georgia New Hire Reporting", what: `Report ${e.name} as a new hire` }); }
  return items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}
function status(it) {
  const d = S.done[it.key]; if (d) return `<span class="pill ok">Done ${nice(d.date)}</span>`;
  const days = (pd(it.due) - pd(todayStr())) / 864e5;
  if (days < 0) return '<span class="pill bad">Past due</span>';
  if (days <= 10) return '<span class="pill warn">Due soon</span>';
  return "";
}
function bindDone() {
  $$("[data-done]").forEach((b) => b.addEventListener("click", async () => {
    const key = b.dataset.done; const it = deadlines().find((i) => i.key === key);
    if (S.done[key]) {
      const reason = await confirmBox("Undo this?", `${esc(it ? it.what : key)} will show as not done again.`, "Undo", true);
      if (!reason) return;
      await act(async () => { check(await sb.from("filings_done").delete().eq("key", key)); await addLog("Reason for undo", `${it ? it.what : key}: ${reason}`); });
      return;
    }
    const p = dialog(`<form method="dialog" id="df"><h3>Mark done</h3><p>${esc(it.what)}${it.amount !== undefined ? `<br><strong>${money(it.amount)}</strong>` : ""}</p>
      <label for="dd">Date paid or filed</label><input id="dd" type="date" value="${todayStr()}" required>
      <label for="dc" style="margin-top:10px">Confirmation number</label><input id="dc">
      <div class="row"><button class="btn secondary" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">Save</button></div></form>`);
    let rec = null;
    $("#df", dlg).addEventListener("submit", () => { rec = { key, done_date: $("#dd", dlg).value, confirmation: $("#dc", dlg).value.trim() || null, amount: it.amount === undefined ? null : it.amount }; });
    if ((await p) !== "ok" || !rec) return;
    await act(async () => check(await sb.from("filings_done").upsert(rec)));
  }));
}
VIEWS.deposits = () => {
  const st = settings(); const all = deadlines().filter((i) => i.pay);
  const open = all.filter((i) => !S.done[i.key] && i.amount > 0);
  const paid = all.filter((i) => S.done[i.key]);
  return head("Deposits", "What to send, where, and by when. Mark each one paid with its confirmation number.") + setupNotes() +
    `<div class="panel"><h2>To pay</h2>${open.length ? `<table><tr><th>Due</th><th>Where</th><th>For</th><th class="n">Amount</th><th></th></tr>${open.map((i) => `<tr><td>${nice(i.due)} ${status(i)}</td><td>${esc(i.where)}</td><td>${esc(i.what)}</td><td class="n"><strong>${money(i.amount)}</strong></td><td class="n"><button class="btn quiet" data-done="${i.key}">Mark paid</button></td></tr>`).join("")}</table>` : `<p class="empty">Nothing owed right now.</p>`}
    <p class="small muted">Schedule EFTPS payments by 8 p.m. Eastern the day before they’re due. Umoja deposits federal taxes monthly, the schedule every new employer starts on. If a quarter’s federal total stays under $2,500, the IRS lets you pay it with Form 941 instead.${st.sutaMethod === "reimbursable" ? " Georgia unemployment is set to reimbursable, so there’s no quarterly unemployment tax; Georgia bills Umoja only if a former coach collects benefits." : ""}</p></div>
    <div class="panel"><h2>Paid</h2>${paid.length ? `<table><tr><th>Paid</th><th>For</th><th class="n">Amount</th><th>Confirmation</th><th></th></tr>${paid.map((i) => { const d = S.done[i.key]; const changed = d.amount != null && Math.abs(d.amount - i.amount) > 0.004; return `<tr><td>${nice(d.date)}</td><td>${esc(i.what)}</td><td class="n">${money(d.amount ?? i.amount)}${changed ? ` <span class="pill bad">Now ${money(i.amount)}</span>` : ""}</td><td>${esc(d.confirmation || "—")}</td><td class="n"><button class="btn quiet" data-done="${i.key}">Undo</button></td></tr>`; }).join("")}</table>` : `<p class="empty">Nothing yet.</p>`}</div>`;
};
BIND.deposits = bindDone;
VIEWS.calendar = () => {
  let cur = "";
  return head("Deadlines", "Every federal and Georgia deposit and filing through February 2028. Dates already move to the next business day when they land on a weekend or federal holiday.") + setupNotes() +
    `<div class="panel"><table>${deadlines().map((i) => { const mk = i.due.slice(0, 7); let row = ""; if (mk !== cur) { cur = mk; const d = pd(i.due); row = `<tr class="month"><td colspan="5">${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}</td></tr>`; }
      return row + `<tr><td style="white-space:nowrap">${nice(i.due)}</td><td class="small muted">${esc(i.where)}</td><td>${esc(i.what)}</td><td class="n">${i.amount !== undefined ? (i.amount > 0 ? money(i.amount) : '<span class="muted">$0 so far</span>') : ""}</td><td class="n" style="white-space:nowrap">${status(i)} <button class="btn quiet" data-done="${i.key}">${S.done[i.key] ? "Undo" : "Mark done"}</button></td></tr>`; }).join("")}</table>
    <p class="small muted">Unverified: Georgia agencies follow state holidays, which can differ from federal ones by a day.</p></div>`;
};
BIND.calendar = bindDone;

// ----- Year-end & forms -----
function w2Totals(y) {
  const W = {};
  for (const r of finalRuns().filter((r) => r.payDate.slice(0, 4) === y)) for (const [id, x] of Object.entries(r.results || {})) {
    const w = (W[id] = W[id] || { b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0, b16: 0, b17: 0 });
    w.b1 = r2(w.b1 + x.gross); w.b2 = r2(w.b2 + x.fit); w.b3 = r2(w.b3 + x.ssWages); w.b4 = r2(w.b4 + x.ssEe); w.b5 = r2(w.b5 + x.medWages); w.b6 = r2(w.b6 + x.medEe + x.addlMed); w.b16 = r2(w.b16 + x.gaWages); w.b17 = r2(w.b17 + x.ga);
  }
  return W;
}
VIEWS.reports = () => {
  const years = [...new Set(finalRuns().map((r) => r.payDate.slice(0, 4)))]; if (!years.length) years.push("2026");
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
  return head("Year-end & forms", "The numbers to copy onto each form.", `<div class="row"><label for="ry" style="margin:0">Year</label><select id="ry" style="width:auto">${years.map((v) => `<option ${v === y ? "selected" : ""}>${v}</option>`).join("")}</select></div>`) +
    `<div class="panel"><div class="spread"><h2>W-2s for ${y}</h2><button class="btn secondary" id="w2csv" ${Object.keys(W).length ? "" : "disabled"}>Download as a spreadsheet</button></div>
    ${Object.keys(W).length ? `<table><tr><th>Coach</th><th class="n">Box 1</th><th class="n">Box 2</th><th class="n">Box 3</th><th class="n">Box 4</th><th class="n">Box 5</th><th class="n">Box 6</th><th class="n">Box 16</th><th class="n">Box 17</th></tr>${Object.entries(W).map(([id, w]) => `<tr><td>${esc(S.employees[id]?.name || "(deleted coach)")}</td>${["b1", "b2", "b3", "b4", "b5", "b6", "b16", "b17"].map((k) => `<td class="n">${money(w[k])}</td>`).join("")}</tr>`).join("")}</table>
    <p class="small muted">Box 1 wages, 2 federal tax, 3 Social Security wages, 4 Social Security tax, 5 Medicare wages, 6 Medicare tax, 16 Georgia wages, 17 Georgia tax. Box 15: GA, ${esc(st.gaWithholdingId)}. EIN ${esc(st.ein)}.</p>` : `<p class="empty">No finished pay runs in ${y}.</p>`}</div>` +
    quarters.map((q) => `<div class="panel"><h2>Q${q.q} ${y}</h2><div class="money">
      <div><h3 style="margin-bottom:6px">Form 941</h3>${sum([[`Line 1, employees paid for the period with ${["Mar", "Jun", "Sep", "Dec"][q.q - 1]} 12`, q.count], ["Line 2, wages", money(q.wages)], ["Line 3, income tax withheld", money(q.fit)], ["Line 5a, column 2", money(q.l5a)], ["Line 5c, column 2", money(q.l5c)], ...(q.addW ? [["Line 5d, column 2", money(q.l5d)]] : []), ["Line 5e", money(q.l5e)], ["Line 6", money(q.l6)], ["Line 7, fractions of cents", money(q.l7)], ["Lines 10 and 12", money(q.total), true], ["Line 13, deposits marked paid", money(q.dep)], ["Line 16, months 1 / 2 / 3", q.months.map(money).join(" / ")]])}
      <p class="small muted">Line 5a column 1 is ${money(q.ssW)}; line 5c column 1 is ${money(q.wages)}.</p></div>
      <div><h3 style="margin-bottom:6px">Georgia G-7</h3>${sum([...q.qm.map((mm, i) => [`${MONTHS[mm]} withheld`, money(q.gaMonths[i])]), ["Quarter total", money(q.ga), true]])}</div>
      <div><h3 style="margin-bottom:6px">GA DOL-4N</h3>${sum([["Item 2, gross wages", money(q.wages)], ["Item 3, wages over $9,500", money(r2(q.wages - q.sutaW))], ["Item 4, taxable wages", money(q.sutaW)], ["Tax due", money(q.suta), true]])}${!st.gaDolAccount ? '<p class="small muted">DOL account number not entered yet (Settings).</p>' : ""}</div>
    </div></div>`).join("");
};
BIND.reports = () => {
  $("#ry").addEventListener("change", (ev) => { S.repYear = ev.target.value; render(); });
  $("#w2csv")?.addEventListener("click", async () => {
    const y = $("#ry").value; const W = w2Totals(y); const st = settings();
    const rows = [["Coach", "Address", "Box 1", "Box 2", "Box 3", "Box 4", "Box 5", "Box 6", "Box 15 state ID", "Box 16", "Box 17"]];
    for (const [id, w] of Object.entries(W)) { const e = S.employees[id] || {}; rows.push([e.name || "", e.address || "", w.b1, w.b2, w.b3, w.b4, w.b5, w.b6, st.gaWithholdingId, w.b16, w.b17].map((v) => (typeof v === "number" ? v.toFixed(2) : v))); }
    download(`Umoja W-2 totals ${y}.csv`, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
    try { await addLog("W-2 totals downloaded", y); } catch (_) {}
  });
};

// ----- Tax rates -----
const RATE_META = [
  ["ssRate", "Social Security, each of coach and Umoja", "pct", "IRS Publication 15 (2026)"],
  ["ssWageBase", "Social Security stops after this much pay", "$", "Social Security Administration, Oct 24, 2025"],
  ["medRate", "Medicare, each of coach and Umoja", "pct", "IRS Publication 15 (2026)"],
  ["addlMedRate", "Additional Medicare, coach only", "pct", "IRS Publication 15 (2026)"],
  ["addlMedThreshold", "Additional Medicare starts after", "$", "IRS Publication 15 (2026)"],
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
VIEWS.rates = () => {
  const y = 2026; const R = rates(y); const T = FED_TABLES[y];
  const nm = { mfj: "Married filing jointly", single: "Single or married filing separately", hoh: "Head of household" };
  return head("Tax rates", "Every rate the calculator uses, with its source. Change one only if an agency tells you to. Finished pay runs keep the rates they were figured with.") +
    `<div class="panel"><h2>2026</h2><table><tr><th>Rate</th><th class="n">Value</th><th>Source</th><th></th></tr>${RATE_META.map(([k, l, t, src, unv]) => { const ov = S.rateOverrides[y] && S.rateOverrides[y][k] !== undefined; return `<tr><td>${l}</td><td class="n"><strong>${t === "pct" ? (R[k] * 100).toFixed(2) + "%" : money(R[k])}</strong>${ov ? ' <span class="pill warn">Changed</span>' : ""}</td><td class="small">${unv ? '<span class="pill warn">Unverified</span> ' : ""}${esc(src)}</td><td class="n"><button class="btn quiet" data-rate="${k}">Change</button></td></tr>`; }).join("")}</table></div>
    <div class="panel"><h2>Federal withholding tables</h2><p class="small muted">IRS Publication 15-T (2026), annual percentage method tables for automated payroll, W-4s from 2020 or later. Each paycheck is turned into a yearly amount, run through the table, then divided back down.</p>
    <div class="money">${["standard", "checkbox"].flatMap((sch) => Object.keys(T[sch]).map((s) => `<div><h3 class="small" style="margin-bottom:4px">${nm[s]}, Step 2 ${sch === "standard" ? "not checked" : "checked"}</h3><table class="small"><tr><th class="n">Yearly pay from</th><th class="n">Base tax</th><th class="n">Plus</th></tr>${T[sch][s].map((r) => `<tr><td class="n">${money(r[0])}</td><td class="n">${money(r[1])}</td><td class="n">${(r[2] * 100).toFixed(0)}%</td></tr>`).join("")}</table></div>`)).join("")}</div></div>`;
};
BIND.rates = () => $$("[data-rate]").forEach((b) => b.addEventListener("click", async () => {
  const k = b.dataset.rate; const meta = RATE_META.find((m) => m[0] === k); const y = 2026; const R = rates(y); const pct = meta[2] === "pct";
  const p = dialog(`<form method="dialog" id="rf"><h3>Change rate</h3><p>${esc(meta[1])}</p>
    <label for="rv">New value ${pct ? "(percent)" : "(dollars)"}</label><input id="rv" type="number" step="any" required value="${pct ? r2(R[k] * 10000) / 100 : R[k]}">
    <label for="rr" style="margin-top:10px">Why (saved in the activity log)</label><textarea id="rr" rows="2" required></textarea>
    <div class="row"><button class="btn quiet" value="restore" formnovalidate>Restore the sourced value</button><button class="btn secondary" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">Save</button></div></form>`);
  let val = null, reason = "";
  $("#rf", dlg).addEventListener("submit", () => { val = num($("#rv", dlg).value); if (pct) val = val / 100; reason = $("#rr", dlg).value.trim(); });
  const choice = await p; if (choice !== "ok" && choice !== "restore") return;
  const data = Object.assign({}, S.rateOverrides[y] || {});
  if (choice === "restore") delete data[k]; else data[k] = val;
  await act(async () => { check(await sb.from("rate_overrides").upsert({ year: y, data })); await addLog("Reason for rate change", `${meta[1]}: ${choice === "restore" ? "restored sourced value" : reason}`); });
}));

// ----- Settings -----
VIEWS.settings = () => {
  const st = settings();
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${st[v] === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  return head("Settings") +
    `<form class="panel" id="sf"><h2>Umoja</h2><div class="grid">
      <div><label for="s-employerName">Employer name</label><input id="s-employerName" value="${esc(st.employerName)}"></div>
      <div><label for="s-ein">EIN</label><input id="s-ein" value="${esc(st.ein)}"></div>
      <div><label for="s-gaWithholdingId">Georgia withholding ID</label><input id="s-gaWithholdingId" value="${esc(st.gaWithholdingId)}"></div>
      <div><label for="s-gaDolAccount">GA DOL account number</label><input id="s-gaDolAccount" value="${esc(st.gaDolAccount)}" placeholder="Not received yet"></div>
      <div style="grid-column:1/-1"><label for="s-address">Mailing address (prints on pay stubs)</label><input id="s-address" value="${esc(st.address)}"></div>
      <div><label for="s-payFrequency">How often coaches are paid</label>${sel("s-payFrequency", [["", "Choose"], ...Object.entries(FREQ_LABEL)], "payFrequency")}</div>
      <div><label for="s-gaFrequency">Georgia withholding filing frequency</label>${sel("s-gaFrequency", [["", "Choose"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"]], "gaFrequency")}</div>
      <div><label for="s-sutaMethod">Georgia unemployment</label>${sel("s-sutaMethod", [["reimbursable", "Reimbursable (nonprofit election)"], ["contributory", "Pay quarterly tax"]], "sutaMethod")}</div>
    </div><div class="row" style="margin-top:18px"><button class="btn" type="submit">Save settings</button></div></form>
    <form class="panel" id="pf"><h2>Quick-add session types</h2><p class="small muted">The buttons under each coach on a pay run. Leave hours blank to type them each time.</p>
      <table><tr><th>Name</th><th>Hours</th><th></th></tr>${st.presets.map((p, i) => `<tr><td><input data-pn="${i}" value="${esc(p.name)}" aria-label="Session type name"></td><td><input class="num-in" type="number" min="0" step="0.25" data-ph="${i}" value="${esc(p.hours)}" aria-label="Hours"></td><td class="n"><button type="button" class="btn quiet" data-prm="${i}">Remove</button></td></tr>`).join("")}</table>
      <div class="row" style="margin-top:10px"><button type="button" class="btn quiet" id="padd">Add a type</button><button class="btn secondary" type="submit">Save session types</button></div></form>
    <div class="panel"><h2>Your account</h2><div class="row"><button class="btn secondary" id="chpw">Change password</button><button class="btn secondary" id="backup">Download a backup</button></div>
      <p class="small muted">Everything saves as you go. A backup is an extra copy for your own files.</p></div>`;
};
BIND.settings = () => {
  const st = settings();
  $("#sf").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = Object.assign({}, S.settings); for (const k of ["employerName", "ein", "gaWithholdingId", "gaDolAccount", "address", "payFrequency", "gaFrequency", "sutaMethod"]) data[k] = $("#s-" + k).value.trim();
    await act(async () => check(await sb.from("settings").upsert({ id: 1, data: Object.assign({}, DEFAULT_SETTINGS, data) })));
  });
  let presets = structuredClone(st.presets);
  const sync = () => $$("[data-pn]").forEach((i) => { const k = +i.dataset.pn; presets[k] = { name: i.value, hours: $(`[data-ph="${k}"]`).value }; });
  $("#padd").addEventListener("click", () => { sync(); presets.push({ name: "", hours: "" }); S.settings = Object.assign({}, S.settings, { presets }); render(); });
  $$("[data-prm]").forEach((b) => b.addEventListener("click", () => { sync(); presets.splice(+b.dataset.prm, 1); S.settings = Object.assign({}, S.settings, { presets }); render(); }));
  $("#pf").addEventListener("submit", async (ev) => {
    ev.preventDefault(); sync();
    presets = presets.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), hours: p.hours === "" ? "" : num(p.hours) }));
    await act(async () => check(await sb.from("settings").upsert({ id: 1, data: Object.assign({}, DEFAULT_SETTINGS, S.settings, { presets }) })));
  });
  $("#chpw").addEventListener("click", () => showSetPassword(true));
  $("#backup").addEventListener("click", async () => {
    download(`Umoja payroll backup ${todayStr()}.json`, JSON.stringify({ exported: new Date().toISOString(), settings: S.settings, rateOverrides: S.rateOverrides, employees: S.employees, payRuns: S.runs, done: S.done }, null, 2), "application/json");
    try { await addLog("Backup downloaded", ""); } catch (_) {}
  });
};

// ----- Activity log -----
VIEWS.log = () => head("Activity log", "Every change, recorded by the database itself. Entries can’t be edited or deleted.") +
  `<div class="panel">${S.log.length ? `<table><tr><th>When</th><th>What</th><th>Details</th></tr>${S.log.map((e) => `<tr><td class="small" style="white-space:nowrap">${new Date(e.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td><td>${esc(e.action)}</td><td class="small">${esc(e.detail)}</td></tr>`).join("")}</table>` : `<p class="empty">Nothing yet.</p>`}</div>`;

// ---------------- auth & boot ----------------
function show(id) { for (const s of ["signin", "setpass", "app"]) $("#" + s).classList.toggle("hidden", s !== id); }
function showAsleep() {
  show("signin");
  $("#si-error").innerHTML = `The payroll database is asleep. It rests after a week without use. Open <a href="${SUPABASE_DASHBOARD}" target="_blank" rel="noopener">the umoja-payroll project in Supabase</a>, click Resume project, wait two minutes, then reload this page.`;
}
let forcedPw = false;
function showSetPassword(optional) {
  forcedPw = !optional; show("setpass"); $("#sp-error").textContent = ""; $("#sp-1").value = ""; $("#sp-2").value = ""; $("#sp-1").focus();
  if (optional && !$("#sp-cancel")) $("#setpass-form").insertAdjacentHTML("beforeend", '<button type="button" class="btn secondary" id="sp-cancel" style="margin-top:10px">Cancel</button>');
  $("#sp-cancel")?.addEventListener("click", () => { show("app"); render(); }, { once: true });
}
async function enterApp(session) {
  S.user = session.user;
  if (S.user.user_metadata?.must_change_password) { showSetPassword(false); return; }
  try { await loadAll(); } catch (e) { if (e instanceof Asleep) return showAsleep(); $("#si-error").textContent = e.message; show("signin"); return; }
  $("#who").textContent = S.user.email;
  const h = (location.hash || "").slice(1); if (TABS.some(([k]) => k === h)) S.tab = h;
  show("app"); render();
}
$("#signin-form").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("#si-error").textContent = "Signing in…";
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#si-email").value.trim(), password: $("#si-pass").value });
    if (error) { $("#si-error").textContent = /fetch|network/i.test(error.message) ? "Can’t reach the database right now." : "That email and password don’t match."; if (/fetch|network|5\d\d/i.test(error.message) || error.status >= 500) showAsleep(); return; }
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
$("#signout").addEventListener("click", async () => { await sb.auth.signOut(); S.editRun = null; show("signin"); $("#si-pass").focus(); });

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) await enterApp(data.session); else show("signin");
})();
// Let the "Pay run" draft survive accidental tab changes, but warn before leaving with unsaved work.
window.addEventListener("beforeunload", (e) => { if (S.editRun) { e.preventDefault(); e.returnValue = ""; } });
