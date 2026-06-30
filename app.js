// ============================================================
// Patrimoine — application
// Vanilla JS, Supabase (DB + Auth), Chart.js
// ============================================================

/* ---------------------------------------------------------- */
/*  Setup                                                       */
/* ---------------------------------------------------------- */

const supabase = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

const DEFAULT_ACCOUNTS = [
  { name: "Compte Courant", type: "courant", color: "#0a2540", sort_order: 1 },
  { name: "Livret A", type: "epargne_reglementee", color: "#b08d2e", sort_order: 2 },
  { name: "LDD", type: "epargne_reglementee", color: "#d9b95e", sort_order: 3 },
  { name: "PEL", type: "epargne_reglementee", color: "#8a7032", sort_order: 4 },
  { name: "PEA", type: "investissement", color: "#5c7a5c", sort_order: 5 },
  { name: "Kraken", type: "crypto", color: "#6b4ca0", sort_order: 6 },
  { name: "Bitstack", type: "crypto", color: "#a4502b", sort_order: 7 },
];

const TYPE_LABELS = {
  courant: "Compte courant",
  epargne_reglementee: "Épargne réglementée",
  investissement: "Investissement",
  crypto: "Crypto",
};

const CATEGORIES = ["Logement", "Alimentation", "Transport", "Loisirs", "Abonnements", "Santé", "Autre"];

let state = {
  session: null,
  accounts: [],
  movements: [],
  currentView: "dashboard",
  expenseCursor: startOfMonth(new Date()),
  charts: {},
  editingMovementId: null,
};

/* ---------------------------------------------------------- */
/*  Helpers                                                     */
/* ---------------------------------------------------------- */

const eurFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
function formatEUR(n) { return eurFormatter.format(n || 0); }

function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
function formatDateLong(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function monthLabel(d) {
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
function isSameMonth(dateStr, monthDate) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth();
}

function showToast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  setTimeout(() => { el.className = "toast"; }, 2600);
}

function accountById(id) { return state.accounts.find(a => a.id === id); }

function accountBalance(accountId) {
  return state.movements
    .filter(m => m.account_id === accountId)
    .reduce((sum, m) => sum + Number(m.amount), 0);
}

function totalPatrimoine() {
  return state.accounts.reduce((sum, a) => sum + accountBalance(a.id), 0);
}

/* ---------------------------------------------------------- */
/*  Auth                                                        */
/* ---------------------------------------------------------- */

let authMode = "login";

document.getElementById("tab-login").addEventListener("click", () => setAuthMode("login"));
document.getElementById("tab-signup").addEventListener("click", () => setAuthMode("signup"));

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById("tab-login").classList.toggle("active", mode === "login");
  document.getElementById("tab-signup").classList.toggle("active", mode === "signup");
  document.getElementById("auth-submit").textContent = mode === "login" ? "Se connecter" : "Créer mon compte";
  document.getElementById("auth-error").style.display = "none";
  document.getElementById("auth-info").style.display = "none";
}

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errEl = document.getElementById("auth-error");
  const infoEl = document.getElementById("auth-info");
  errEl.style.display = "none";
  infoEl.style.display = "none";
  const submitBtn = document.getElementById("auth-submit");
  submitBtn.disabled = true;

  try {
    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session === null) {
        infoEl.textContent = "Compte créé ! Vérifiez votre boîte mail et cliquez sur le lien de confirmation, puis revenez vous connecter ici.";
        infoEl.style.display = "block";
        setAuthMode("login");
        submitBtn.disabled = false;
        return;
      }
    }
  } catch (err) {
    errEl.textContent = translateAuthError(err.message);
    errEl.style.display = "block";
    submitBtn.disabled = false;
  }
});

function translateAuthError(msg) {
  if (/Invalid login credentials/i.test(msg)) return "Email ou mot de passe incorrect.";
  if (/already registered/i.test(msg)) return "Un compte existe déjà avec cet email.";
  if (/Password should be/i.test(msg)) return "Le mot de passe doit contenir au moins 6 caractères.";
  return msg;
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabase.auth.signOut();
});

supabase.auth.onAuthStateChange((event, session) => {
  state.session = session;
  if (session) {
    boot();
  } else {
    document.getElementById("loading").style.display = "none";
    document.getElementById("app").classList.remove("visible");
    document.getElementById("onboarding-screen").style.display = "none";
    document.getElementById("auth-screen").style.display = "flex";
  }
});

