const STORAGE_KEY = "buget_local_v2";

const DEFAULT_STATE = {
  budgets: ["Nealocat", "Cheltuieli", "Economii", "Bancă"],
  categories: ["Meditații/Educație", "Transport", "Facturi", "Piață", "Sănătate", "Cadouri", "Altele"],
  transactions: [],
  lastBackupISO: null
};

let state = loadState();

/* ===== storage ===== */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const s = JSON.parse(raw);
    s.budgets ??= structuredClone(DEFAULT_STATE.budgets);
    s.categories ??= structuredClone(DEFAULT_STATE.categories);
    s.transactions ??= [];
    s.lastBackupISO ??= null;
    return s;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ===== utils ===== */
function toBani(input) {
  const s = (input || "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
function baniToRON(bani) {
  const n = (bani || 0) / 100;
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(n);
}
function isoToday() {
  const d = new Date();
  const z = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return z.toISOString().slice(0,10);
}
function fmtDate(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ro-RO").format(d);
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function normalizedRange(startISO, endISO) {
  const s = startOfDay(new Date(startISO));
  const e = startOfDay(new Date(endISO));
  const to = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
  return { from: s, to };
}
function inRange(txISO, from, to) {
  const d = new Date(txISO);
  return d >= from && d < to;
}
function monthRange(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
}
function lastMonthRange(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

/* ===== core calculations ===== */
function computeBalances(txs) {
  const bal = {};
  state.budgets.forEach(b => bal[b] = 0);

  for (const t of txs) {
    if (t.type === "income") {
      bal[t.toBudget] = (bal[t.toBudget] || 0) + t.amountBani;
    } else if (t.type === "expense") {
      bal["Cheltuieli"] = (bal["Cheltuieli"] || 0) - t.amountBani;
    } else if (t.type === "transfer") {
      bal[t.fromBudget] = (bal[t.fromBudget] || 0) - t.amountBani;
      bal[t.toBudget] = (bal[t.toBudget] || 0) + t.amountBani;
    }
  }
  return bal;
}
function totalsFor(txs) {
  let inc=0, exp=0, tr=0;
  for (const t of txs) {
    if (t.type === "income") inc += t.amountBani;
    if (t.type === "expense") exp += t.amountBani;
    if (t.type === "transfer") tr += t.amountBani;
  }
  return { inc, exp, tr, net: inc - exp };
}
function expenseByCategory(txs) {
  const m = {};
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const c = t.category;
    m[c] = (m[c] || 0) + t.amountBani;
  }
  return m;
}
function ensureCategory(cat) {
  const c = (cat || "").trim();
  if (!c) return null;
  if (!state.categories.includes(c)) {
    state.categories.push(c);
    state.categories.sort((a,b)=>a.localeCompare(b,"ro"));
  }
  return c;
}

/* ===== backup reminder ===== */
function daysBetween(isoA, isoB) {
  const a = startOfDay(new Date(isoA));
  const b = startOfDay(new Date(isoB));
  const ms = b - a;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
function updateBackupReminder() {
  const el = document.getElementById("backupReminder");
  if (!el) return;

  const today = isoToday();

  if (!state.lastBackupISO) {
    el.style.display = "";
    el.innerHTML = `Atenție: nu ai făcut încă niciun backup.<div class="small">Apasă „Export Backup JSON” și salvează fișierul în Drive.</div>`;
    return;
  }

  const d = daysBetween(state.lastBackupISO, today);
  if (d >= 7) {
    el.style.display = "";
    el.innerHTML = `Atenție: au trecut ${d} zile de la ultimul backup (${fmtDate(state.lastBackupISO)}).<div class="small">Recomandat: fă un Export Backup JSON.</div>`;
  } else {
    el.style.display = "none";
    el.textContent = "";
  }
}

/* ===== UI: tabs ===== */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");

    if (btn.dataset.tab === "dash") renderDashboard();
    if (btn.dataset.tab === "add") renderAdd();
    if (btn.dataset.tab === "tx") renderTxList();
    if (btn.dataset.tab === "export") updateBackupReminder();
  });
});

/* ===== defaults ===== */
document.getElementById("txDate").value = isoToday();
document.getElementById("fStart").value = isoToday();
document.getElementById("fEnd").value = isoToday();
document.getElementById("rStart").value = isoToday();
document.getElementById("rEnd").value = isoToday();

