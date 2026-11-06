# V3 frameworks and exports

V3 keeps the NIST CSF 2.0 core from V2. No other control text is seeded.

## Why the other frameworks are empty

| Code | Publication | Why it is not seeded |
| --- | --- | --- |
| ISO-27001 2022 | ISO/IEC 27001:2022 | Licensed ISO text. Not reproduced. |
| SOC2-TSC 2017 | AICPA TSP section 100 | Copyrighted criteria. Not reproduced. |
| CIS-V8 8 | CIS Controls v8 | Licensed CIS text. Not reproduced. |
| HIPAA-SR 45-CFR-164 | 45 CFR Part 164 Subpart C | Public regulation. This release does not ship a reconstructed control list. |
| NIST-AI-RMF 1.0 | NIST AI 100-1 | Public NIST publication. An unverified copy is not included. |
| NIST-PF 1.0 | NIST Privacy Framework 1.0 | Public NIST publication. An unverified copy is not included. |

A workspace admin can import an authorized CSV with columns `id`, `parent`, `title`, `outcome`, and `version`. The version must match the selected framework. Rows stay in that workspace. NIST CSF 2.0 cannot be replaced through this importer. Coverage counts use only the selected framework’s subcategory outcomes. There is no generated crosswalk.

The NIST CSF 2.0 provenance is unchanged in [nist-csf-2.0-provenance.md](nist-csf-2.0-provenance.md).

## Exports

Files are built locally. A logo is embedded only when it is already an inline PNG or JPEG. HTTP logo URLs are not fetched. PDF text uses the SIL Open Font License Liberation fonts in `public/fonts`. Characters those fonts do not contain are replaced in the PDF so the file still opens. Word keeps the original characters.

Spreadsheet cells that start with `=`, `+`, `-`, `@`, or a tab are prefixed so the spreadsheet treats them as text.
