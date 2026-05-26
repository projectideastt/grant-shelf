#!/usr/bin/env python3
"""
Grant Shelf collector: Grants.gov public API → grants.json

This script is designed to be run by GitHub Actions. It queries the public
Grants.gov search2 API for several thematic areas relevant to Caribbean / SIDS
public-good projects, normalizes the results, and writes a frontend-ready
`grants.json` file at the repository root.

Important:
- Search2 is public and does not require authentication.
- Grants.gov records are real public opportunities, but not all are suitable
  for Trinidad & Tobago or Caribbean applicants.
- The frontend therefore labels records as needing official verification.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

API_URL = "https://api.grants.gov/v1/api/search2"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "grants.json"
RAW_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "raw_grantsgov.json"

EXCHANGE_RATES_TO_TTD = {
    "USD": 6.80,
    "EUR": 9.00,
    "GBP": 8.60,
    "CAD": 5.00,
}

# Thematic pulls for Grant Shelf. These are broad enough to produce results,
# but aligned enough to test the product concept.
SEARCH_AREAS = [
    {
        "label": "Climate / Environment / Resilience",
        "category": "climate",
        "keyword": "climate OR environment OR resilience OR conservation OR disaster",
        "why": "environment, resilience and climate-related grant discovery",
    },
    {
        "label": "Youth / Education / Skills",
        "category": "youth",
        "keyword": "youth OR education OR training OR workforce OR skills",
        "why": "youth development, education and capacity-building opportunities",
    },
    {
        "label": "Digital / Data / Civic Technology",
        "category": "digital",
        "keyword": "digital OR data OR technology OR innovation OR cybersecurity",
        "why": "digital public-good, innovation, data and technology opportunities",
    },
    {
        "label": "Health / Mental Health / Community Support",
        "category": "health",
        "keyword": "health OR mental health OR community health OR suicide OR wellbeing",
        "why": "health, mental health and community support opportunities",
    },
    {
        "label": "Culture / Archives / Heritage",
        "category": "culture",
        "keyword": "culture OR heritage OR archive OR museum OR history",
        "why": "cultural heritage, archives and knowledge preservation opportunities",
    },
    {
        "label": "Caribbean / SIDS / Islands",
        "category": "climate",
        "keyword": "Caribbean OR Trinidad OR Tobago OR island OR islands OR SIDS",
        "why": "geographic relevance for Caribbean, islands and SIDS contexts",
    },
]


def post_json(url: str, payload: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_hits(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    candidates = [
        payload.get("data", {}).get("oppHits"),
        payload.get("oppHits"),
        payload.get("opportunities"),
        payload.get("data", {}).get("opportunities"),
        payload.get("data", {}).get("hits"),
        payload.get("hits"),
    ]

    for item in candidates:
        if isinstance(item, list):
            return item

    # Sometimes APIs wrap results under a named result object.
    for value in payload.values():
        if isinstance(value, dict):
            for nested_value in value.values():
                if isinstance(nested_value, list):
                    return nested_value

    return []


def first_present(item: Dict[str, Any], keys: Iterable[str], default: Any = None) -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, "", []):
            return value
    return default


def to_number(value: Any) -> int:
    if value in (None, "", "null"):
        return 0
    try:
        return int(float(str(value).replace(",", "").replace("$", "")))
    except ValueError:
        return 0


def infer_category(text: str, fallback: str) -> str:
    text = text.lower()
    if any(term in text for term in ["climate", "environment", "resilience", "conservation", "disaster", "water"]):
        return "climate"
    if any(term in text for term in ["youth", "education", "training", "student", "school", "workforce"]):
        return "youth"
    if any(term in text for term in ["digital", "technology", "data", "innovation", "cyber"]):
        return "digital"
    if any(term in text for term in ["health", "mental", "wellbeing", "suicide"]):
        return "health"
    if any(term in text for term in ["culture", "heritage", "archive", "museum", "history"]):
        return "culture"
    return fallback


def estimate_match(text: str) -> int:
    score = 55
    terms = [
        "caribbean", "trinidad", "tobago", "island", "sids", "climate", "resilience",
        "community", "youth", "digital", "data", "health", "mental", "education",
        "environment", "culture", "heritage", "nonprofit", "ngo",
    ]
    lower = text.lower()
    for term in terms:
        if term in lower:
            score += 4
    return min(score, 94)


def estimate_risk(text: str) -> str:
    lower = text.lower()
    if any(term in lower for term in ["cooperative agreement", "infrastructure", "research center", "federal", "multi-year"]):
        return "High"
    if any(term in lower for term in ["community", "youth", "small business", "training", "education"]):
        return "Low"
    return "Medium"


def estimate_effort(text: str) -> str:
    lower = text.lower()
    if any(term in lower for term in ["research", "infrastructure", "cooperative agreement", "multi-year", "consortium"]):
        return "High"
    return "Medium"


def estimate_readiness(risk: str) -> int:
    return {"Low": 76, "Medium": 62, "High": 45}.get(risk, 55)


def make_source_url(item: Dict[str, Any]) -> str:
    opp_id = first_present(item, ["id", "oppId", "opportunityId", "opportunityNumber", "number", "oppNumber"], "")
    if opp_id:
        return f"https://www.grants.gov/search-results-detail/{opp_id}"
    return "https://www.grants.gov/search-grants"


def normalize(item: Dict[str, Any], area: Dict[str, str]) -> Dict[str, Any]:
    title = first_present(item, ["title", "oppTitle", "opportunityTitle", "opportunityTitleText"], "Untitled Opportunity")
    organization = first_present(item, ["agencyName", "agency", "agencyCode", "agencyFullName"], "Grants.gov")
    close_date = first_present(item, ["closeDate", "closeDateStr", "responseDate", "deadline"], "Check source")

    min_funding = to_number(first_present(item, ["awardFloor", "floor", "estimatedAwardFloor"], 0))
    max_funding = to_number(first_present(item, ["awardCeiling", "ceiling", "estimatedTotalProgramFunding", "awardAmount"], 0))

    combined_text = f"{title} {organization} {json.dumps(item)[:500]}"
    category = infer_category(combined_text, area["category"])
    risk = estimate_risk(combined_text)
    effort = estimate_effort(combined_text)

    return {
        "title": title,
        "organization": organization,
        "category": category,
        "match": estimate_match(combined_text),
        "deadline": close_date,
        "currency": "USD",
        "minFunding": min_funding,
        "maxFunding": max_funding,
        "risk": risk,
        "effort": effort,
        "readiness": estimate_readiness(risk),
        "status": "Live Source",
        "sourceName": "Grants.gov",
        "sourceArea": area["label"],
        "sourceUrl": make_source_url(item),
        "countryEligibility": ["Verify official source"],
        "badges": ["Live Source", "Verify Eligibility", "Check Official Link", area["label"]],
        "requirements": [
            "Review official opportunity page",
            "Confirm Trinidad & Tobago / Caribbean eligibility",
            "Check applicant type requirements",
            "Verify deadline and funding terms",
        ],
        "why": f"Pulled from Grants.gov under {area['why']}. Relevance is estimated from public metadata and must be reviewed.",
        "caution": "This is a real public opportunity record, but eligibility for Trinidad & Tobago or Caribbean applicants is not guaranteed. Verify the official source before acting.",
        "nextStep": "Open Source",
    }


def fetch_area(area: Dict[str, str], rows: int = 20) -> List[Dict[str, Any]]:
    payload = {
        "rows": rows,
        "keyword": area["keyword"],
        "oppStatuses": "forecasted|posted",
    }
    data = post_json(API_URL, payload)
    hits = extract_hits(data)
    return [normalize(hit, area) for hit in hits]


def dedupe(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    unique: List[Dict[str, Any]] = []

    for record in records:
        key = (record.get("sourceUrl"), record.get("title"), record.get("organization"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)

    return sorted(unique, key=lambda item: (-(item.get("match") or 0), item.get("deadline") or ""))


def write_payload(records: List[Dict[str, Any]], errors: List[str]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "meta": {
            "generated_at": now,
            "source": "Grants.gov search2",
            "records_count": len(records),
            "areas_pulled": [area["label"] for area in SEARCH_AREAS],
            "errors": errors,
            "exchange_rates": EXCHANGE_RATES_TO_TTD,
            "exchange_rate_note": "Static MVP estimate. Replace with live Central Bank or trusted FX source later.",
        },
        "records": records,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    RAW_OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    all_records: List[Dict[str, Any]] = []
    errors: List[str] = []

    for area in SEARCH_AREAS:
        print(f"Fetching: {area['label']}")
        try:
            records = fetch_area(area)
            print(f"  records: {len(records)}")
            all_records.extend(records)
            time.sleep(1)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
            message = f"{area['label']}: {exc}"
            print(f"  ERROR: {message}", file=sys.stderr)
            errors.append(message)

    unique_records = dedupe(all_records)
    write_payload(unique_records, errors)

    print(f"Wrote {len(unique_records)} records to {OUTPUT_PATH}")
    if errors:
        print("Completed with errors:")
        for error in errors:
            print(f"- {error}")

    # Return success as long as output was written. This avoids breaking the website
    # if one source area fails but others succeed.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