/* ===== selects ===== */
function fillBudgets() {
  const to = document.getElementById("toBudget");
  const from = document.getElementById("fromBudget");
  const to2 = document.getElementById("toBudget2");

  to.innerHTML = ""; from.innerHTML = ""; to2.innerHTML = "";
  for (const b of state.budgets) {
    const o1 = document.createElement("option"); o1.value=b; o1.textContent=b;
    const o2 = document.createElement("option"); o2.value=b; o2.textContent=b;
    const o3 = document.createElement("option"); o3.value=b; o3.textContent=b;
    to.appendChild(o1); from.appendChild(o2); to2.appendChild(o3);
  }
  to.value = "Nealocat";
  from.value = "Economii";
  to2.value = "Cheltuieli";
}
function fillCategories() {
  const sel = document.getElementById("categorySelect");
  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = ""; o0.textContent = "Alege categoria...";
  sel.appendChild(o0);
  for (const c of state.categories) {
    const o = document.createElement("option");
    o.value=c; o.textContent=c;
    sel.appendChild(o);
  }
}

/* ===== type UI ===== */
function setTypeUI(type) {
  const rowTo = document.getElementById("rowToBudget");
  const rowTF = document.getElementById("rowTransferFrom");
  const rowTT = document.getElementById("rowTransferTo");
  const rowExp = document.getElementById("rowExpenseInfo");
  const rowCat = document.getElementById("rowCat");
  const rowDesc = document.getElementById("rowDesc");

  if (type === "income") {
    rowTo.style.display = "";
    rowTF.style.display = "none";
    rowTT.style.display = "none";
    rowExp.style.display = "none";
    rowCat.style.display = "none";
    rowDesc.style.display = "none";
    document.getElementById("toBudget").value = "Nealocat";
  }
  if (type === "expense") {
    rowTo.style.display = "none";
    rowTF.style.display = "none";
    rowTT.style.display = "none";
    rowExp.style.display = "";
    rowCat.style.display = "";
    rowDesc.style.display = "";
  }
  if (type === "transfer") {
    rowTo.style.display = "none";
    rowTF.style.display = "";
    rowTT.style.display = "";
    rowExp.style.display = "none";
    rowCat.style.display = "none";
    rowDesc.style.display = "none";
  }
}
document.getElementById("txType").addEventListener("change", (e) => {
  setTypeUI(e.target.value);
});

/* ===== save transaction ===== */
document.getElementById("saveTx").addEventListener("click", () => {
  const type = document.getElementById("txType").value;
  const date = document.getElementById("txDate").value || isoToday();
  const amountBani = toBani(document.getElementById("txAmount").value);
  const note = (document.getElementById("txNote").value || "").trim();

  const msg = document.getElementById("saveMsg");
  msg.className = "msg";
  msg.textContent = "";

  if (!amountBani) {
    msg.classList.add("err");
    msg.textContent = "Suma este invalidă.";
    return;
  }

  const tx = { id: uid(), dateISO: date, type, amountBani, note };

  if (type === "income") {
    tx.toBudget = document.getElementById("toBudget").value;
    tx.fromBudget = "";
    tx.category = "";
    tx.desc = "";
  }

  if (type === "expense") {
    const custom = (document.getElementById("categoryCustom").value || "").trim();
    const pick = (document.getElementById("categorySelect").value || "").trim();
    if (!custom && !pick) {
      msg.classList.add("err");
      msg.textContent = "Categoria este obligatorie.";
      return;
    }
    tx.category = ensureCategory(custom || pick);

    const desc = (document.getElementById("txDesc").value || "").trim();
    if (!desc) {
      msg.classList.add("err");
      msg.textContent = "Câmpul „Pentru ce a fost” este obligatoriu.";
      return;
    }
    tx.desc = desc;

    tx.fromBudget = "Cheltuieli";
    tx.toBudget = "";
  }

  if (type === "transfer") {
    tx.fromBudget = document.getElementById("fromBudget").value;
    tx.toBudget = document.getElementById("toBudget2").value;
    if (tx.fromBudget === tx.toBudget) {
      msg.classList.add("err");
      msg.textContent = "Transfer invalid: sursa și destinația sunt identice.";
      return;
    }
    tx.category = "";
    tx.desc = "";
  }

  state.transactions.push(tx);
  state.transactions.sort((a,b) => new Date(a.dateISO) - new Date(b.dateISO));
  saveState();

  // reset fields
  document.getElementById("txAmount").value = "";
  document.getElementById("txNote").value = "";
  document.getElementById("categoryCustom").value = "";
  document.getElementById("txDesc").value = "";
  document.getElementById("categorySelect").value = "";

  msg.classList.add("ok");
  msg.textContent = "Salvat.";

  renderDashboard();
  renderTxList();
});

