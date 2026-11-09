# V4 supporting artifacts

V4 adds a workspace registry of the documents and tools a service depends on. The catalog stores a link. It does not host the file.

## What an artifact stores

Name, type, owner team, status, version, review cadence, last reviewed, next review, link, short description, and visibility. Visibility defaults to Internal.

Type and status are `lookup_options` (`artifact_type`, `artifact_status`). Edit them in Lookups. The app does not hard-code the list. The starter types are Policy, Standard, Procedure / Runbook, Tool, and Guideline. Guideline is included because a security program often keeps recommended practice separate from a mandatory standard. Retire it if you do not use that class.

Owner team reuses the shared Teams lookup. Review cadence reuses the service cadence lookup. That is the one extra field: without it, next review could not follow the same monthly, quarterly, semi-annual, and annual rule, and On Change still produces no date. The overdue flag uses that computed date and ignores artifacts whose status code is `retired`. The retired-but-linked flag follows the code `retired`. Renaming the label is safe. Changing that code turns the flag off.

Links are many-to-many, with an optional relationship note. Add or remove them on the Artifacts page and in Supporting Artifacts on a service.

## Navigation

Artifacts is the third item: Catalog, Coverage, Artifacts, Fields, Lookups, Shop Free Blueprints. It sits with the other workspace views. Fields and Lookups stay admin tools, and Shop Free Blueprints stays last.

## Exports

Full catalog CSV, Excel (its own Artifacts sheet), Word, and PDF include artifact links for the services in the export, plus artifacts that are not linked to any service. Public files include only artifacts whose visibility is Public, and only the public columns: service name, artifact name, type, status, version, description, and link. Service code is included only when that service field is public. Owner, cadence, review dates, visibility, relationship notes, and flags stay in the full file. An internal artifact contributes no name and no URL. Jira and ServiceNow presets stay service-field mappings and do not add artifact rows.

Links must be http or https. The app will not render a `javascript:` URL.

## Import

CSV import matches the lookup importer: a template, a column map, and a preview of creates and updates. A matching name updates that artifact. Editors and admins can import. Viewers cannot.

## Blueprints

A few blueprint previews suggest typical artifact types, such as an incident response plan and a runbook. Checkout does not create those documents.
