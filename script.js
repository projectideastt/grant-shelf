const DATA_URL = "./grants.json";

const exchangeRates = {
  USD: 6.8,
  EUR: 9.0,
  GBP: 8.0,
  CAD: 5.0
};

let grants = [];
let activeFilter = "all";

const els = {
  searchInput: document.getElementById("searchInput"),
  reloadBtn: document.getElementById("reloadBtn"),
  filterRow: document.getElementById("filterRow"),
  sortSelect: document.getElementById("sortSelect"),
  grantContainer: document.getElementById("grantContainer"),
  statusDot: document.getElementById("statusDot"),
  statusTitle: document.getElementById("statusTitle"),
  statusMessage: document.getElementById("statusMessage"),
  statusDetails: document.getElementById("statusDetails"),
  totalCount: document.getElementById("totalCount"),
  visibleCount: document.getElementById("visibleCount"),
  liveCount: document.getElementById("liveCount"),
  demoCount: document.getElementById("demoCount")
};

function setStatus(type, title, message, details = "") {
  els.statusDot.className = `status-dot ${type}`;
  els.statusTitle.textContent = title;
  els.statusMessage.textContent = message;
  els.statusDetails.textContent = details || "No technical details available.";
}

async function loadData() {
  setStatus(
    "warning",
    "Loading grant data...",
    "Checking grants.json from this repository.",
    `Fetching ${DATA_URL}`
  );

  try {
    const res = await fetch(`${DATA_URL}?cacheBust=${Date.now()}`);

    if (!res.ok) {
      throw new Error(`Could not load grants.json. HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error("grants.json loaded, but it is not an array of records.");
    }

    grants = data.map(normalizeGrant);

    const live = grants.filter(isLiveRecord).length;
    const demo = grants.filter(isDemoRecord).length;

    if (live > 0) {
      setStatus(
        "success",
        "Grant data loaded",
        `${grants.length} records loaded. ${live} appear to be live-source records.`,
        JSON.stringify(
          {
            mode: "Repository grants.json",
            recordsLoaded: grants.length,
            liveSourceRecords: live,
            demoRecords: demo,
            note: "Open official sources before acting on any opportunity."
          },
          null,
          2
        )
      );
    } else {
      setStatus(
        "warning",
        "Demo data loaded from grants.json",
        `${grants.length} demo records loaded. Run the GitHub Action collector to replace this with live records.`,
        JSON.stringify(
          {
            mode: "Repository grants.json",
            recordsLoaded: grants.length,
            note: "Demo records detected."
          },
          null,
          2
        )
      );
    }

    updateStats();
    render();
  } catch (err) {
    console.error(err);

    grants = fallbackGrants().map(normalizeGrant);

    setStatus(
      "error",
      "Could not load grants.json",
      "The page is showing emergency fallback records. Check that grants.json exists in the repository root.",
      err.message
    );

    updateStats();
    render();
  }
}

function normalizeGrant(grant) {
  const title = grant.title || "Untitled opportunity";
  const organization = grant.organization || grant.funder || "Unknown funder";
  const status = grant.status || "Needs Review";
  const badges = Array.isArray(grant.badges) ? grant.badges : [status];

  return {
    title,
    organization,
    category: (grant.category || inferCategory(`${title} ${organization}`)).toLowerCase(),
    match: clampNumber(grant.match, 50, 95, 62),
    deadline: grant.deadline || "Check source",
    currency: grant.currency || "USD",
    minFunding: numberOrZero(grant.minFunding),
    maxFunding: numberOrZero(grant.maxFunding),
    risk: grant.risk || "Medium",
    effort: grant.effort || "Medium",
    readiness: clampNumber(grant.readiness, 0, 100, 55),
    status,
    sourceUrl: grant.sourceUrl || "#",
    badges,
    requirements: Array.isArray(grant.requirements) ? grant.requirements : [
      "Review official opportunity page",
      "Confirm Trinidad and Tobago / Caribbean eligibility",
      "Check applicant type requirements",
      "Verify deadline, funding amount, and reporting terms"
    ],
    why: grant.why || "Pulled from a grants dataset. Relevance was estimated from available metadata.",
    caution: grant.caution || "Verify eligibility, applicant type, deadline, funding terms, and source details before acting.",
    nextStep: grant.nextStep || "Open Source"
  };
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function inferCategory(text) {
  const t = text.toLowerCase();
  if (t.includes("climate") || t.includes("environment") || t.includes("resilience") || t.includes("disaster")) return "climate";
  if (t.includes("youth") || t.includes("education") || t.includes("training")) return "youth";
  if (t.includes("health") || t.includes("mental") || t.includes("wellbeing")) return "health";
  if (t.includes("culture") || t.includes("heritage") || t.includes("archive") || t.includes("museum")) return "culture";
  if (t.includes("digital") || t.includes("technology") || t.includes("data") || t.includes("innovation")) return "digital";
  return "general";
}

function isLiveRecord(grant) {
  const combined = `${grant.status} ${grant.badges.join(" ")}`.toLowerCase();
  return combined.includes("live");
}

function isDemoRecord(grant) {
  const combined = `${grant.status} ${grant.badges.join(" ")}`.toLowerCase();
  return combined.includes("demo");
}

function updateStats(visible = grants.length) {
  els.totalCount.textContent = grants.length;
  els.visibleCount.textContent = visible;
  els.liveCount.textContent = grants.filter(isLiveRecord).length;
  els.demoCount.textContent = grants.filter(isDemoRecord).length;
}

function render() {
  const query = els.searchInput.value.trim().toLowerCase();

  let filtered = grants.filter((grant) => {
    const haystack = [
      grant.title,
      grant.organization,
      grant.category,
      grant.status,
      grant.risk,
      grant.effort,
      grant.why,
      grant.caution,
      grant.badges.join(" "),
      grant.requirements.join(" ")
    ].join(" ").toLowerCase();

    const matchesSearch = !query || haystack.includes(query);
    const matchesFilter = filterMatches(grant);

    return matchesSearch && matchesFilter;
  });

  filtered = sortGrants(filtered, els.sortSelect.value);

  updateStats(filtered.length);

  if (filtered.length === 0) {
    els.grantContainer.innerHTML = `
      <div class="empty-state">
        <h3>No matching opportunities found</h3>
        <p>Try a broader search term or switch back to the All filter.</p>
      </div>
    `;
    return;
  }

  els.grantContainer.innerHTML = filtered.map((grant, index) => grantCardTemplate(grant, index)).join("");
}

function filterMatches(grant) {
  if (activeFilter === "all") return true;

  const combined = `${grant.category} ${grant.title} ${grant.organization} ${grant.badges.join(" ")} ${grant.why}`.toLowerCase();

  if (activeFilter === "starter") {
    return combined.includes("starter") || combined.includes("small") || grant.risk.toLowerCase() === "low";
  }

  if (activeFilter === "caribbean") {
    return combined.includes("caribbean") || combined.includes("sids") || combined.includes("trinidad") || combined.includes("tobago") || combined.includes("island");
  }

  return combined.includes(activeFilter);
}

function sortGrants(records, sortMode) {
  const orderRisk = { low: 1, medium: 2, high: 3 };

  return [...records].sort((a, b) => {
    if (sortMode === "match") return b.match - a.match;
    if (sortMode === "readiness") return b.readiness - a.readiness;
    if (sortMode === "risk") return (orderRisk[a.risk.toLowerCase()] || 9) - (orderRisk[b.risk.toLowerCase()] || 9);
    if (sortMode === "title") return a.title.localeCompare(b.title);
    if (sortMode === "deadline") return deadlineScore(a.deadline) - deadlineScore(b.deadline);
    return 0;
  });
}

function deadlineScore(deadline) {
  if (!deadline || deadline.toLowerCase().includes("check")) return 99999999;
  const date = new Date(deadline);
  if (!Number.isNaN(date.getTime())) return date.getTime();

  const digits = deadline.match(/\d+/);
  return digits ? Number(digits[0]) : 99999999;
}

function grantCardTemplate(grant, index) {
  const badgeClass = isLiveRecord(grant) ? "live" : isDemoRecord(grant) ? "demo" : "";
  const original = getOriginalRange(grant);
  const ttd = getTTDRange(grant);

  return `
    <article class="grant-card">
      <div class="card-header">
        <div>
          <p class="org">${escapeHTML(grant.organization)}</p>
          <h3 class="title">${escapeHTML(grant.title)}</h3>
        </div>
        <div class="match">${grant.match}% Match</div>
      </div>

      <div class="badges">
        <span class="badge ${badgeClass}">${escapeHTML(grant.status)}</span>
        ${grant.badges.slice(0, 4).map(badge => `<span class="badge">${escapeHTML(badge)}</span>`).join("")}
      </div>

      <div class="meta-row">
        <span class="meta">${escapeHTML(original)}</span>
        <span class="meta deadline">${escapeHTML(grant.deadline)}</span>
      </div>

      <div class="money-box">
        <div class="money-item">
          <small>Original value</small>
          <strong>${escapeHTML(original)}</strong>
        </div>
        <div class="money-item">
          <small>Approx. TTD</small>
          <strong>${escapeHTML(ttd)}</strong>
        </div>
      </div>

      <div class="risk-grid">
        <div class="risk-box">
          <small>Risk</small>
          <strong class="${riskClass(grant.risk)}">${escapeHTML(grant.risk)}</strong>
        </div>
        <div class="risk-box">
          <small>Effort</small>
          <strong class="${riskClass(grant.effort)}">${escapeHTML(grant.effort)}</strong>
        </div>
        <div class="risk-box">
          <small>Readiness</small>
          <strong>${grant.readiness}%</strong>
        </div>
      </div>

      <div class="info-box">
        <strong>Why this matches</strong>
        <p>${escapeHTML(grant.why)}</p>
      </div>

      <div class="info-box caution">
        <strong>Caribbean caution</strong>
        <p>${escapeHTML(grant.caution)}</p>
      </div>

      <details class="info-box requirements">
        <summary>Likely requirements</summary>
        <ul>
          ${grant.requirements.map(item => `<li>${escapeHTML(item)}</li>`).join("")}
        </ul>
      </details>

      <div class="card-actions">
        <button class="primary-btn" type="button" onclick="openSource(${index})">${escapeHTML(grant.nextStep)}</button>
        <button class="copy-btn" type="button" onclick="copySummary(${index})">Copy summary</button>
      </div>
    </article>
  `;
}

function riskClass(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("low")) return "low";
  if (lower.includes("high")) return "high";
  return "medium";
}

function formatCurrency(amount, currency) {
  if (!amount || amount <= 0) return "Amount not listed";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

function formatTTD(amount) {
  if (!amount || amount <= 0) return "TTD estimate unavailable";

  return new Intl.NumberFormat("en-TT", {
    style: "currency",
    currency: "TTD",
    maximumFractionDigits: 0
  }).format(amount);
}

function getOriginalRange(grant) {
  const min = grant.minFunding;
  const max = grant.maxFunding;

  if (!min && !max) return "Amount not listed";
  if (!min && max) return formatCurrency(max, grant.currency);
  if (min && !max) return `${formatCurrency(min, grant.currency)}+`;
  if (min === max) return formatCurrency(max, grant.currency);
  return `${formatCurrency(min, grant.currency)}–${formatCurrency(max, grant.currency)}`;
}

function getTTDRange(grant) {
  const rate = exchangeRates[grant.currency] || 1;
  const min = grant.minFunding;
  const max = grant.maxFunding;

  if (!min && !max) return "TTD estimate unavailable";
  if (!min && max) return formatTTD(max * rate);
  if (min && !max) return `${formatTTD(min * rate)}+`;
  if (min === max) return formatTTD(max * rate);
  return `${formatTTD(min * rate)}–${formatTTD(max * rate)}`;
}

function openSource(index) {
  const grant = currentRenderedGrant(index) || grants[index];

  if (!grant || !grant.sourceUrl || grant.sourceUrl === "#") {
    alert("No official source link is attached to this record.");
    return;
  }

  window.open(grant.sourceUrl, "_blank", "noopener,noreferrer");
}

function copySummary(index) {
  const grant = currentRenderedGrant(index) || grants[index];

  if (!grant) return;

  const summary = `Grant Shelf Opportunity

${grant.title}
Funder: ${grant.organization}
Status: ${grant.status}

Match: ${grant.match}%
Funding: ${getOriginalRange(grant)}
Approx. TTD: ${getTTDRange(grant)}

Risk: ${grant.risk}
Effort: ${grant.effort}
Readiness: ${grant.readiness}%

Why it matches:
${grant.why}

Caribbean caution:
${grant.caution}

Source:
${grant.sourceUrl}`;

  navigator.clipboard.writeText(summary)
    .then(() => alert("Grant summary copied."))
    .catch(() => alert("Copy failed. You can manually select the card text."));
}

function currentRenderedGrant(renderedIndex) {
  const query = els.searchInput.value.trim().toLowerCase();

  let filtered = grants.filter((grant) => {
    const haystack = [
      grant.title,
      grant.organization,
      grant.category,
      grant.status,
      grant.risk,
      grant.effort,
      grant.why,
      grant.caution,
      grant.badges.join(" "),
      grant.requirements.join(" ")
    ].join(" ").toLowerCase();

    return (!query || haystack.includes(query)) && filterMatches(grant);
  });

  filtered = sortGrants(filtered, els.sortSelect.value);
  return filtered[renderedIndex];
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fallbackGrants() {
  return [
    {
      title: "Demo Climate Resilience Opportunity",
      organization: "Grant Shelf Demo",
      category: "climate",
      match: 82,
      deadline: "Demo only",
      currency: "USD",
      minFunding: 10000,
      maxFunding: 50000,
      risk: "Low",
      effort: "Medium",
      readiness: 75,
      status: "Demo Data",
      sourceUrl: "#",
      badges: ["Demo Data", "Starter Friendly"],
      why: "This fallback record appears only if grants.json cannot be loaded.",
      caution: "Replace this with live data by fixing grants.json or the collector workflow.",
      requirements: ["Check repository file placement", "Confirm grants.json exists in root"],
      nextStep: "View Demo"
    }
  ];
}

els.searchInput.addEventListener("input", render);
els.sortSelect.addEventListener("change", render);
els.reloadBtn.addEventListener("click", loadData);

els.filterRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;

  document.querySelectorAll(".chip").forEach(chip => chip.classList.remove("active"));
  button.classList.add("active");
  activeFilter = button.dataset.filter;
  render();
});

loadData();