/* ===== filter ===== */
document.getElementById("applyFilter").addEventListener("click", renderTxList);

/* ===== export quick ranges ===== */
document.getElementById("quickMonth").addEventListener("click", () => {
  const r = monthRange(new Date());
  document.getElementById("rStart").value = r.start.toISOString().slice(0,10);
  const lastDay = new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate() - 1);
  document.getElementById("rEnd").value = lastDay.toISOString().slice(0,10);
});
document.getElementById("quickLastMonth").addEventListener("click", () => {
  const r = lastMonthRange(new Date());
  document.getElementById("rStart").value = r.start.toISOString().slice(0,10);
  const lastDay = new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate() - 1);
  document.getElementById("rEnd").value = lastDay.toISOString().slice(0,10);
});
document.getElementById("quick7").addEventListener("click", () => {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  document.getElementById("rStart").value = start.toISOString().slice(0,10);
  document.getElementById("rEnd").value = end.toISOString().slice(0,10);
});

/* ===== report window ===== */
document.getElementById("openReport").addEventListener("click", () => {
  const startISO = document.getElementById("rStart").value;
  const endISO = document.getElementById("rEnd").value;
  if (!startISO || !endISO) return alert("Alege intervalul.");
  if (startISO > endISO) return alert("Interval invalid.");

  const html = buildReportHTML(startISO, endISO);
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
});

/* ===== backup JSON ===== */
document.getElementById("exportJson").addEventListener("click", () => {
  // marchează backup
  state.lastBackupISO = isoToday();
  saveState();
  updateBackupReminder();

  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "buget-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  setBackupMsg("Backup JSON exportat. Data backup-ului a fost salvată.", true);
});

document.getElementById("importJson").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const s = JSON.parse(text);
    if (!s || !Array.isArray(s.transactions)) throw new Error("Fișier invalid.");
    // migrare minimă
    s.budgets ??= structuredClone(DEFAULT_STATE.budgets);
    s.categories ??= structuredClone(DEFAULT_STATE.categories);
    s.transactions ??= [];
    s.lastBackupISO ??= null;

    state = s;
    saveState();
    updateBackupReminder();

    setBackupMsg("Backup importat. Datele au fost încărcate.", true);
    renderDashboard(); renderAdd(); renderTxList();
  } catch (err) {
    setBackupMsg("Import eșuat: " + err.message, false);
  }
});

function setBackupMsg(text, ok) {
  const el = document.getElementById("backupMsg");
  el.className = "msg " + (ok ? "ok" : "err");
  el.textContent = text;
}

/* ===== dashboard render ===== */
function renderDashboard() {
  const cards = document.getElementById("budgetCards");
  cards.innerHTML = "";

  const bal = computeBalances(state.transactions);
  for (const b of state.budgets) {
    const d = document.createElement("div");
    d.className = "card";
    d.innerHTML = `
      <div class="name">${escapeHtml(b)}</div>
      <div class="bal">${baniToRON(bal[b] || 0)}</div>
      <div class="mini">Sold calculat din tranzacții</div>
    `;
    cards.appendChild(d);
  }

  const mr = monthRange(new Date());
  const monthTxs = state.transactions.filter(t => {
    const d = new Date(t.dateISO);
    return d >= mr.start && d < mr.end;
  });

  const t = totalsFor(monthTxs);
  document.getElementById("mIncome").textContent = baniToRON(t.inc);
  document.getElementById("mExpense").textContent = baniToRON(t.exp);
  document.getElementById("mTransfer").textContent = baniToRON(t.tr);
  document.getElementById("mNet").textContent = baniToRON(t.net);

  renderPie(monthTxs);
  renderTopCats(monthTxs);
}

