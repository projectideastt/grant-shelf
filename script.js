const DEFAULT_EXCHANGE_RATES = {
  USD: 6.8,
  EUR: 9.0,
  GBP: 8.6,
  CAD: 5.0
};

let exchangeRates = { ...DEFAULT_EXCHANGE_RATES };
let grants = [];
let activeFilter = "all";

const grantContainer = document.getElementById("grantContainer");
const searchInput = document.getElementById("searchInput");
const tags = document.querySelectorAll(".tag");
const statusDot = document.getElementById("statusDot");
const statusTitle = document.getElementById("statusTitle");
const statusMessage = document.getElementById("statusMessage");
const statusDetails = document.getElementById("statusDetails");
const exchangeRateLabel = document.getElementById("exchangeRateLabel");

function updateStatus(type, title, message, details) {
  statusDot.className = `status-dot ${type}`;
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  statusDetails.textContent = details || "No technical details available.";
}

function updateExchangeLabel(meta = {}) {
  const pieces = Object.entries(exchangeRates)
    .filter(([currency]) => currency !== "TTD")
    .map(([currency, rate]) => `${currency} 1 ≈ TTD ${Number(rate).toFixed(2)}`);

  exchangeRateLabel.textContent = `${pieces.join(" / ")}${meta.exchange_rate_date ? ` | ${meta.exchange_rate_date}` : ""}`;
}