/* ---------------------------------------------------------- */
/*  Boot / data load                                            */
/* ---------------------------------------------------------- */

async function boot() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("loading").style.display = "flex";

  const [{ data: accounts, error: accErr }, { data: movements, error: movErr }] = await Promise.all([
    supabase.from("accounts").select("*").order("sort_order"),
    supabase.from("movements").select("*").order("date", { ascending: false }),
  ]);

  if (accErr || movErr) {
    showToast("Erreur de chargement des données.", true);
    console.error(accErr, movErr);
    document.getElementById("loading").style.display = "none";
    return;
  }

  state.accounts = accounts || [];
  state.movements = movements || [];

  document.getElementById("loading").style.display = "none";

  if (state.accounts.length === 0) {
    showOnboarding();
  } else {
    document.getElementById("onboarding-screen").style.display = "none";
    document.getElementById("app").classList.add("visible");
    renderAll();
  }
}

/* ---------------------------------------------------------- */
/*  Onboarding                                                   */
/* ---------------------------------------------------------- */

function showOnboarding() {
  const form = document.getElementById("onboarding-form");
  const progress = document.getElementById("ob-progress");
  form.innerHTML = "";
  progress.innerHTML = "";

  DEFAULT_ACCOUNTS.forEach((acc, i) => {
    progress.insertAdjacentHTML("beforeend", `<span data-step="${i}"></span>`);
    const step = document.createElement("div");
    step.className = "obstep" + (i === 0 ? " active" : "");
    step.dataset.step = i;
    step.innerHTML = `
      <h3 style="margin-bottom:4px;">${acc.name}</h3>
      <p class="hint" style="margin-bottom:14px;">${TYPE_LABELS[acc.type]}</p>
      <div class="field">
        <label>Solde actuel</label>
        <input type="number" step="0.01" class="ob-balance-input" data-index="${i}" placeholder="0.00" required>
      </div>
    `;
    form.appendChild(step);
  });

  let current = 0;
  function updateProgress() {
    progress.querySelectorAll("span").forEach((s, i) => s.classList.toggle("done", i <= current));
    form.querySelectorAll(".obstep").forEach((s, i) => s.classList.toggle("active", i === current));
    document.getElementById("ob-submit").textContent = current === DEFAULT_ACCOUNTS.length - 1
      ? "Commencer le suivi" : "Suivant";
  }

  document.getElementById("onboarding-form").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("ob-error");
    errEl.style.display = "none";

    const inputs = form.querySelectorAll(".ob-balance-input");
    const currentInput = inputs[current];
    if (currentInput.value === "") {
      errEl.textContent = "Merci d'indiquer un solde (0 si vide).";
      errEl.style.display = "block";
      return;
    }

    if (current < DEFAULT_ACCOUNTS.length - 1) {
      current += 1;
      updateProgress();
      return;
    }

    // Dernière étape : créer tous les comptes + mouvement initial
    const submitBtn = document.getElementById("ob-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Création en cours…";
    try {
      const userId = state.session.user.id;
      const accountsToInsert = DEFAULT_ACCOUNTS.map(a => ({
        user_id: userId, name: a.name, type: a.type, color: a.color, sort_order: a.sort_order,
      }));
      const { data: inserted, error: insErr } = await supabase.from("accounts").insert(accountsToInsert).select();
      if (insErr) throw insErr;

      const movementsToInsert = inserted.map((acc, i) => ({
        user_id: userId,
        account_id: acc.id,
        date: todayISO(),
        amount: Number(inputs[i].value || 0),
        category: null,
        note: "Solde initial",
        is_initial: true,
      }));
      const { error: movErr } = await supabase.from("movements").insert(movementsToInsert);
      if (movErr) throw movErr;

      await boot();
    } catch (err) {
      errEl.textContent = "Erreur : " + err.message;
      errEl.style.display = "block";
      submitBtn.disabled = false;
      updateProgress();
    }
  };

  document.getElementById("onboarding-screen").style.display = "flex";
  updateProgress();
}

/* ---------------------------------------------------------- */
/*  Navigation                                                   */
/* ---------------------------------------------------------- */

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  renderAll();
}