function renderTopCats(monthTxs) {
  const cats = expenseByCategory(monthTxs);
  const pairs = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8);

  const top = document.getElementById("topCats");
  top.innerHTML = pairs.length ? "" : `<div class="item"><div class="small">Nu există cheltuieli pe categorii în luna curentă.</div></div>`;

  for (const [name, bani] of pairs) {
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `
      <div class="itemTop">
        <div><strong>${escapeHtml(name)}</strong></div>
        <div class="badge">${baniToRON(bani)}</div>
      </div>
    `;
    top.appendChild(it);
  }
}

/* ===== add render ===== */
function renderAdd() {
  fillBudgets();
  fillCategories();
  setTypeUI(document.getElementById("txType").value);
  renderCatChips();
}

function renderCatChips() {
  const wrap = document.getElementById("catChips");
  wrap.innerHTML = "";
  for (const c of state.categories.slice(0, 14)) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = c;
    b.addEventListener("click", () => {
      document.getElementById("txType").value = "expense";
      setTypeUI("expense");
      document.getElementById("categorySelect").value = c;
      document.getElementById("categoryCustom").value = "";
      document.getElementById("txDesc").focus();
    });
    wrap.appendChild(b);
  }
}

/* ===== transactions list ===== */
function renderTxList() {
  const startISO = document.getElementById("fStart").value || isoToday();
  const endISO = document.getElementById("fEnd").value || isoToday();
  const type = document.getElementById("fType").value;
  const q = (document.getElementById("fSearch").value || "").trim().toLowerCase();

  const { from, to } = normalizedRange(startISO, endISO);

  let txs = state.transactions.filter(t => inRange(t.dateISO, from, to));
  if (type !== "all") txs = txs.filter(t => t.type === type);
  if (q) {
    txs = txs.filter(t => {
      const hay = [t.category || "", t.desc || "", t.note || "", t.fromBudget || "", t.toBudget || ""]
        .join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  const list = document.getElementById("txList");
  list.innerHTML = "";

  if (!txs.length) {
    list.innerHTML = `<div class="item"><div class="small">Nu există tranzacții în intervalul ales.</div></div>`;
    return;
  }

  for (const t of txs.slice().reverse()) {
    const it = document.createElement("div");
    it.className = "item";

    const label = t.type === "income" ? "Venit" : t.type === "expense" ? "Cheltuială" : "Transfer";
    const flow =
      t.type === "income" ? `În: ${t.toBudget}` :
      t.type === "expense" ? `Din: Cheltuieli` :
      `${t.fromBudget} → ${t.toBudget}`;

    const main =
      t.type === "expense"
        ? `<strong>${escapeHtml(t.category)}</strong> • ${escapeHtml(t.desc)}`
        : `<span class="small">${escapeHtml(t.note || "–")}</span>`;

    it.innerHTML = `
      <div class="itemTop">
        <div><span class="badge">${label}</span> <span class="small">${fmtDate(t.dateISO)}</span></div>
        <div class="badge">${baniToRON(t.amountBani)}</div>
      </div>
      <div class="small">${escapeHtml(flow)}</div>
      <div class="small">${main}</div>
    `;
    list.appendChild(it);
  }
}

/* ===== pie chart ===== */
function colorForIndex(i, n) {
  const hue = Math.round((i * 360) / Math.max(n, 1));
  return `hsl(${hue} 70% 55%)`;
}
function drawPie(canvas, dataPairs) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) * 0.38;

  ctx.clearRect(0, 0, w, h);

  const total = dataPairs.reduce((s, p) => s + p.value, 0);
  if (!total) {
    ctx.fillStyle = "#666";
    ctx.font = "14px -apple-system, system-ui, Arial";
    ctx.textAlign = "center";
    ctx.fillText("Nu există cheltuieli în luna curentă.", cx, cy);
    return;
  }

  let angle = -Math.PI / 2;
  dataPairs.forEach((p) => {
    const slice = (p.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    angle += slice;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.font = "700 14px -apple-system, system-ui, Arial";
  ctx.textAlign = "center";
  ctx.fillText("Cheltuieli", cx, cy - 6);
  ctx.font = "900 16px -apple-system, system-ui, Arial";
  ctx.fillText(baniToRON(total), cx, cy + 16);
}
function renderPie(monthTxs) {
  const map = expenseByCategory(monthTxs);
  const pairs = Object.entries(map)
    .map(([name, bani]) => ({ name, value: bani }))
    .sort((a,b)=>b.value - a.value);

  const max = 8;
  let finalPairs = pairs;
  if (pairs.length > max) {
    const top = pairs.slice(0, max);
    const rest = pairs.slice(max).reduce((s,p)=>s+p.value, 0);
    top.push({ name: "Altele", value: rest });
    finalPairs = top;
  }

  finalPairs = finalPairs.map((p, i) => ({ ...p, color: colorForIndex(i, finalPairs.length) }));

  const canvas = document.getElementById("pieCanvas");
  if (canvas) drawPie(canvas, finalPairs);

  const legend = document.getElementById("pieLegend");
  if (!legend) return;
  legend.innerHTML = "";

  if (!finalPairs.length) {
    legend.innerHTML = `<div class="item"><div class="small">Nu există cheltuieli în luna curentă.</div></div>`;
    return;
  }

  finalPairs.forEach(p => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTop">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:12px;height:12px;border-radius:3px;background:${p.color};display:inline-block;"></span>
          <strong>${escapeHtml(p.name)}</strong>
        </div>
        <div class="badge">${baniToRON(p.value)}</div>
      </div>
    `;
    legend.appendChild(div);
  });
}

/* ===== report (print-to-PDF) ===== */
function buildReportHTML(startISO, endISO) {
  const { from, to } = normalizedRange(startISO, endISO);
  const txs = state.transactions.filter(t => inRange(t.dateISO, from, to));
  const t = totalsFor(txs);
  const balAll = computeBalances(state.transactions);

  const cats = expenseByCategory(txs);
  const catPairs = Object.entries(cats).sort((a,b)=>b[1]-a[1]);

  const rows = txs.slice().sort((a,b)=>new Date(a.dateISO)-new Date(b.dateISO));
  const now = new Date();

  const pairs = catPairs.map(([name, value]) => ({ name, value }));
  const max = 8;
  let finalPairs = pairs;
  if (pairs.length > max) {
    const top = pairs.slice(0, max);
    const rest = pairs.slice(max).reduce((s,p)=>s+p.value, 0);
    top.push({ name: "Altele", value: rest });
    finalPairs = top;
  }
  finalPairs = finalPairs.map((p, i) => ({ ...p, color: colorForIndex(i, finalPairs.length) }));

  const budgetsRows = state.budgets.map(b => `
    <tr><td>${escapeHtml(b)}</td><td class="right">${baniToRON(balAll[b] || 0)}</td></tr>
  `).join("");

  const catsRows = (catPairs.length ? catPairs : [["–",0]]).map(([name, bani]) => `
    <tr><td>${escapeHtml(name)}</td><td class="right">${baniToRON(bani)}</td></tr>
  `).join("");

  const txRows = rows.map(x => {
    const label = x.type === "income" ? "Venit" : x.type === "expense" ? "Cheltuială" : "Transfer";
    const cat = x.type === "expense" ? x.category : "–";
    const fromB = x.type === "income" ? "–" : (x.type === "expense" ? "Cheltuieli" : x.fromBudget);
    const toB = x.type === "expense" ? "–" : (x.type === "income" ? x.toBudget : x.toBudget);
    const details = x.type === "expense" ? x.desc : (x.note || "–");

    return `
      <tr>
        <td>${fmtDate(x.dateISO)}</td>
        <td>${label}</td>
        <td>${escapeHtml(cat)}</td>
        <td>${escapeHtml(fromB)}</td>
        <td>${escapeHtml(toB)}</td>
        <td class="right">${baniToRON(x.amountBani)}</td>
        <td>${escapeHtml(details)}</td>
      </tr>
    `;
  }).join("");

  const pieDataJson = JSON.stringify(finalPairs);

  return `
<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Raport buget</title>
<style>
  body { font-family: -apple-system, system-ui, Arial; margin: 24px; color: #111; }
  h1 { margin: 0 0 6px; }
  .muted { color: #555; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
  .box { border: 1px solid #ddd; border-radius: 10px; padding: 10px; }
  .label { font-size: 12px; color: #666; }
  .val { font-weight: 900; font-size: 16px; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; font-size: 12px; }
  th { background: #f3f3f3; text-align: left; }
  .right { text-align: right; white-space: nowrap; }
  .btn { margin: 14px 0; padding: 10px 12px; border: 1px solid #111; border-radius: 10px; background: #111; color:#fff; font-weight: 900; }
  canvas { display:block; margin: 10px 0 6px; border:1px solid #ddd; border-radius: 12px; }
  .legendItem { font-size: 12px; margin: 4px 0; display:flex; align-items:center; gap:8px; }
  .dot { width:12px; height:12px; border-radius:3px; display:inline-block; }
  @media print { .btn { display:none; } body { margin: 0.6in; } }
</style>
</head>
<body>
  <h1>Raport buget</h1>
  <div class="muted">Perioadă: ${fmtDate(startISO)} – ${fmtDate(endISO)} • Generat: ${now.toLocaleString("ro-RO")} • Monedă: RON</div>

  <button class="btn" onclick="window.print()">Tipărește / Salvează PDF</button>

  <div class="grid">
    <div class="box"><div class="label">Venituri</div><div class="val">${baniToRON(t.inc)}</div></div>
    <div class="box"><div class="label">Cheltuieli</div><div class="val">${baniToRON(t.exp)}</div></div>
    <div class="box"><div class="label">Transferuri</div><div class="val">${baniToRON(t.tr)}</div></div>
    <div class="box"><div class="label">Net (Venituri − Cheltuieli)</div><div class="val">${baniToRON(t.net)}</div></div>
  </div>

  <h2>Cheltuieli pe categorii (grafic)</h2>
  <canvas id="pie" width="320" height="320"></canvas>
  <div id="legend"></div>

  <h2>Solduri bugete (la zi)</h2>
  <table>
    <tr><th>Buget</th><th class="right">Sold</th></tr>
    ${budgetsRows}
  </table>

  <h2>Cheltuieli pe categorii (în perioada aleasă)</h2>
  <table>
    <tr><th>Categorie</th><th class="right">Total</th></tr>
    ${catsRows}
  </table>

  <h2>Toate mișcările (în perioada aleasă)</h2>
  <table>
    <tr>
      <th>Data</th><th>Tip</th><th>Categorie</th><th>Din</th><th>În</th><th class="right">Sumă</th><th>Detalii</th>
    </tr>
    ${txRows || ""}
  </table>

<script>
  const data = ${pieDataJson};
  function baniToRON(bani){
    const n = (bani || 0) / 100;
    return new Intl.NumberFormat("ro-RO",{style:"currency",currency:"RON"}).format(n);
  }
  function drawPie(canvas, dataPairs){
    const ctx = canvas.getContext("2d");
    const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,r=Math.min(w,h)*0.38;
    ctx.clearRect(0,0,w,h);
    const total=dataPairs.reduce((s,p)=>s+p.value,0);
    if(!total){
      ctx.fillStyle="#666"; ctx.font="14px -apple-system, system-ui, Arial"; ctx.textAlign="center";
      ctx.fillText("Nu există cheltuieli în perioada asta.",cx,cy);
      return;
    }
    let angle=-Math.PI/2;
    dataPairs.forEach(p=>{
      const slice=(p.value/total)*Math.PI*2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+slice); ctx.closePath();
      ctx.fillStyle=p.color; ctx.fill();
      ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.stroke();
      angle+=slice;
    });
    ctx.beginPath(); ctx.arc(cx,cy,r*0.55,0,Math.PI*2); ctx.fillStyle="rgba(255,255,255,0.92)"; ctx.fill();
    ctx.fillStyle="#111"; ctx.font="700 14px -apple-system, system-ui, Arial"; ctx.textAlign="center";
    ctx.fillText("Cheltuieli",cx,cy-6);
    ctx.font="900 16px -apple-system, system-ui, Arial";
    ctx.fillText(baniToRON(total),cx,cy+16);
  }
  drawPie(document.getElementById("pie"), data);
  const legend=document.getElementById("legend");
  if(data.length){
    legend.innerHTML = data.map(p=>\`
      <div class="legendItem"><span class="dot" style="background:\${p.color}"></span>
      <strong>\${p.name}</strong> • \${baniToRON(p.value)}</div>\`).join("");
  }
</script>
</body>
</html>`;
}

/* ===== init ===== */
fillBudgets();
fillCategories();
setTypeUI(document.getElementById("txType").value);
renderDashboard();
renderAdd();
renderTxList();
updateBackupReminder();

/* ===== service worker ===== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}
