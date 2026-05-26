# Grant Shelf Source Plan

## MVP live collector

The first collector pulls from Grants.gov using the public `search2` API. The API is used server-side by GitHub Actions, not from the browser.

## Thematic areas pulled

1. Climate / Environment / Resilience
   - climate
   - environment
   - resilience
   - conservation
   - disaster

2. Youth / Education / Skills
   - youth
   - education
   - training
   - workforce
   - skills

3. Digital / Data / Civic Technology
   - digital
   - data
   - technology
   - innovation
   - cybersecurity

4. Health / Mental Health / Community Support
   - health
   - mental health
   - community health
   - suicide
   - wellbeing

5. Culture / Archives / Heritage
   - culture
   - heritage
   - archive
   - museum
   - history

6. Caribbean / SIDS / Islands
   - Caribbean
   - Trinidad
   - Tobago
   - island
   - islands
   - SIDS

## Important caution

Grants.gov contains real public opportunities, but many are U.S.-specific. Grant Shelf therefore marks records with verification warnings. Eligibility for Trinidad & Tobago or the Caribbean must be confirmed on the original funder page.

## Later connectors

Suggested future connectors:

- EU Funding & Tenders Portal API
- UNDP opportunity/procurement pages
- GEF Small Grants Programme pages
- Caribbean Development Bank opportunities
- IDB opportunities/procurement pages
- Commonwealth Foundation grants
- Embassy grant notices
- Caribbean Export Development Agency
- CCCCC opportunities

Each should have its own collector file and source-specific parser.
