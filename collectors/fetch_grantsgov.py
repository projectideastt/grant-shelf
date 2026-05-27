#!/usr/bin/env python3
"""
Grant Shelf Grants.gov collector.
Runs in GitHub Actions or locally:
    python collectors/fetch_grantsgov.py
Writes:
    grants.json
"""
import json
import time
import urllib.request
from pathlib import Path

API_URL = "https://api.grants.gov/v1/api/search2"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "grants.json"

SEARCH_AREAS = [
    ("climate", "climate environment resilience conservation disaster"),
    ("youth", "youth education training workforce skills"),
    ("digital", "digital data technology innovation cybersecurity"),
    ("health", "health mental health community wellbeing"),
    ("culture", "culture heritage archive museum history"),
    ("caribbean", "Caribbean Trinidad Tobago island islands SIDS"),
]

HIGH_VALUE_TERMS = [
    "caribbean", "trinidad", "tobago", "small island", "sids",
    "climate", "resilience", "community", "youth", "digital",
    "health", "education", "environment", "culture", "heritage"
]

def post_json(url, payload, timeout=30):
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "GrantShelfCollector/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))

def pick(item, *keys, default=None):
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return default

def infer_category(text, fallback="digital"):
    text = (text or "").lower()
    if any(term in text for term in ["climate", "environment", "resilience", "conservation", "disaster"]):
        return "climate"
    if any(term in text for term in ["youth", "education", "training", "workforce", "skills"]):
        return "youth"
    if any(term in text for term in ["health", "mental", "wellbeing"]):
        return "health"
    if any(term in text for term in ["culture", "heritage", "archive", "museum", "history"]):
        return "culture"
    if any(term in text for term in ["digital", "technology", "data", "innovation", "cyber"]):
        return "digital"
    return fallback

def estimate_match(text):
    text = (text or "").lower()
    score = 55
    for term in HIGH_VALUE_TERMS:
        if term in text:
            score += 4
    return min(score, 94)

def estimate_risk(text):
    text = (text or "").lower()
    if any(term in text for term in ["federal", "research", "infrastructure", "cooperative agreement"]):
        return "High"
    if any(term in text for term in ["community", "youth", "small"]):
        return "Low"
    return "Medium"

def estimate_effort(text):
    text = (text or "").lower()
    if any(term in text for term in ["research", "infrastructure", "multi-year", "cooperative agreement"]):
        return "High"
    return "Medium"

def estimate_readiness(risk):
    return {"Low": 76, "Medium": 62, "High": 45}.get(risk, 55)

def to_number(value):
    try:
        return float(str(value or 0).replace(",", ""))
    except Exception:
        return 0

def normalize(item, fallback_category):
    title = pick(item, "title", "oppTitle", "opportunityTitle", default="Untitled opportunity")
    organization = pick(item, "agencyName", "agency", "agencyCode", default="Grants.gov")
    deadline = pick(item, "closeDate", "closeDateStr", "responseDate", default="Check source")
    opportunity_id = pick(item, "id", "oppId", "opportunityId", "number", default="")
    text = f"{title} {organization}"
    category = infer_category(text, fallback_category)
    risk = estimate_risk(text)
    min_funding = to_number(pick(item, "awardFloor", "floor", default=0))
    max_funding = to_number(pick(item, "awardCeiling", "estimatedTotalProgramFunding", "ceiling", default=0))
    source_url = f"https://www.grants.gov/search-results-detail/{opportunity_id}" if opportunity_id else "https://www.grants.gov/search-grants"
    return {
        "id": f"grantsgov-{opportunity_id or abs(hash(title))}",
        "title": title,
        "organization": organization,
        "category": category,
        "match": estimate_match(text),
        "deadline": deadline,
        "currency": "USD",
        "minFunding": min_funding,
        "maxFunding": max_funding,
        "risk": risk,
        "effort": estimate_effort(text),
        "readiness": estimate_readiness(risk),
        "status": "Live Source",
        "sourceUrl": source_url,
        "badges": ["Live Source", "Verify Eligibility", "Check Official Link"],
        "requirements": [
            "Review official opportunity page",
            "Confirm Trinidad and Tobago / Caribbean eligibility",
            "Check applicant type requirements",
            "Verify deadline, funding amount, and reporting terms"
        ],
        "why": "Pulled from a public grants database. Grant Shelf estimated relevance from title and agency metadata.",
        "caution": "Live data requires verification. Confirm eligibility, applicant type, deadline, and funding terms on the official source before acting.",
        "nextStep": "Open Source"
    }

def fetch_area(category, keyword):
    payload = {"rows": 20, "keyword": keyword, "oppStatuses": "forecasted|posted"}
    data = post_json(API_URL, payload)
    opportunities = data.get("data", {}).get("oppHits") or data.get("oppHits") or data.get("opportunities") or []
    if not isinstance(opportunities, list):
        return []
    return [normalize(item, category) for item in opportunities]

def main():
    all_records = {}
    errors = []
    for category, keyword in SEARCH_AREAS:
        try:
            for record in fetch_area(category, keyword):
                all_records[record["id"]] = record
            time.sleep(1)
        except Exception as exc:
            errors.append(f"{category}: {exc}")
    records = list(all_records.values())
    records.sort(key=lambda r: (-int(r.get("match", 0)), r.get("title", "")))
    if not records:
        raise RuntimeError("No records collected. Errors: " + "; ".join(errors))
    OUTPUT.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(records)} records to {OUTPUT}")
    for error in errors:
        print("Source area failed:", error)

if __name__ == "__main__":
    main()
