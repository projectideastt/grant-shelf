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
  sortSelect: document.getElementById("sortSelect"),
  hideLowFitToggle: document.getElementById("hideLowFitToggle"),
  grantContainer: document.getElementById("grantContainer"),
  statusDot: document.getElementById("statusDot"),
  statusTitle: document.getElementById("statusTitle"),
  statusMessage: document.getElementById("statusMessage"),
  statusDetails: document.getElementById("statusDetails"),
  totalCount: document.getElementById("totalCount"),
  visibleCount: document.getElementById("visibleCount"),
  starterCount: document.getElementById("starterCount"),
  caribbeanCount: document.getElementById("caribbeanCount")
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
    const response = await fetch(`${DATA_URL}?cacheBust=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Could not load grants.json. HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("grants.json loaded, but it is not an array.");
    }

    grants = data.map(normalizeGrant);

    const liveCount = grants.filter(g => String(g.status).toLowerCase().includes("live")).length;
    const demoCount = grants.filter(g => String(g.status).toLowerCase().includes("demo")).length;

    if (liveCount > 0) {
      setStatus(
        "success",
        "Grant data loaded",
        `${grants.length} records loaded. ${liveCount} appear to be live-source records.`,
        JSON.stringify({
          recordsLoaded: grants.length,
          liveSourceRecords: liveCount,
          demoRecords: demoCount,
          note: "Use source links to verify eligibility before applying."
        }, null, 2)
      );
    } else {
      setStatus(
        "warning",
        "Demo data loaded",
        `${grants.length} demo records loaded. Run the collector to replace this with live records.`,
        JSON.stringify({
          recordsLoaded: grants.length,
          note: "Demo records detected."
        }, null, 2)
      );
    }

    updateStats();
    render();
  } catch (error) {
    console.error(error);
    grants = fallbackGrants().map(normalizeGrant);

    setStatus(
      "error",
      "Could not load grants.json",
      "The page is showing emergency fallback records. Check file placement and JSON formatting.",
      error.message
    );

    updateStats();
    render();
  }
}

function normalizeGrant(raw) {
  const title = raw.title || "Untitled opportunity";
  const organization = raw.organization || raw.funder || "Unknown funder";
  const combined = [
    title,
    organization,
    raw.category,
    raw.why,
    raw.caution,
    ...(raw.badges || [])
  ].join(" ").toLowerCase();

  const sourceTier = raw.sourceTier || inferSourceTier(raw, combined);
  const caribbeanEligibility = raw.caribbeanEligibility || inferCaribbeanEligibility(raw, combined, sourceTier);
  const caribbeanReason = raw.caribbeanReason || inferCaribbeanReason(sourceTier, caribbeanEligibility, combined);
  const beginnerFriendliness = raw.beginnerFriendliness || inferBeginnerFriendliness(raw, combined);
  const worthChecking = raw.worthChecking || inferWorthChecking(caribbeanEligibility, beginnerFriendliness, raw.risk, combined);
  const plainEnglish = raw.plainEnglish || makePlainEnglishSummary(title, combined);
  const bestFor = Array.isArray(raw.bestFor) ? raw.bestFor : inferBestFor(combined);
  const redFlags = Array.isArray(raw.redFlags) ? raw.redFlags : inferRedFlags(raw, combined, caribbeanEligibility);
  const requirements = Array.isArray(raw.requirements) ? raw.requirements : inferRequirements(combined);

  return {
    title,
    organization,
    category: (raw.category || inferCategory(combined)).toLowerCase(),
    sourceTier,
    caribbeanEligibility,
    caribbeanReason,
    caribbeanFitScore: clamp(raw.caribbeanFitScore ?? inferCaribbeanFitScore(sourceTier, caribbeanEligibility, combined), 0, 100),
    beginnerFriendliness,
    worthChecking,
    plainEnglish,
    bestFor,
    redFlags,
    deadline: raw.deadline || "Check source",
    currency: raw.currency || "USD",
    minFunding: numberOrZero(raw.minFunding),
    maxFunding: numberOrZero(raw.maxFunding),
    risk: raw.risk || inferRisk(combined),
    effort: raw.effort || inferEffort(combined),
    readiness: clamp(raw.readiness ?? inferReadiness(raw.risk || inferRisk(combined), beginnerFriendliness), 0, 100),
    status: raw.status || "Needs Review",
    sourceUrl: raw.sourceUrl || "#",
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    requirements,
    why: raw.why || "This opportunity was found in the grant dataset. Grant Shelf has prepared a plain-language review based on available information.",
    caution: raw.caution || "Confirm eligibility, applicant type, deadline, funding terms, and official source details before acting.",
    nextStep: raw.nextStep || safeNextStep(worthChecking, caribbeanEligibility)
  };
}

function inferSourceTier(raw, text) {
  const url = String(raw.sourceUrl || "").toLowerCase();

  if (text.includes("trinidad") || text.includes("tobago") || url.includes("trinidad-and-tobago")) return "TT Source";
  if (text.includes("caribbean") || url.includes("carib") || text.includes("caricom") || text.includes("oecs")) return "Caribbean Source";
  if (text.includes("sids") || text.includes("small island")) return "SIDS-Relevant";
  if (text.includes("commonwealth")) return "Commonwealth Source";
  if (url.includes("grants.gov") || text.includes("national institutes")) return "Global / U.S.-Centric";
  return "Global Source";
}

function inferCaribbeanEligibility(raw, text, sourceTier) {
  if (raw.eligibleCountries && JSON.stringify(raw.eligibleCountries).toLowerCase().includes("trinidad")) return "Confirmed";
  if (sourceTier === "TT Source" || sourceTier === "Caribbean Source") return "Likely";
  if (sourceTier === "SIDS-Relevant" || sourceTier === "Commonwealth Source") return "Likely";
  if (text.includes("u.s.") || text.includes("united states") || text.includes("national institutes")) return "Unclear / Possibly Low";
  return "Unclear";
}

function inferCaribbeanReason(sourceTier, eligibility, text) {
  if (eligibility === "Confirmed") return "The record appears to directly mention Trinidad and Tobago or eligible countries.";
  if (sourceTier === "TT Source") return "The source or text appears specific to Trinidad and Tobago.";
  if (sourceTier === "Caribbean Source") return "The source or text appears Caribbean or regional.";
  if (sourceTier === "SIDS-Relevant") return "The opportunity appears relevant to Small Island Developing States.";
  if (sourceTier === "Commonwealth Source") return "The opportunity appears relevant through Commonwealth eligibility.";
  if (text.includes("national institutes")) return "The source appears U.S.-centric; Caribbean eligibility must be checked carefully.";
  return "The source does not clearly confirm Caribbean eligibility.";
}

function inferBeginnerFriendliness(raw, text) {
  const amount = Number(raw.maxFunding || 0);
  if (text.includes("starter") || text.includes("small grants") || text.includes("community") || text.includes("planning grant")) return "High";
  if (amount > 0 && amount <= 75000) return "Medium";
  if (text.includes("research") || text.includes("cooperative agreement") || text.includes("institute")) return "Low";
  return "Medium";
}

function inferWorthChecking(eligibility, beginner, risk, text) {
  const lowerRisk = String(risk || "").toLowerCase();

  if (eligibility === "Confirmed" || eligibility === "Likely") {
    if (beginner === "High" || lowerRisk === "low") return "Yes";
    return "Maybe";
  }

  if (text.includes("u.s.") || text.includes("national institutes")) return "Probably not";

  return "Maybe";
}

function inferCaribbeanFitScore(sourceTier, eligibility, text) {
  let score = 35;

  if (sourceTier === "TT Source") score += 45;
  if (sourceTier === "Caribbean Source") score += 38;
  if (sourceTier === "SIDS-Relevant") score += 32;
  if (sourceTier === "Commonwealth Source") score += 28;
  if (sourceTier === "Global / U.S.-Centric") score -= 15;

  if (eligibility === "Confirmed") score += 20;
  if (eligibility === "Likely") score += 12;
  if (eligibility.includes("Low")) score -= 15;

  ["trinidad", "tobago", "caribbean", "sids", "small island", "commonwealth", "community", "ngo", "civil society"].forEach(term => {
    if (text.includes(term)) score += 4;
  });

  return score;
}

function makePlainEnglishSummary(title, text) {
  if (text.includes("climate") || text.includes("environment")) {
    return "This appears to support environmental, climate, resilience, or conservation-related work.";
  }

  if (text.includes("youth") || text.includes("education")) {
    return "This appears to support youth, education, training, or learning-related activities.";
  }

  if (text.includes("health") || text.includes("mental")) {
    return "This appears to support health, wellbeing, mental health, or community support activities.";
  }

  if (text.includes("digital") || text.includes("technology") || text.includes("data")) {
    return "This appears to support technology, digital tools, data, innovation, or public information systems.";
  }

  if (text.includes("culture") || text.includes("heritage") || text.includes("archive")) {
    return "This appears to support culture, heritage, archives, history, or knowledge preservation.";
  }

  return "This is a funding opportunity that may support a project, programme, service, or research idea. Review the source to understand who can apply.";
}

function inferBestFor(text) {
  const best = [];

  if (text.includes("community") || text.includes("small grants")) best.push("Community groups");
  if (text.includes("ngo") || text.includes("civil society") || text.includes("nonprofit")) best.push("NGOs / civil society");
  if (text.includes("youth")) best.push("Youth groups");
  if (text.includes("school") || text.includes("education")) best.push("Schools / education groups");
  if (text.includes("research") || text.includes("institute") || text.includes("university")) best.push("Universities / researchers");
  if (text.includes("digital") || text.includes("technology")) best.push("Digital project teams");
  if (text.includes("climate") || text.includes("environment")) best.push("Environmental groups");

  return best.length ? best : ["Organisations with a clear project idea", "Applicants who can verify eligibility"];
}

function inferRedFlags(raw, text, eligibility) {
  const flags = [];

  if (eligibility !== "Confirmed" && eligibility !== "Likely") flags.push("Caribbean eligibility is not confirmed.");
  if (text.includes("u.s.") || text.includes("national institutes")) flags.push("May be designed mainly for U.S.-based applicants.");
  if (text.includes("research") || text.includes("cooperative agreement")) flags.push("May require institutional or research capacity.");
  if (!raw.maxFunding && !raw.minFunding) flags.push("Funding amount is not listed.");
  if (String(raw.deadline || "").toLowerCase().includes("check")) flags.push("Deadline needs to be checked on the official source.");

  return flags.length ? flags : ["No major red flags detected by the automated review. Still verify the official source."];
}

function inferRequirements(text) {
  const reqs = [
    "Official eligibility check",
    "Short project idea summary",
    "Basic budget",
    "Timeline"
  ];

  if (text.includes("ngo") || text.includes("civil society") || text.includes("community")) reqs.push("Organisation registration or partner");
  if (text.includes("research") || text.includes("university")) reqs.push("Institutional or university partner");
  if (text.includes("climate") || text.includes("environment")) reqs.push("Expected environmental benefit");
  if (text.includes("health") || text.includes("mental")) reqs.push("Safeguarding or referral approach");

  return [...new Set(reqs)];
}

function safeNextStep(worth, eligibility) {
  if (worth === "Yes") return "Check if you can apply";
  if (eligibility.includes("Low")) return "Review eligibility first";
  return "See what you need";
}

function inferCategory(text) {
  if (text.includes("climate") || text.includes("environment") || text.includes("resilience")) return "climate";
  if (text.includes("youth") || text.includes("education") || text.includes("training")) return "youth";
  if (text.includes("health") || text.includes("mental")) return "health";
  if (text.includes("culture") || text.includes("heritage") || text.includes("archive")) return "culture";
  if (text.includes("digital") || text.includes("technology") || text.includes("data")) return "digital";
  return "general";
}

function inferRisk(text) {
  if (text.includes("research") || text.includes("cooperative agreement") || text.includes("infrastructure")) return "High";
  if (text.includes("small grants") || text.includes("community") || text.includes("planning grant")) return "Low";
  return "Medium";
}

function inferEffort(text) {
  if (text.includes("research") || text.includes("infrastructure") || text.includes("cooperative agreement")) return "High";
  if (text.includes("small grants") || text.includes("planning grant")) return "Low";
  return "Medium";
}

function inferReadiness(risk, beginner) {
  if (beginner === "High") return 78;
  if (String(risk).toLowerCase() === "high") return 45;
  if (String(risk).toLowerCase() === "low") return 72;
  return 60;
}

function render() {
  const query = els.searchInput.value.trim().toLowerCase();
  const hideLowFit = els.hideLowFitToggle.checked;

  let filtered = grants.filter(grant => {
    const text = [
      grant.title,
      grant.organization,
      grant.category,
      grant.sourceTier,
      grant.caribbeanEligibility,
      grant.worthChecking,
      grant.beginnerFriendliness,
      grant.plainEnglish,
      grant.bestFor.join(" "),
      grant.redFlags.join(" "),
      grant.requirements.join(" "),
      grant.badges.join(" ")
    ].join(" ").toLowerCase();

    const matchesSearch = !query || text.includes(query);
    const matchesFilter = filterMatches(grant);
    const passesLowFit = !hideLowFit || grant.worthChecking !== "Probably not";

    return matchesSearch && matchesFilter && passesLowFit;
  });

  filtered = sortGrants(filtered);

  updateStats(filtered.length);

  if (!filtered.length) {
    els.grantContainer.innerHTML = `
      <div class="empty-state">
        <h3>No matching opportunities found</h3>
        <p>Try a broader search, switch to All, or turn off “Hide probably-not opportunities.”</p>
      </div>
    `;
    return;
  }

  els.grantContainer.innerHTML = filtered.map((grant, index) => cardTemplate(grant, index)).join("");
}

function filterMatches(grant) {
  const text = [
    grant.title,
    grant.organization,
    grant.category,
    grant.sourceTier,
    grant.caribbeanEligibility,
    grant.beginnerFriendliness,
    grant.worthChecking,
    grant.bestFor.join(" "),
    grant.badges.join(" ")
  ].join(" ").toLowerCase();

  if (activeFilter === "all") return true;
  if (activeFilter === "starter") return grant.beginnerFriendliness === "High" || grant.risk === "Low";
  if (activeFilter === "caribbean") return ["Confirmed", "Likely"].includes(grant.caribbeanEligibility) || text.includes("caribbean") || text.includes("sids") || text.includes("trinidad");
  if (activeFilter === "needs-review") return !["Confirmed", "Likely"].includes(grant.caribbeanEligibility) || grant.worthChecking === "Maybe";
  return text.includes(activeFilter);
}

function sortGrants(records) {
  const mode = els.sortSelect.value;
  const worthOrder = { "Yes": 1, "Maybe": 2, "Probably not": 3 };
  const riskOrder = { "Low": 1, "Medium": 2, "High": 3 };
  const beginnerOrder = { "High": 1, "Medium": 2, "Low": 3 };

  return [...records].sort((a, b) => {
    if (mode === "caribbean") return b.caribbeanFitScore - a.caribbeanFitScore;
    if (mode === "beginner") return (beginnerOrder[a.beginnerFriendliness] || 9) - (beginnerOrder[b.beginnerFriendliness] || 9);
    if (mode === "worth") return (worthOrder[a.worthChecking] || 9) - (worthOrder[b.worthChecking] || 9);
    if (mode === "risk") return (riskOrder[a.risk] || 9) - (riskOrder[b.risk] || 9);
    if (mode === "title") return a.title.localeCompare(b.title);
    if (mode === "deadline") return deadlineScore(a.deadline) - deadlineScore(b.deadline);
    return 0;
  });
}

function deadlineScore(deadline) {
  const date = new Date(deadline);
  if (!Number.isNaN(date.getTime())) return date.getTime();
  const num = String(deadline || "").match(/\d+/);
  return num ? Number(num[0]) : 999999999;
}

function cardTemplate(grant, renderedIndex) {
  const worthClass = worthCheckingClass(grant.worthChecking);
  const sourceClass = sourceTierClass(grant.sourceTier);
  const eligibilityClass = eligibilityBadgeClass(grant.caribbeanEligibility);

  return `
    <article class="grant-card">
      <div class="card-top">
        <div>
          <p class="org">${escapeHTML(grant.organization)}</p>
          <h3 class="title">${escapeHTML(grant.title)}</h3>
        </div>
        <div class="fit-badge">${grant.caribbeanFitScore}% Caribbean Fit</div>
      </div>

      <div class="worth-row">
        <div class="decision-box">
          <small>Worth checking?</small>
          <strong class="${worthClass}">${escapeHTML(grant.worthChecking)}</strong>
        </div>
        <div class="decision-box">
          <small>Beginner friendly?</small>
          <strong>${escapeHTML(grant.beginnerFriendliness)}</strong>
        </div>
      </div>

      <div class="badges">
        <span class="badge ${sourceClass}">${escapeHTML(grant.sourceTier)}</span>
        <span class="badge ${eligibilityClass}">Eligibility: ${escapeHTML(grant.caribbeanEligibility)}</span>
        <span class="badge">${escapeHTML(grant.status)}</span>
        ${grant.badges.slice(0, 3).map(badge => `<span class="badge">${escapeHTML(badge)}</span>`).join("")}
      </div>

      <div class="info-box plain">
        <strong>In plain English</strong>
        <p>${escapeHTML(grant.plainEnglish)}</p>
      </div>

      <div class="info-box">
        <strong>Best for</strong>
        <p>${escapeHTML(grant.bestFor.join(", "))}</p>
      </div>

      <div class="meta-row">
        <span class="meta">${escapeHTML(getOriginalRange(grant))}</span>
        <span class="meta">${escapeHTML(getTTDRange(grant))}</span>
        <span class="meta deadline">${escapeHTML(grant.deadline)}</span>
      </div>

      <div class="readiness-grid">
        <div class="decision-box">
          <small>Risk</small>
          <strong class="${riskClass(grant.risk)}">${escapeHTML(grant.risk)}</strong>
        </div>
        <div class="decision-box">
          <small>Effort</small>
          <strong class="${riskClass(grant.effort)}">${escapeHTML(grant.effort)}</strong>
        </div>
        <div class="decision-box">
          <small>Readiness</small>
          <strong>${grant.readiness}%</strong>
        </div>
      </div>

      <div class="info-box caution">
        <strong>Caribbean eligibility note</strong>
        <p>${escapeHTML(grant.caribbeanReason)}</p>
      </div>

      <div class="info-box redflags">
        <strong>Watch out for</strong>
        <ul>${grant.redFlags.map(flag => `<li>${escapeHTML(flag)}</li>`).join("")}</ul>
      </div>

      <details class="info-box requirements">
        <summary>You may need</summary>
        <ul>${grant.requirements.map(req => `<li>${escapeHTML(req)}</li>`).join("")}</ul>
      </details>

      <div class="actions">
        <button type="button" class="primary-btn" onclick="openSource(${renderedIndex})">${escapeHTML(grant.nextStep)}</button>
        <button type="button" class="copy-btn" onclick="copySummary(${renderedIndex})">Copy summary</button>
      </div>
    </article>
  `;
}

function updateStats(visible = grants.length) {
  els.totalCount.textContent = grants.length;
  els.visibleCount.textContent = visible;
  els.starterCount.textContent = grants.filter(g => g.beginnerFriendliness === "High" || g.risk === "Low").length;
  els.caribbeanCount.textContent = grants.filter(g => ["Confirmed", "Likely"].includes(g.caribbeanEligibility)).length;
}

function getRenderedRecords() {
  const query = els.searchInput.value.trim().toLowerCase();
  const hideLowFit = els.hideLowFitToggle.checked;

  let filtered = grants.filter(grant => {
    const text = [
      grant.title,
      grant.organization,
      grant.category,
      grant.sourceTier,
      grant.caribbeanEligibility,
      grant.worthChecking,
      grant.beginnerFriendliness,
      grant.plainEnglish,
      grant.bestFor.join(" "),
      grant.redFlags.join(" "),
      grant.requirements.join(" "),
      grant.badges.join(" ")
    ].join(" ").toLowerCase();

    return (!query || text.includes(query)) && filterMatches(grant) && (!hideLowFit || grant.worthChecking !== "Probably not");
  });

  return sortGrants(filtered);
}

function openSource(renderedIndex) {
  const grant = getRenderedRecords()[renderedIndex];
  if (!grant || !grant.sourceUrl || grant.sourceUrl === "#") {
    alert("No official source link is attached to this record.");
    return;
  }
  window.open(grant.sourceUrl, "_blank", "noopener,noreferrer");
}

function copySummary(renderedIndex) {
  const grant = getRenderedRecords()[renderedIndex];
  if (!grant) return;

  const summary = `Grant Shelf Caribbean

${grant.title}
Funder: ${grant.organization}

Worth checking: ${grant.worthChecking}
Caribbean eligibility: ${grant.caribbeanEligibility}
Caribbean fit: ${grant.caribbeanFitScore}%
Beginner friendly: ${grant.beginnerFriendliness}

In plain English:
${grant.plainEnglish}

Best for:
${grant.bestFor.join(", ")}

Money:
${getOriginalRange(grant)}
Approx. local value: ${getTTDRange(grant)}

Watch out for:
${grant.redFlags.join("; ")}

Safe next step:
${grant.nextStep}

Source:
${grant.sourceUrl}`;

  navigator.clipboard.writeText(summary)
    .then(() => alert("Grant summary copied."))
    .catch(() => alert("Copy failed. You can manually select the card text."));
}

function sourceTierClass(sourceTier) {
  const lower = String(sourceTier).toLowerCase();
  if (lower.includes("tt")) return "source-tt";
  if (lower.includes("caribbean")) return "source-caribbean";
  if (lower.includes("u.s")) return "lowfit";
  return "";
}

function eligibilityBadgeClass(value) {
  if (value === "Confirmed" || value === "Likely") return "confirmed";
  if (value.includes("Low")) return "lowfit";
  return "warning";
}

function worthCheckingClass(value) {
  if (value === "Yes") return "yes";
  if (value === "Probably not") return "no";
  return "maybe";
}

function riskClass(value) {
  const lower = String(value).toLowerCase();
  if (lower.includes("low")) return "low yes";
  if (lower.includes("high")) return "high no";
  return "medium maybe";
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

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
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
      title: "Demo Beginner-Friendly Climate Grant",
      organization: "Grant Shelf Demo",
      category: "climate",
      sourceTier: "Caribbean Source",
      caribbeanEligibility: "Likely",
      caribbeanReason: "Demo record showing how Caribbean-oriented opportunities should be explained.",
      caribbeanFitScore: 84,
      beginnerFriendliness: "High",
      worthChecking: "Yes",
      plainEnglish: "This demo record shows how Grant Shelf explains funding for a small community climate idea.",
      bestFor: ["Community groups", "NGOs", "Youth groups"],
      redFlags: ["Demo data only. Replace with live records."],
      deadline: "Demo only",
      currency: "USD",
      minFunding: 5000,
      maxFunding: 50000,
      risk: "Low",
      effort: "Medium",
      readiness: 80,
      status: "Demo Data",
      sourceUrl: "#",
      badges: ["Demo Data", "Starter Friendly"],
      requirements: ["Project idea summary", "Simple budget", "Eligibility check"],
      nextStep: "Check if you can apply"
    }
  ];
}

document.querySelector(".quick-actions").addEventListener("click", event => {
  const chip = event.target.closest("[data-filter]");
  if (!chip) return;

  document.querySelectorAll(".quick-chip").forEach(btn => btn.classList.remove("active"));
  chip.classList.add("active");
  activeFilter = chip.dataset.filter;
  render();
});

els.searchInput.addEventListener("input", render);
els.sortSelect.addEventListener("change", render);
els.hideLowFitToggle.addEventListener("change", render);
els.reloadBtn.addEventListener("click", loadData);

loadData();
