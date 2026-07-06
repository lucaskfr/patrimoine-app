// ============================================================
// Patrimoine — application
// Vanilla JS, Supabase (DB + Auth), Chart.js
// ============================================================

/* ---------------------------------------------------------- */
/*  Setup                                                       */
/* ---------------------------------------------------------- */

const sb = window.supabase.createClient(
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
  recurringExpenses: [],
  currentView: "dashboard",
  expenseCursor: startOfMonth(new Date()),
  heatmapYear: new Date().getFullYear(),
  charts: {},
  editingMovementId: null,
  editingRecurringId: null,
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
  const acc = accountById(accountId);
  // Comptes crypto : si une quantité détenue et un cours en cache sont renseignés,
  // la valorisation prime sur la somme des mouvements (qui restent visibles en historique).
  if (acc && acc.type === "crypto" && acc.crypto_quantity != null && acc.crypto_price_eur != null) {
    return Number(acc.crypto_quantity) * Number(acc.crypto_price_eur);
  }
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
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
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
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((event, session) => {
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

  const [{ data: accounts, error: accErr }, { data: movements, error: movErr }, { data: recurring, error: recErr }] = await Promise.all([
    sb.from("accounts").select("*").order("sort_order"),
    sb.from("movements").select("*").order("date", { ascending: false }),
    sb.from("recurring_expenses").select("*").order("created_at"),
  ]);

  if (accErr || movErr) {
    showToast("Erreur de chargement des données.", true);
    console.error(accErr, movErr);
    document.getElementById("loading").style.display = "none";
    return;
  }
  if (recErr) console.warn("Abonnements récurrents indisponibles :", recErr.message);

  state.accounts = accounts || [];
  state.movements = movements || [];
  state.recurringExpenses = recurring || [];

  document.getElementById("loading").style.display = "none";

  if (state.accounts.length === 0) {
    showOnboarding();
  } else {
    document.getElementById("onboarding-screen").style.display = "none";
    document.getElementById("app").classList.add("visible");
    await generateDueRecurringExpenses();
    renderAll();
    autoRefreshStalePrices();
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
        <input type="number" step="0.01" class="ob-balance-input" data-index="${i}" placeholder="0.00">
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

  document.getElementById("ob-submit").onclick = async () => {
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
      const { data: inserted, error: insErr } = await sb.from("accounts").insert(accountsToInsert).select();
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
      const { error: movErr } = await sb.from("movements").insert(movementsToInsert);
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
  renderStreakAndBadges();
}

/* ---------------------------------------------------------- */
/*  Streak d'épargne & jalons                                    */
/* ---------------------------------------------------------- */

function nonCourantBalanceAsOf(dateStr) {
  return state.accounts
    .filter(a => a.type !== "courant")
    .reduce((sum, a) => {
      const bal = state.movements
        .filter(m => m.account_id === a.id && m.date <= dateStr)
        .reduce((s, m) => s + Number(m.amount), 0);
      return sum + bal;
    }, 0);
}

function computeMonthlySeries() {
  const allDates = state.movements.map(m => m.date);
  if (allDates.length === 0) return [];
  const minDate = allDates.reduce((a, b) => (a < b ? a : b));
  const start = startOfMonth(new Date(minDate + "T00:00:00"));
  const end = startOfMonth(new Date());
  const months = [];
  let cur = start;
  while (cur <= end) {
    months.push(new Date(cur));
    cur = addMonths(cur, 1);
  }
  return months.map(m => {
    const lastDayOfMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).toISOString().slice(0, 10);
    const cappedDate = lastDayOfMonth > todayISO() ? todayISO() : lastDayOfMonth;
    return { month: m, total: nonCourantBalanceAsOf(cappedDate) };
  });
}

const BADGE_DEFS = [
  { id: "first-positive", icon: "🌱", title: "Premier mois positif", check: (ctx) => ctx.everPositiveMonth },
  { id: "three-streak", icon: "🔥", title: "3 mois d'affilée", check: (ctx) => ctx.maxStreak >= 3 },
  { id: "doubled", icon: "🚀", title: "Patrimoine doublé", check: (ctx) => ctx.doubled },
  { id: "livret-a-cap", icon: "🏆", title: "Plafond Livret A atteint", check: (ctx) => ctx.livretACapped },
];

function computeStreakContext() {
  const series = computeMonthlySeries();
  let streak = 0;
  for (let i = series.length - 1; i >= 1; i--) {
    if (series[i].total > series[i - 1].total) streak++;
    else break;
  }
  let maxStreak = 0, running = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i].total > series[i - 1].total) { running++; maxStreak = Math.max(maxStreak, running); }
    else running = 0;
  }
  const everPositiveMonth = series.some((s, i) => i > 0 && s.total > series[i - 1].total);

  const allDates = state.movements.map(m => m.date).sort();
  let doubled = false;
  if (allDates.length > 0) {
    const firstDate = allDates[0];
    const firstTotal = state.accounts.reduce((sum, a) => {
      const bal = state.movements
        .filter(m => m.account_id === a.id && m.date <= firstDate)
        .reduce((s, m) => s + Number(m.amount), 0);
      return sum + bal;
    }, 0);
    if (firstTotal > 0) doubled = totalPatrimoine() >= firstTotal * 2;
  }

  const livretA = state.accounts.find(a => a.name === "Livret A");
  const livretACapped = livretA ? accountBalance(livretA.id) >= REGULATED_CAPS["Livret A"] : false;

  return { streak, maxStreak, everPositiveMonth, doubled, livretACapped };
}

