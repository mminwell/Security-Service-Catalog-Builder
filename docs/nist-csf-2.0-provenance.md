# NIST CSF 2.0 core provenance

V2 seeds the NIST Cybersecurity Framework 2.0 core: Functions, Categories, and Subcategory outcomes. This catalog does not certify an organization, a service, or a control. A saved mapping is a workspace assessment.

## Publication

- Document: The NIST Cybersecurity Framework (CSF) 2.0
- Series: NIST CSWP 29
- Published: 2024-02-26
- DOI: https://doi.org/10.6028/NIST.CSWP.29

## Machine-readable source

Retrieved 2026-11-06 from the NIST CSF 2.0 Reference Tool export:

- Tool: https://csrc.nist.gov/Projects/cybersecurity-framework/Filters#/csf/filters
- File: https://csrc.nist.gov/extensions/nudp/services/json/csf/download?olirids=all
- Export change log in that file: Final
- Export generated timestamp in that file: 2026-11-06 17:35:34.123000
- SHA-256 of that downloaded workbook: `7afe88bfbad7a8ed6ac54d88d4a14715d31398367d4bf164d8b089127f808ed6`

The workbook’s generated timestamp changes when NIST’s tool builds a new file. The seeded wording is pinned by the content hash below, not by that timestamp.

The workbook has columns for Function, Category, Subcategory, Implementation Examples, and Informative References. Only the first three columns are seeded. Implementation Examples and Informative References are not outcomes and are not coverage.

## What was excluded

Rows whose statement begins with `[Withdrawn` are CSF 1.1 crosswalk notes in the same export, including withdrawn categories such as ID.BE and withdrawn subcategory numbers inside a current category. Section-closer labels such as `GOVERN (GV)` with no statement are skipped. 91 withdrawn rows were excluded. The seed is the current CSF 2.0 core: 6 functions, 22 categories, and 106 subcategory outcomes.

## Identifiers

Stable ids are UUID v5:

`uuid5(uuid5(NAMESPACE_URL, "https://doi.org/10.6028/NIST.CSWP.29"), "NIST-CSF:2.0")`

Element ids append `:` and the official code, for example `NIST-CSF:2.0:GV.OC-01`.

Framework id: `024f2c3f-f4dd-5372-8c0a-893c132c5aef`

## Content hash

SHA-256 of the canonical JSON array of `{element_type, code, parent_code, title, statement}` in core order, UTF-8, no extra whitespace:

`1104ec7ac38bab958c2159083bd7240a8261647447cf77ada39f73204a2693b8`

The extracted core lives in `lib/catalog/nist-csf-2.0.json`. `npm run seed:sql` copies it into `supabase/migrations/0004_v2_csf_mappings.sql` and `supabase/seed.sql`. Wording is the Reference Tool text, including straight apostrophes and spaced hyphens. It was not rewritten.

## Assessment rule

Outcome status is the strongest explicit assessment on an active service: Full, then Partial, then None. Unmapped means no active service has an assessment. None is an explicit assessment of no coverage. Unmapped is the lack of an assessment. Counts are not added into a percentage and are not a maturity score. Archived and deleted services do not count. Blueprint subcategory hints and the Primary CSF Function dropdown do not count until someone saves an assessment.