function renderAll() {
  if (state.currentView === "dashboard") renderDashboard();
  if (state.currentView === "accounts") renderAccounts();
  if (state.currentView === "expenses") renderExpenses();
  if (state.currentView === "journal") renderJournal();
}

/* ---------------------------------------------------------- */
/*  Dashboard                                                    */
/* ---------------------------------------------------------- */

function renderDashboard() {
  const total = totalPatrimoine();
  document.getElementById("db-total").textContent = formatEUR(total);

  // Variation depuis le début du mois
  const startMonth = startOfMonth(new Date()).toISOString().slice(0, 10);
  const totalStartOfMonth = state.accounts.reduce((sum, a) => {
    const balanceBefore = state.movements
      .filter(m => m.account_id === a.id && m.date < startMonth)
      .reduce((s, m) => s + Number(m.amount), 0);
    return sum + balanceBefore;
  }, 0);
  const diff = total - totalStartOfMonth;
  const trendEl = document.getElementById("db-trend");
  if (Math.abs(diff) < 0.01) {
    trendEl.textContent = "Stable depuis le début du mois";
    trendEl.className = "sub";
  } else {
    trendEl.textContent = `${diff > 0 ? "▲" : "▼"} ${formatEUR(Math.abs(diff))} depuis le début du mois`;
    trendEl.className = "sub " + (diff > 0 ? "positive" : "negative");
  }

  renderRepartitionChart();
  renderEvolutionChart();
  renderRecentMovements();
}

function renderRepartitionChart() {
  const ctx = document.getElementById("chart-repartition");
  const data = state.accounts.map(a => ({ ...a, balance: accountBalance(a.id) }));
  const positive = data.filter(d => d.balance > 0);
  const labels = positive.map(d => d.name);
  const values = positive.map(d => d.balance);
  const colors = positive.map(d => d.color);

  if (state.charts.repartition) state.charts.repartition.destroy();
  state.charts.repartition = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#fffdf6" }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${formatEUR(c.raw)}` } } },
      cutout: "65%",
      maintainAspectRatio: false,
    },
  });

  const legend = document.getElementById("legend-repartition");
  legend.innerHTML = data.map(d => `
    <li>
      <span class="name"><span class="dot" style="background:${d.color}"></span>${d.name}</span>
      <span class="val amount">${formatEUR(d.balance)}</span>
    </li>
  `).join("");
}

function renderEvolutionChart() {
  const ctx = document.getElementById("chart-evolution");
  const allDates = [...new Set(state.movements.map(m => m.date))].sort();

  let points;
  if (allDates.length === 0) {
    points = [{ x: todayISO(), y: 0 }];
  } else {
    points = allDates.map(date => {
      const total = state.accounts.reduce((sum, a) => {
        const bal = state.movements
          .filter(m => m.account_id === a.id && m.date <= date)
          .reduce((s, m) => s + Number(m.amount), 0);
        return sum + bal;
      }, 0);
      return { x: date, y: total };
    });
    // point "aujourd'hui" pour prolonger la ligne
    if (points[points.length - 1].x !== todayISO()) {
      points.push({ x: todayISO(), y: points[points.length - 1].y });
    }
  }

  if (state.charts.evolution) state.charts.evolution.destroy();
  state.charts.evolution = new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map(p => formatDateShort(p.x)),
      datasets: [{
        data: points.map(p => p.y),
        borderColor: "#b08d2e",
        backgroundColor: "rgba(176,141,46,0.12)",
        fill: true,
        tension: 0.25,
        pointRadius: points.length > 20 ? 0 : 3,
        pointBackgroundColor: "#0a2540",
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatEUR(c.raw) } } },
      scales: {
        y: { ticks: { callback: (v) => formatEUR(v) } },
        x: { ticks: { maxTicksLimit: 6 } },
      },
    },
  });
}

function renderRecentMovements() {
  const recent = [...state.movements].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const el = document.getElementById("db-recent");
  if (recent.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📭</div>Aucun mouvement pour l'instant.</div>`;
    return;
  }
  el.innerHTML = recent.map(m => movementRowHTML(m)).join("");
}