function renderStreakAndBadges() {
  const ctx = computeStreakContext();
  document.getElementById("streak-value").textContent = `${ctx.streak} mois`;

  const grid = document.getElementById("badges-grid");
  grid.innerHTML = BADGE_DEFS.map(b => {
    const unlocked = b.check(ctx);
    return `
      <div class="badge ${unlocked ? "unlocked" : "locked"}">
        <span class="badge-icon">${b.icon}</span>
        <span class="badge-title">${b.title}</span>
      </div>
    `;
  }).join("");
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

const CRYPTO_COINS = [
  { id: "bitcoin", label: "Bitcoin (BTC)" },
  { id: "ethereum", label: "Ethereum (ETH)" },
  { id: "solana", label: "Solana (SOL)" },
  { id: "cardano", label: "Cardano (ADA)" },
  { id: "ripple", label: "XRP" },
  { id: "litecoin", label: "Litecoin (LTC)" },
  { id: "dogecoin", label: "Dogecoin (DOGE)" },
  { id: "polkadot", label: "Polkadot (DOT)" },
];

function relativeTimeFromNow(iso) {
  if (!iso) return "jamais mis à jour";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

function cryptoBoxHTML(a) {
  const coin = a.crypto_coin_id || "bitcoin";
  const qty = a.crypto_quantity != null ? a.crypto_quantity : "";
  return `
    <div class="crypto-box">
      <div class="crypto-row">
        <select class="crypto-coin-select" data-account="${a.id}">
          ${CRYPTO_COINS.map(c => `<option value="${c.id}" ${c.id === coin ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
        <input type="number" step="0.00000001" min="0" class="crypto-qty-input" data-account="${a.id}" placeholder="Quantité détenue" value="${qty}">
        <button class="btn btn-outline btn-sm" data-action="crypto-save" data-account="${a.id}">Enregistrer</button>
      </div>
      <div class="crypto-meta">
        ${a.crypto_price_eur != null
          ? `Cours : <span class="amount">${formatEUR(a.crypto_price_eur)}</span> · maj ${relativeTimeFromNow(a.crypto_price_updated_at)}`
          : `Cours non récupéré`}
        <button class="btn-text btn-sm" data-action="crypto-refresh" data-account="${a.id}">↻ Rafraîchir le cours</button>
      </div>
    </div>
  `;
}

async function saveCryptoSettings(accountId) {
  const coinSel = document.querySelector(`.crypto-coin-select[data-account="${accountId}"]`);
  const qtyInput = document.querySelector(`.crypto-qty-input[data-account="${accountId}"]`);
  const coin = coinSel.value;
  const qty = qtyInput.value === "" ? null : parseFloat(qtyInput.value);
  if (qty != null && (isNaN(qty) || qty < 0)) {
    showToast("Quantité invalide.", true);
    return;
  }
  const { data, error } = await sb.from("accounts")
    .update({ crypto_coin_id: coin, crypto_quantity: qty })
    .eq("id", accountId).select().single();
  if (error) { showToast("Erreur lors de l'enregistrement.", true); return; }
  state.accounts = state.accounts.map(x => x.id === accountId ? data : x);
  showToast("Paramètres crypto enregistrés.");
  if (qty != null) await refreshCryptoPrice(accountId, { silent: true });
  renderAll();
}

async function refreshCryptoPrice(accountId, opts = {}) {
  const acc = accountById(accountId);
  if (!acc || !acc.crypto_coin_id) { showToast("Choisissez d'abord une crypto-monnaie.", true); return; }
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(acc.crypto_coin_id)}&vs_currencies=eur`);
    if (!res.ok) throw new Error("Requête CoinGecko échouée");
    const data = await res.json();
    const price = data?.[acc.crypto_coin_id]?.eur;
    if (price == null) throw new Error("Cours introuvable pour cette crypto-monnaie.");
    const { data: updated, error } = await sb.from("accounts")
      .update({ crypto_price_eur: price, crypto_price_updated_at: new Date().toISOString() })
      .eq("id", accountId).select().single();
    if (error) throw error;
    state.accounts = state.accounts.map(x => x.id === accountId ? updated : x);
    if (!opts.silent) showToast("Cours mis à jour.");
    renderAll();
  } catch (err) {
    if (!opts.silent) showToast("Impossible de récupérer le cours (réessayez plus tard).", true);
    console.error(err);
  }
}

function autoRefreshStalePrices() {
  const staleMs = 10 * 60 * 1000;
  state.accounts
    .filter(a => a.type === "crypto" && a.crypto_quantity != null && a.crypto_coin_id)
    .forEach(a => {
      const last = a.crypto_price_updated_at ? new Date(a.crypto_price_updated_at).getTime() : 0;
      if (Date.now() - last > staleMs) refreshCryptoPrice(a.id, { silent: true });
    });
}

/* ---------------------------------------------------------- */
/*  Plafonds réglementés                                          */
/* ---------------------------------------------------------- */

const REGULATED_CAPS = {
  "Livret A": 22950,
  "LDD": 12000,
  "PEA": 150000,
};

function capGaugeHTML(a, balance) {
  const cap = REGULATED_CAPS[a.name];
  if (!cap) return "";
  const pct = Math.max(0, Math.min(100, (balance / cap) * 100));
  const remaining = cap - balance;
  const isNearCap = pct >= 90;
  const isOverCap = balance > cap;
  const barColor = isOverCap ? "var(--rust)" : isNearCap ? "var(--gold)" : "var(--sage)";
  return `
    <div class="cap-gauge">
      <div class="cap-gauge-bar-wrap">
        <div class="cap-gauge-bar" style="width:${pct}%; background:${barColor};"></div>
      </div>
      <div class="cap-gauge-labels">
        <span>${formatEUR(balance)} / ${formatEUR(cap)}</span>
        <span class="${isOverCap ? "cap-alert" : isNearCap ? "cap-warning" : ""}">
          ${isOverCap ? "Plafond dépassé" : `${formatEUR(Math.max(0, remaining))} restants`}
        </span>
      </div>
    </div>
  `;
}

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
        ${capGaugeHTML(a, balance)}
        ${a.type === "crypto" ? cryptoBoxHTML(a) : ""}
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
  el.querySelectorAll('[data-action="crypto-save"]').forEach(btn => {
    btn.addEventListener("click", () => saveCryptoSettings(btn.dataset.account));
  });
  el.querySelectorAll('[data-action="crypto-refresh"]').forEach(btn => {
    btn.addEventListener("click", () => refreshCryptoPrice(btn.dataset.account));
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
  renderRecurring();
  renderHeatmap(acc);

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
/*  Abonnements / dépenses récurrentes mensuelles                */
/* ---------------------------------------------------------- */

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Génère automatiquement, une fois par mois, le mouvement de dépense
// correspondant à chaque abonnement actif dont le jour est déjà passé
// et qui n'a pas encore de mouvement ce mois-ci. Évite ainsi de ressaisir
// à la main les dépenses récurrentes identiques (loyer, abonnements...).
async function generateDueRecurringExpenses() {
  if (!state.recurringExpenses.length) return;
  const today = new Date();
  const todayDay = today.getDate();
  const currentMonthStart = startOfMonth(today).toISOString().slice(0, 10);

  const toInsert = [];
  for (const re of state.recurringExpenses) {
    if (!re.active) continue;
    if (!accountById(re.account_id)) continue;
    const day = Math.min(re.day_of_month, daysInMonth(today.getFullYear(), today.getMonth()));
    if (todayDay < day) continue;
    const alreadyGenerated = state.movements.some(m => m.recurring_id === re.id && m.date >= currentMonthStart);
    if (alreadyGenerated) continue;
    const dateStr = new Date(today.getFullYear(), today.getMonth(), day).toISOString().slice(0, 10);
    toInsert.push({
      user_id: state.session.user.id,
      account_id: re.account_id,
      date: dateStr,
      amount: -Math.abs(Number(re.amount)),
      category: re.category || "Abonnements",
      note: re.label,
      recurring_id: re.id,
    });
  }
  if (toInsert.length === 0) return;

  const { data, error } = await sb.from("movements").insert(toInsert).select();
  if (error) { console.error("Erreur génération abonnements :", error); return; }
  state.movements.push(...(data || []));
  showToast(`${data.length} abonnement${data.length > 1 ? "s" : ""} ajouté${data.length > 1 ? "s" : ""} automatiquement ce mois-ci.`);
}

function renderRecurring() {
  const el = document.getElementById("recurring-list");
  if (!el) return;
  const list = [...state.recurringExpenses].sort((a, b) => a.day_of_month - b.day_of_month);
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="icon">🔁</div>Aucun abonnement enregistré. Ajoutez vos dépenses fixes (loyer, streaming, salle de sport…) pour ne plus avoir à les ressaisir chaque mois.</div>`;
    return;
  }
  el.innerHTML = list.map(re => `
    <div class="recurring-item ${re.active ? "" : "paused"}">
      <div class="rc-mid">
        <div class="rc-label">${escapeHTML(re.label)}${re.active ? "" : `<span class="rc-badge-paused">En pause</span>`}</div>
        <div class="rc-meta">Le ${re.day_of_month} de chaque mois${re.category ? " · " + re.category : ""}</div>
      </div>
      <span class="rc-amount amount">- ${formatEUR(re.amount)}</span>
      <div class="rc-actions">
        <button data-rc-edit="${re.id}" title="Modifier">✎</button>
      </div>
    </div>
  `).join("");
  el.querySelectorAll("[data-rc-edit]").forEach(btn => {
    btn.addEventListener("click", () => openRecurringModal(btn.dataset.rcEdit));
  });
}

const rcModal = document.getElementById("recurring-modal");
const rcForm = document.getElementById("recurring-form");

document.getElementById("add-recurring-btn").addEventListener("click", () => openRecurringModal());
document.getElementById("rc-modal-close").addEventListener("click", closeRecurringModal);
rcModal.addEventListener("click", (e) => { if (e.target === rcModal) closeRecurringModal(); });

function openRecurringModal(recurringId) {
  rcForm.reset();
  document.getElementById("rc-error").style.display = "none";
  document.getElementById("rc-id").value = "";
  document.getElementById("rc-delete").style.display = "none";
  document.getElementById("rc-active").checked = true;

  if (recurringId) {
    const re = state.recurringExpenses.find(r => r.id === recurringId);
    if (!re) return;
    state.editingRecurringId = recurringId;
    document.getElementById("rc-modal-title").textContent = "Modifier l'abonnement";
    document.getElementById("rc-id").value = re.id;
    document.getElementById("rc-label").value = re.label;
    document.getElementById("rc-amount").value = re.amount;
    document.getElementById("rc-day").value = re.day_of_month;
    if (re.category) document.getElementById("rc-category").value = re.category;
    document.getElementById("rc-active").checked = re.active;
    document.getElementById("rc-delete").style.display = "inline-block";
  } else {
    state.editingRecurringId = null;
    document.getElementById("rc-modal-title").textContent = "Ajouter un abonnement";
  }

  rcModal.classList.add("open");
}

function closeRecurringModal() {
  rcModal.classList.remove("open");
}

document.getElementById("rc-delete").addEventListener("click", async () => {
  const id = document.getElementById("rc-id").value;
  if (!id) return;
  const confirmed = await confirmDialog("Supprimer cet abonnement ? Les mouvements déjà générés resteront dans le journal.");
  if (!confirmed) return;
  const { error } = await sb.from("recurring_expenses").delete().eq("id", id);
  if (error) { showToast("Erreur lors de la suppression.", true); return; }
  state.recurringExpenses = state.recurringExpenses.filter(r => r.id !== id);
  showToast("Abonnement supprimé.");
  closeRecurringModal();
  renderAll();
});

rcForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("rc-error");
  errEl.style.display = "none";

  const acc = courantAccount();
  if (!acc) {
    errEl.textContent = "Aucun compte courant trouvé.";
    errEl.style.display = "block";
    return;
  }

  const label = document.getElementById("rc-label").value.trim();
  const amount = parseFloat(document.getElementById("rc-amount").value);
  const day = parseInt(document.getElementById("rc-day").value, 10);
  const category = document.getElementById("rc-category").value;
  const active = document.getElementById("rc-active").checked;

  if (!label || isNaN(amount) || amount <= 0) {
    errEl.textContent = "Merci de renseigner un nom et un montant valides.";
    errEl.style.display = "block";
    return;
  }
  if (isNaN(day) || day < 1 || day > 28) {
    errEl.textContent = "Le jour du mois doit être compris entre 1 et 28.";
    errEl.style.display = "block";
    return;
  }

  const submitBtn = document.getElementById("rc-submit");
  submitBtn.disabled = true;

  try {
    const editId = document.getElementById("rc-id").value;
    if (editId) {
      const { data, error } = await sb.from("recurring_expenses")
        .update({ label, amount, day_of_month: day, category, active })
        .eq("id", editId).select().single();
      if (error) throw error;
      state.recurringExpenses = state.recurringExpenses.map(r => r.id === editId ? data : r);
      showToast("Abonnement modifié.");
    } else {
      const { data, error } = await sb.from("recurring_expenses")
        .insert({
          user_id: state.session.user.id,
          account_id: acc.id,
          label, amount, day_of_month: day, category, active,
        }).select().single();
      if (error) throw error;
      state.recurringExpenses.push(data);
      showToast("Abonnement ajouté.");
    }
    closeRecurringModal();
    await generateDueRecurringExpenses();
    renderAll();
  } catch (err) {
    errEl.textContent = "Erreur : " + err.message;
    errEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------- */
/*  Heatmap annuelle des dépenses                                */
/* ---------------------------------------------------------- */

document.getElementById("heatmap-prev-year").addEventListener("click", () => {
  state.heatmapYear -= 1;
  renderExpenses();
});
document.getElementById("heatmap-next-year").addEventListener("click", () => {
  state.heatmapYear += 1;
  renderExpenses();
});

function renderHeatmap(acc) {
  document.getElementById("heatmap-year-label").textContent = state.heatmapYear;

  const dailyTotals = {};
  state.movements
    .filter(m => m.account_id === acc.id && Number(m.amount) < 0 && !m.is_initial && m.date.startsWith(String(state.heatmapYear)))
    .forEach(m => {
      dailyTotals[m.date] = (dailyTotals[m.date] || 0) + Math.abs(Number(m.amount));
    });

  const values = Object.values(dailyTotals).filter(v => v > 0).sort((a, b) => a - b);
  const q = (p) => values.length ? values[Math.min(values.length - 1, Math.floor(p * values.length))] : 0;
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);

  function bucket(v) {
    if (!v) return 0;
    if (v <= t1) return 1;
    if (v <= t2) return 2;
    if (v <= t3) return 3;
    return 4;
  }

  const start = new Date(state.heatmapYear, 0, 1);
  const end = new Date(state.heatmapYear, 11, 31);
  // On démarre la grille un dimanche pour aligner les colonnes par semaine
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const cells = [];
  for (let d = new Date(gridStart); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const inYear = d.getFullYear() === state.heatmapYear;
    const val = dailyTotals[dateStr] || 0;
    cells.push({ dateStr, val, inYear, level: inYear ? bucket(val) : -1 });
  }

  const wrap = document.getElementById("heatmap-wrap");
  wrap.innerHTML = `<div class="heatmap-grid">` +
    cells.map(c => c.inYear
      ? `<div class="heat-day heat-${c.level}" title="${formatDateLong(c.dateStr)} : ${formatEUR(c.val)}"></div>`
      : `<div class="heat-day" style="visibility:hidden;"></div>`
    ).join("") +
    `</div>`;
}

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

function confirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-modal");
    document.getElementById("confirm-message").textContent = message;
    overlay.classList.add("open");
    const cleanup = (result) => {
      overlay.classList.remove("open");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");
    const closeBtn = document.getElementById("confirm-close");
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
  });
}

async function deleteMovement(id) {
  const confirmed = await confirmDialog("Supprimer ce mouvement ? Cette action est définitive.");
  if (!confirmed) return;
  const { error } = await sb.from("movements").delete().eq("id", id);
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
      const { data, error } = await sb.from("movements")
        .update({ account_id: accountId, amount, date, note: note || null, category })
        .eq("id", editId).select().single();
      if (error) throw error;
      state.movements = state.movements.map(m => m.id === editId ? data : m);
      showToast("Mouvement modifié.");
    } else {
      const { data, error } = await sb.from("movements")
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
/*  Coach IA (Supabase Edge Function) + Rapport PDF               */
/* ---------------------------------------------------------- */

function buildFinancialSummary() {
  const total = totalPatrimoine();
  const startMonth = startOfMonth(new Date()).toISOString().slice(0, 10);
  const totalStartOfMonth = state.accounts.reduce((sum, a) => {
    const balanceBefore = state.movements
      .filter(m => m.account_id === a.id && m.date < startMonth)
      .reduce((s, m) => s + Number(m.amount), 0);
    return sum + balanceBefore;
  }, 0);

  const repartition = state.accounts.map(a => ({
    name: a.name, type: a.type, balance: Math.round(accountBalance(a.id) * 100) / 100,
  }));

  const acc = courantAccount();
  const monthExpensesByCategory = {};
  if (acc) {
    state.movements
      .filter(m => m.account_id === acc.id && Number(m.amount) < 0 && !m.is_initial && isSameMonth(m.date, new Date()))
      .forEach(m => {
        const cat = m.category || "Autre";
        monthExpensesByCategory[cat] = Math.round(((monthExpensesByCategory[cat] || 0) + Math.abs(Number(m.amount))) * 100) / 100;
      });
  }

  const ctx = computeStreakContext();

  const capsStatus = Object.entries(REGULATED_CAPS).map(([name, cap]) => {
    const a = state.accounts.find(x => x.name === name);
    if (!a) return null;
    const bal = accountBalance(a.id);
    return { name, balance: Math.round(bal * 100) / 100, cap, pctUsed: Math.round((bal / cap) * 1000) / 10 };
  }).filter(Boolean);

  return {
    totalPatrimoine: Math.round(total * 100) / 100,
    deltaVsStartOfMonth: Math.round((total - totalStartOfMonth) * 100) / 100,
    repartition,
    monthExpensesByCategory,
    streakMonths: ctx.streak,
    capsStatus,
  };
}

function localFallbackSummary(summary) {
  const deltaTxt = summary.deltaVsStartOfMonth >= 0
    ? `en hausse de ${formatEUR(summary.deltaVsStartOfMonth)}`
    : `en baisse de ${formatEUR(Math.abs(summary.deltaVsStartOfMonth))}`;
  const topCat = Object.entries(summary.monthExpensesByCategory).sort((a, b) => b[1] - a[1])[0];
  const expensesTxt = topCat
    ? `Vos dépenses du mois sont principalement concentrées sur la catégorie ${topCat[0]} (${formatEUR(topCat[1])}).`
    : "Aucune dépense enregistrée ce mois-ci sur le compte courant.";
  const nearCap = summary.capsStatus.find(c => c.pctUsed >= 90);
  const capTxt = nearCap ? ` Attention, votre ${nearCap.name} est à ${nearCap.pctUsed}% de son plafond.` : "";
  return `Votre patrimoine total s'élève à ${formatEUR(summary.totalPatrimoine)}, ${deltaTxt} depuis le début du mois. ${expensesTxt}${capTxt} Votre streak d'épargne est actuellement de ${summary.streakMonths} mois consécutifs.`;
}

async function callCoach(summary) {
  const url = `${window.SUPABASE_CONFIG.url}/functions/v1/coach`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": window.SUPABASE_CONFIG.anonKey,
      "Authorization": `Bearer ${state.session?.access_token || window.SUPABASE_CONFIG.anonKey}`,
    },
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) throw new Error(`Coach indisponible (HTTP ${res.status})`);
  const data = await res.json();
  if (!data.analysis) throw new Error("Réponse du coach invalide");
  return data.analysis;
}

async function getCoachAnalysisOrFallback() {
  const summary = buildFinancialSummary();
  try {
    const analysis = await callCoach(summary);
    return { text: analysis, source: "ia" };
  } catch (err) {
    console.warn("Coach IA indisponible, utilisation du résumé local :", err.message);
    return { text: localFallbackSummary(summary), source: "local" };
  }
}

document.getElementById("coach-analyze-btn").addEventListener("click", async () => {
  const card = document.getElementById("coach-result-card");
  const content = document.getElementById("coach-result-content");
  card.style.display = "block";
  content.innerHTML = `<span class="coach-loading">Analyse en cours…</span>`;
  const { text, source } = await getCoachAnalysisOrFallback();
  content.textContent = text;
  if (source === "local") {
    content.innerHTML += `<div class="hint" style="margin-top:10px;">Analyse locale (le coach IA n'est pas encore configuré ou est temporairement indisponible).</div>`;
  }
});

document.getElementById("generate-report-btn").addEventListener("click", async () => {
  const btn = document.getElementById("generate-report-btn");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Génération en cours…";
  try {
    await generateMonthlyReportPDF();
    showToast("Rapport PDF généré.");
  } catch (err) {
    console.error(err);
    showToast("Erreur lors de la génération du rapport.", true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

async function generateMonthlyReportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 0;

  const NAVY = [10, 37, 64];
  const GOLD = [176, 141, 46];
  const SAGE = [92, 122, 92];
  const RUST = [164, 80, 43];
  const INK = [28, 43, 58];

  const summary = buildFinancialSummary();
  const { text: aiText } = await getCoachAnalysisOrFallback();

  // En-tête
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(...GOLD);
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.text("Patrimoine — Rapport mensuel", margin, 16);
  doc.setTextColor(245, 240, 225);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(capitalize(monthLabel(new Date())) + " · généré le " + new Date().toLocaleDateString("fr-FR"), margin, 24);

  y = 44;
  doc.setTextColor(...INK);

  // Patrimoine total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Patrimoine total", margin, y);
  y += 8;
  doc.setFont("courier", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(formatEUR(summary.totalPatrimoine), margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(summary.deltaVsStartOfMonth >= 0 ? SAGE[0] : RUST[0], summary.deltaVsStartOfMonth >= 0 ? SAGE[1] : RUST[1], summary.deltaVsStartOfMonth >= 0 ? SAGE[2] : RUST[2]);
  doc.text(
    `${summary.deltaVsStartOfMonth >= 0 ? "+" : ""}${formatEUR(summary.deltaVsStartOfMonth)} depuis le début du mois`,
    margin + 70, y
  );
  y += 12;

  // Répartition par compte
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Répartition par compte", margin, y);
  y += 7;
  doc.setFontSize(10);
  summary.repartition.forEach(r => {
    doc.setFont("helvetica", "normal");
    doc.text(r.name, margin, y);
    doc.setFont("courier", "normal");
    doc.text(formatEUR(r.balance), pageWidth - margin, y, { align: "right" });
    y += 6;
  });
  y += 6;

  // Dépenses par catégorie
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Dépenses du mois par catégorie", margin, y);
  y += 7;
  doc.setFontSize(10);
  const catEntries = Object.entries(summary.monthExpensesByCategory);
  if (catEntries.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("Aucune dépense enregistrée ce mois-ci.", margin, y);
    y += 6;
  } else {
    catEntries.sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
      doc.setFont("helvetica", "normal");
      doc.text(cat, margin, y);
      doc.setFont("courier", "normal");
      doc.text(formatEUR(val), pageWidth - margin, y, { align: "right" });
      y += 6;
    });
  }
  y += 6;

  // Streak
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Streak d'épargne", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${summary.streakMonths} mois consécutifs d'épargne en hausse (hors compte courant).`, margin, y);
  y += 12;

  // Analyse du coach
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Analyse du coach", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(aiText, pageWidth - margin * 2);
  doc.text(lines, margin, y);

  doc.save(`rapport-patrimoine-${todayISO()}.pdf`);
}

/* ---------------------------------------------------------- */
/*  Init                                                          */
/* ---------------------------------------------------------- */

(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  if (session) {
    boot();
  } else {
    document.getElementById("loading").style.display = "none";
    document.getElementById("auth-screen").style.display = "flex";
  }
})();