async function loadGrantsJson() {
  updateStatus(
    "loading",
    "Loading Grant Shelf data...",
    "Reading grants.json from this GitHub site.",
    "Fetching ./grants.json"
  );

  try {
    const response = await fetch(`./grants.json?cache=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();

    const records = Array.isArray(payload) ? payload : payload.records || [];
    const meta = Array.isArray(payload) ? {} : payload.meta || {};

    exchangeRates = { ...DEFAULT_EXCHANGE_RATES, ...(meta.exchange_rates || {}) };
    grants = records;

    updateExchangeLabel(meta);

    if (!records.length) {
      updateStatus(
        "warning",
        "No real grant records loaded yet",
        "The site loaded correctly, but grants.json does not contain public grant records yet. Run the GitHub Action collector to populate it.",
        JSON.stringify({ source: "./grants.json", meta, recordsLoaded: 0 }, null, 2)
      );
    } else {
      updateStatus(
        "success",
        "Real grant data loaded",
        `${records.length} opportunity records were loaded from grants.json. Always verify eligibility and deadlines on the official source before applying.`,
        JSON.stringify({ source: "./grants.json", meta, recordsLoaded: records.length }, null, 2)
      );
    }

    renderGrants();
  } catch (error) {
    console.error(error);
    exchangeRates = { ...DEFAULT_EXCHANGE_RATES };
    updateExchangeLabel();
    grants = [];

    updateStatus(
      "error",
      "Could not load grants.json",
      "The frontend is working, but the data file could not be read. Check that grants.json exists at the site root.",
      error.message
    );

    renderGrants();
  }
}

function formatCurrency(amount, currency) {
  if (!amount || Number(amount) === 0) return "Amount not listed";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(amount));
}

function formatTTD(amount) {
  if (!amount || Number(amount) === 0) return "TTD estimate unavailable";

  return new Intl.NumberFormat("en-TT", {
    style: "currency",
    currency: "TTD",
    maximumFractionDigits: 0
  }).format(Number(amount));
}

function getOriginalRange(grant) {
  if (!grant.minFunding && !grant.maxFunding) return "Amount not listed";
  if (!grant.minFunding && grant.maxFunding) return formatCurrency(grant.maxFunding, grant.currency || "USD");
  if (grant.minFunding && !grant.maxFunding) return `${formatCurrency(grant.minFunding, grant.currency || "USD")}+`;
  if (grant.minFunding === grant.maxFunding) return formatCurrency(grant.maxFunding, grant.currency || "USD");

  return `${formatCurrency(grant.minFunding, grant.currency || "USD")}–${formatCurrency(grant.maxFunding, grant.currency || "USD")}`;
}

function getTTDRange(grant) {
  if (!grant.minFunding && !grant.maxFunding) return "TTD estimate unavailable";

  const rate = exchangeRates[grant.currency || "USD"] || 1;

  if (!grant.minFunding && grant.maxFunding) return formatTTD(grant.maxFunding * rate);
  if (grant.minFunding && !grant.maxFunding) return `${formatTTD(grant.minFunding * rate)}+`;
  if (grant.minFunding === grant.maxFunding) return formatTTD(grant.maxFunding * rate);

  return `${formatTTD(grant.minFunding * rate)}–${formatTTD(grant.maxFunding * rate)}`;
}

function getRiskClass(value) {
  return String(value || "medium").toLowerCase();
}

function matchesStarterFilter(grant) {
  const badges = grant.badges || [];
  return badges.some((badge) => badge.toLowerCase().includes("starter"));
}

function copyGrantSummary(grant) {
  const summary = `
Grant Shelf Opportunity

${grant.title}
Funder: ${grant.organization}
Status: ${grant.status || "Source Loaded"}

Match: ${grant.match || "Review"}%
Funding: ${getOriginalRange(grant)}
Approx. TTD: ${getTTDRange(grant)}

Risk: ${grant.risk || "Review"}
Effort: ${grant.effort || "Review"}
Readiness: ${grant.readiness || "Review"}%

Why it matches:
${grant.why || "Review official source."}

Caribbean caution:
${grant.caution || "Verify details on the official funder website before acting."}

Source:
${grant.sourceUrl || "No source link provided."}
  `.trim();

  navigator.clipboard.writeText(summary);
  alert("Grant summary copied for WhatsApp or email sharing.");
}

function openSource(url) {
  if (!url || url === "#") {
    alert("No official source link is attached to this record.");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function renderGrants() {
  const query = searchInput.value.toLowerCase();

  const filtered = grants.filter((grant) => {
    const searchableText = [
      grant.title,
      grant.organization,
      grant.category,
      grant.countryEligibility?.join(" "),
      grant.why,
      grant.caution,
      grant.risk,
      grant.effort,
      grant.requirements?.join(" "),
      grant.badges?.join(" ")
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchableText.includes(query);

    const matchesFilter =
      activeFilter === "all" ||
      grant.category === activeFilter ||
      (activeFilter === "starter" && matchesStarterFilter(grant));

    return matchesSearch && matchesFilter;
  });

  if (!filtered.length) {
    grantContainer.innerHTML = `
      <div class="grant-card empty-card">
        <h3>No matching opportunities found</h3>
        <p>
          Try another search, clear your filters, or run the GitHub Action collector if grants.json is empty.
        </p>
      </div>
    `;
    return;
  }

  grantContainer.innerHTML = filtered
    .map((grant, index) => {
      const requirements = grant.requirements || [
        "Review official opportunity page",
        "Confirm country eligibility",
        "Verify applicant type and deadline"
      ];

      const badges = grant.badges || ["Verify Source"];

      return `
        <div class="grant-card">
          <div class="card-top">
            <div>
              <p class="org-name">${grant.organization || "Unknown Funder"}</p>
              <h3>${grant.title || "Untitled Opportunity"}</h3>
            </div>

            <div class="match-score">${grant.match || "Review"}% Match</div>
          </div>

          <div class="badge-row">
            <span class="badge">${grant.status || "Source Loaded"}</span>
            ${badges.map((badge) => `<span class="badge">${badge}</span>`).join("")}
          </div>

          <div class="meta">
            <span>${getOriginalRange(grant)}</span>
            <span class="deadline">${grant.deadline || "Check source"}</span>
          </div>

          <div class="currency-box">
            <strong>Approx. TTD Value</strong>
            <div class="local-value">${getTTDRange(grant)}</div>
            <small>Estimate only. Actual bank rates and fees may vary.</small>
          </div>

          <div class="risk-panel">
            <div class="risk-item">
              <div class="risk-label">Risk</div>
              <div class="risk-value ${getRiskClass(grant.risk)}">${grant.risk || "Review"}</div>
            </div>
            <div class="risk-item">
              <div class="risk-label">Effort</div>
              <div class="risk-value ${getRiskClass(grant.effort)}">${grant.effort || "Review"}</div>
            </div>
            <div class="risk-item">
              <div class="risk-label">Readiness</div>
              <div class="risk-value">${grant.readiness || "Review"}%</div>
            </div>
          </div>

          <div class="why-box">
            <strong>Why this matches:</strong>
            <p>${grant.why || "Review official source."}</p>
          </div>

          <div class="caution-box">
            <strong>Caribbean caution:</strong>
            <p>${grant.caution || "Verify eligibility, deadlines and funder terms on the official source before acting."}</p>
          </div>

          <div class="requirements-box">
            <strong>Likely requirements:</strong>
            <ul>${requirements.map((item) => `<li>${item}</li>`).join("")}</ul>
          </div>

          <div class="button-row">
            <button class="apply-btn" onclick="openSource('${grant.sourceUrl || "#"}')">${grant.nextStep || "Open Source"}</button>
            <button class="share-btn" onclick="copyGrantSummary(grants[${index}])">Copy Summary</button>
          </div>
        </div>
      `;
    })
    .join("");
}

searchInput.addEventListener("input", renderGrants);

tags.forEach((tag) => {
  tag.addEventListener("click", () => {
    tags.forEach((t) => t.classList.remove("active"));
    tag.classList.add("active");
    activeFilter = tag.dataset.filter;
    renderGrants();
  });
});

loadGrantsJson();
