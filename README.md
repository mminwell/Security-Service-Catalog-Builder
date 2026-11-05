# Security Service Catalog Builder

**Status: planning.** This repository is the product plan for a tool that helps security organizations develop a service catalog.

## Overview

Security Service Catalog Builder gives a security organization one catalog of the services it delivers. A team enters each service once, then uses that catalog to line services up with security frameworks and regulatory requirements, see where coverage is thin, and produce the version each audience needs.

Shared dropdown values and public or internal field visibility live with the catalog. Planned outputs include HTML and Word for people, and CSV shaped for Jira, ServiceNow, GRC tools, and other work-management software. Tools, process documents, policies, and standards link to the service they support. Framework content helps author services and identify gaps. Suggestions that come from automation wait for a person to approve them.

## Who it's for

- Security organizations — consultancies, managed security providers, and internal security teams — that keep a catalog of the services they deliver.
- Practitioners who map that catalog to security frameworks and regulatory requirements and need an honest view of coverage.
- People who publish the catalog for clients, auditors, or internal use, or who load it into a GRC tool, Jira, ServiceNow, or another work-management system.

## Key concepts

- **Service.** A security service the organization delivers. Services are captured on a data-entry form and listed in a catalog that can be searched and filtered.
- **Lookup option.** A dropdown value stored in the database. Each row records the field it belongs to, a code, a label, a sort order, and whether it is active. A small admin page edits these rows.
- **Field definition.** The definition of a catalog field, including a public or internal visibility flag. Visibility is part of the model from the first version, so every later export can respect it.
- **Coverage.** How completely a service addresses a framework control: full, partial, or none. Controls with no covering service show up as gaps.
- **Export profile.** A saved audience — Client, Auditor, or Internal — and the fields that audience receives. Client and Auditor profiles include public fields. The Internal profile includes public and internal fields.
- **Artifact.** A tool, process document, policy, or standard linked to a service. Each link has an owner and a review date, and a stale flag when the review date has passed.
- **Tenant.** A client workspace. Each tenant's rows are isolated from every other tenant.

## Roadmap

Versions ship in this order.

### V1 — Catalog core

- Service data-entry form.
- Catalog list with search and filter.
- Dropdown values stored in a database lookup table (`field`, `code`, `label`, `sort_order`, `active`), with a small admin page to edit them.
- Field definitions with public and internal visibility flags from day one.
- Basic CSV export.

### V2 — Frameworks

- Load NIST CSF 2.0 first.
- Map services to controls with coverage (full, partial, or none).
- Gap view of uncovered controls.
- Coverage dashboard.

### V3 — Audience exports

- Saved export profiles (Client, Auditor, Internal) that produce HTML and Word.
- Field-level selection on each profile. Client and Auditor profiles include public fields. The Internal profile includes public and internal fields.
- CSV column mappings for Jira, ServiceNow, and GRC tools.
- More frameworks: ISO 27001, SOC 2, CIS v8, HIPAA, and other regulatory requirements.

### V4 — Governance links

- Link tools, process documents, policies, and standards to services.
- Owners and review dates on those links.
- Stale flags when a linked item is past its review date.

### V5 — AI assist

- Suggest control mappings.
- Identify gaps.
- Draft service descriptions.
- A person approves every suggestion before it is saved.

## Planned architecture

The product is multi-tenant from the start. Each client workspace is a tenant, and tenant data is isolated with row-level security.

- **Web app.** Next.js, hosted on Vercel.
- **Database.** Hosted Postgres (Supabase).
- **Access.** Authentication for users, and an audit trail of changes.

### Core tables

| Table | Purpose |
| --- | --- |
| `tenants` | Client workspaces |
| `services` | Catalog entries |
| `lookup_options` | Dropdown values: field, code, label, sort order, and active flag |
| `field_definitions` | Catalog fields and their public or internal visibility |
| `export_profiles` | Saved audience exports and the fields each profile includes |
| `frameworks` | Security frameworks loaded for a tenant |
| `controls` | Controls that belong to a framework |
| `service_control_map` | Service-to-control mappings and coverage |
| `artifacts` | Tools, process documents, policies, and standards |
| `service_artifact_links` | Links from a service to an artifact |

## Status

**Status: planning.** The roadmap and architecture above are the agreed direction for Security Service Catalog Builder. This repository holds that plan.