function movementRowHTML(m) {
  const acc = accountById(m.account_id);
  const positive = Number(m.amount) >= 0;
  return `
    <div class="movement-row">
      <div class="m-left">
        <span class="m-account">${acc ? acc.name : "?"}</span>
        <span class="m-meta">${formatDateLong(m.date)}${m.category ? " · " + m.category : ""}${m.note ? " · " + escapeHTML(m.note) : ""}</span>
      </div>
      <span class="m-amount amount ${positive ? "positive" : "negative"}">${positive ? "+" : ""}${formatEUR(m.amount)}</span>
    </div>
  `;
}

function escapeHTML(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------------------------------------------------- */
/*  Comptes                                                      */
/* ---------------------------------------------------------- */

function renderAccounts() {
  const el = document.getElementById("accounts-list");
  el.innerHTML = state.accounts.map(a => {
    const balance = accountBalance(a.id);
    const history = state.movements
      .filter(m => m.account_id === a.id)
      .sort((x, y) => y.date.localeCompare(x.date))
      .slice(0, 5);
    return `
      <div class="account-card" style="--account-color:${a.color}">
        <div class="account-card-head">
          <div>
            <div class="name">${a.name}</div>
            <span class="type-tag">${TYPE_LABELS[a.type]}</span>
          </div>
        </div>
        <div class="balance amount">${formatEUR(balance)}</div>
        <div class="account-card-actions">
          <button class="btn btn-gold btn-sm" data-action="add-mv" data-account="${a.id}">+ Mouvement</button>
          <button class="btn btn-text btn-sm" data-action="toggle-history" data-account="${a.id}">Historique ▾</button>
        </div>
        <div class="mini-history" id="history-${a.id}">
          ${history.length === 0
            ? `<div class="hint">Aucun mouvement encore.</div>`
            : history.map(m => movementRowHTML(m)).join("")}
        </div>
      </div>
    `;
  }).join("");

  el.querySelectorAll('[data-action="add-mv"]').forEach(btn => {
    btn.addEventListener("click", () => openMovementModal({ accountId: btn.dataset.account }));
  });
  el.querySelectorAll('[data-action="toggle-history"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".account-card");
      card.classList.toggle("expanded");
      btn.textContent = card.classList.contains("expanded") ? "Historique ▴" : "Historique ▾";
    });
  });
}

/* ---------------------------------------------------------- */
/*  Dépenses (compte courant)                                    */
/* ---------------------------------------------------------- */

function courantAccount() {
  return state.accounts.find(a => a.type === "courant");
}

document.getElementById("exp-prev").addEventListener("click", () => {
  state.expenseCursor = addMonths(state.expenseCursor, -1);
  renderExpenses();
});
document.getElementById("exp-next").addEventListener("click", () => {
  state.expenseCursor = addMonths(state.expenseCursor, 1);
  renderExpenses();
});

function renderExpenses() {
  const acc = courantAccount();
  document.getElementById("exp-month-label").textContent = capitalize(monthLabel(state.expenseCursor));
  if (!acc) return;

  const monthExpenses = state.movements.filter(m =>
    m.account_id === acc.id && Number(m.amount) < 0 && !m.is_initial && isSameMonth(m.date, state.expenseCursor)
  );

  const total = monthExpenses.reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
  document.getElementById("exp-total").textContent = formatEUR(total);

  const byCat = {};
  CATEGORIES.forEach(c => byCat[c] = 0);
  monthExpenses.forEach(m => {
    const cat = m.category || "Autre";
    byCat[cat] = (byCat[cat] || 0) + Math.abs(Number(m.amount));
  });
  const maxVal = Math.max(1, ...Object.values(byCat));
  const catEl = document.getElementById("exp-by-category");
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (total === 0) {
    catEl.innerHTML = `<div class="empty-state"><div class="icon">🧾</div>Aucune dépense ce mois-ci.</div>`;
  } else {
    catEl.innerHTML = sortedCats.map(([cat, val]) => `
      <div class="cat-row">
        <span class="cat-name">${cat}</span>
        <span class="cat-bar-wrap"><span class="cat-bar" style="width:${(val / maxVal) * 100}%"></span></span>
        <span class="cat-val amount">${formatEUR(val)}</span>
      </div>
    `).join("");
  }

  renderTrendChart(acc);

  const listEl = document.getElementById("exp-list");
  const sorted = [...monthExpenses].sort((a, b) => b.date.localeCompare(a.date));
  listEl.innerHTML = sorted.length === 0
    ? `<div class="empty-state"><div class="icon">📭</div>Rien à afficher.</div>`
    : sorted.map(m => `
      <div class="journal-row">
        <span class="j-date">${formatDateShort(m.date)}</span>
        <span class="j-dot" style="background:var(--rust)"></span>
        <div class="j-mid">
          <div class="j-account">${m.category || "Autre"}</div>
          <div class="j-note">${m.note ? escapeHTML(m.note) : ""}</div>
        </div>
        <span class="j-amount amount negative">${formatEUR(m.amount)}</span>
        <div class="j-actions">
          <button data-edit="${m.id}" title="Modifier">✎</button>
        </div>
      </div>
    `).join("");
  listEl.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openMovementModal({ movementId: btn.dataset.edit }));
  });
}

function renderTrendChart(acc) {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(startOfMonth(new Date()), -i));

  const totals = months.map(m => {
    return state.movements
      .filter(mv => mv.account_id === acc.id && Number(mv.amount) < 0 && !mv.is_initial && isSameMonth(mv.date, m))
      .reduce((s, mv) => s + Math.abs(Number(mv.amount)), 0);
  });

  const ctx = document.getElementById("chart-trend");
  if (state.charts.trend) state.charts.trend.destroy();
  state.charts.trend = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months.map(m => capitalize(m.toLocaleDateString("fr-FR", { month: "short" }))),
      datasets: [{ data: totals, backgroundColor: "#a4502b", borderRadius: 4, maxBarThickness: 34 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatEUR(c.raw) } } },
      scales: { y: { ticks: { callback: (v) => formatEUR(v) } } },
    },
  });
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------------------------------------------------------- */
/*  Journal                                                       */
/* ---------------------------------------------------------- */

function populateJournalFilter() {
  const sel = document.getElementById("journal-filter-account");
  const current = sel.value;
  sel.innerHTML = `<option value="">Tous les comptes</option>` +
    state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  sel.value = current;
}

document.getElementById("journal-filter-account").addEventListener("change", renderJournal);

function renderJournal() {
  populateJournalFilter();
  const filterId = document.getElementById("journal-filter-account").value;
  let list = [...state.movements].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  if (filterId) list = list.filter(m => m.account_id === filterId);

  const el = document.getElementById("journal-list");
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📜</div>Aucun mouvement à afficher.</div>`;
    return;
  }

  el.innerHTML = list.map(m => {
    const acc = accountById(m.account_id);
    const positive = Number(m.amount) >= 0;
    return `
      <div class="journal-row">
        <span class="j-date">${formatDateShort(m.date)}</span>
        <span class="j-dot" style="background:${acc ? acc.color : '#999'}"></span>
        <div class="j-mid">
          <div class="j-account">${acc ? acc.name : "?"}${m.category ? " · " + m.category : ""}</div>
          <div class="j-note">${m.note ? escapeHTML(m.note) : ""}</div>
        </div>
        <span class="j-amount amount ${positive ? "positive" : "negative"}">${positive ? "+" : ""}${formatEUR(m.amount)}</span>
        <div class="j-actions">
          <button data-edit="${m.id}" title="Modifier">✎</button>
          <button data-del="${m.id}" title="Supprimer">🗑</button>
        </div>
      </div>
    `;
  }).join("");

  el.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openMovementModal({ movementId: btn.dataset.edit }));
  });
  el.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => deleteMovement(btn.dataset.del));
  });
}

/* ---------------------------------------------------------- */
/*  Modal mouvement (ajout / édition)                             */
/* ---------------------------------------------------------- */

const mvModal = document.getElementById("movement-modal");
const mvForm = document.getElementById("movement-form");
let mvType = "in";

document.getElementById("mv-modal-close").addEventListener("click", closeMovementModal);
mvModal.addEventListener("click", (e) => { if (e.target === mvModal) closeMovementModal(); });

document.querySelectorAll("[data-mv-type]").forEach(btn => {
  btn.addEventListener("click", () => {
    mvType = btn.dataset.mvType;
    document.querySelectorAll("[data-mv-type]").forEach(b => b.classList.toggle("active", b === btn));
    updateCategoryVisibility();
  });
});

document.getElementById("mv-account").addEventListener("change", updateCategoryVisibility);

function updateCategoryVisibility() {
  const accId = document.getElementById("mv-account").value;
  const acc = accountById(accId);
  const show = acc && acc.type === "courant" && mvType === "out";
  document.getElementById("mv-category-field").style.display = show ? "block" : "none";
}

function openMovementModal({ accountId, movementId } = {}) {
  mvForm.reset();
  document.getElementById("mv-error").style.display = "none";
  document.getElementById("mv-id").value = "";
  document.getElementById("mv-delete").style.display = "none";

  const accSel = document.getElementById("mv-account");
  accSel.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");

  if (movementId) {
    const m = state.movements.find(mv => mv.id === movementId);
    if (!m) return;
    state.editingMovementId = movementId;
    document.getElementById("mv-modal-title").textContent = "Modifier le mouvement";
    document.getElementById("mv-id").value = m.id;
    accSel.value = m.account_id;
    document.getElementById("mv-amount").value = Math.abs(Number(m.amount));
    document.getElementById("mv-date").value = m.date;
    document.getElementById("mv-note").value = m.note || "";
    if (m.category) document.getElementById("mv-category").value = m.category;
    mvType = Number(m.amount) >= 0 ? "in" : "out";
    document.getElementById("mv-delete").style.display = "inline-block";
  } else {
    state.editingMovementId = null;
    document.getElementById("mv-modal-title").textContent = "Ajouter un mouvement";
    document.getElementById("mv-date").value = todayISO();
    if (accountId) accSel.value = accountId;
    mvType = "in";
  }

  document.querySelectorAll("[data-mv-type]").forEach(b => b.classList.toggle("active", b.dataset.mvType === mvType));
  updateCategoryVisibility();
  mvModal.classList.add("open");
}

function closeMovementModal() {
  mvModal.classList.remove("open");
}

document.getElementById("mv-delete").addEventListener("click", async () => {
  const id = document.getElementById("mv-id").value;
  if (!id) return;
  await deleteMovement(id);
  closeMovementModal();
});

async function deleteMovement(id) {
  if (!confirm("Supprimer ce mouvement ?")) return;
  const { error } = await supabase.from("movements").delete().eq("id", id);
  if (error) { showToast("Erreur lors de la suppression.", true); return; }
  state.movements = state.movements.filter(m => m.id !== id);
  showToast("Mouvement supprimé.");
  renderAll();
}

mvForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("mv-error");
  errEl.style.display = "none";

  const accountId = document.getElementById("mv-account").value;
  const acc = accountById(accountId);
  const rawAmount = parseFloat(document.getElementById("mv-amount").value);
  if (isNaN(rawAmount) || rawAmount <= 0) {
    errEl.textContent = "Merci d'indiquer un montant valide.";
    errEl.style.display = "block";
    return;
  }
  const amount = mvType === "out" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const date = document.getElementById("mv-date").value;
  const note = document.getElementById("mv-note").value.trim();
  const category = (acc && acc.type === "courant" && mvType === "out")
    ? document.getElementById("mv-category").value : null;

  const submitBtn = document.getElementById("mv-submit");
  submitBtn.disabled = true;

  try {
    const editId = document.getElementById("mv-id").value;
    if (editId) {
      const { data, error } = await supabase.from("movements")
        .update({ account_id: accountId, amount, date, note: note || null, category })
        .eq("id", editId).select().single();
      if (error) throw error;
      state.movements = state.movements.map(m => m.id === editId ? data : m);
      showToast("Mouvement modifié.");
    } else {
      const { data, error } = await supabase.from("movements")
        .insert({
          user_id: state.session.user.id,
          account_id: accountId, amount, date, note: note || null, category,
        }).select().single();
      if (error) throw error;
      state.movements.push(data);
      showToast("Mouvement ajouté.");
    }
    closeMovementModal();
    renderAll();
  } catch (err) {
    errEl.textContent = "Erreur : " + err.message;
    errEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------- */
/*  Init                                                          */
/* ---------------------------------------------------------- */

(async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  if (session) {
    boot();
  } else {
    document.getElementById("loading").style.display = "none";
    document.getElementById("auth-screen").style.display = "flex";
  }
})();
