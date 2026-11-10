import { ancestorOfType, type FrameworkElement } from "@/lib/catalog/framework";

/** Explicit assessment codes. Unmapped is the absence of one of these, not a fourth choice. */
export const COVERAGE_CODES = ["full", "partial", "none"] as const;

export type ExplicitCoverage = (typeof COVERAGE_CODES)[number];

export type OutcomeStatus = ExplicitCoverage | "unmapped";

export const COVERAGE_RANK: Record<ExplicitCoverage, number> = {
  full: 3,
  partial: 2,
  none: 1,
};

/**
 * Workspace outcome status is the strongest explicit assessment on an active service.
 * Full outranks Partial, which outranks None. Assessments are not added, averaged, or
 * turned into a maturity percentage. Archived and missing services do not count.
 */
export const AGGREGATION_SUMMARY =
  "Each outcome uses the strongest explicit assessment on an active service: Full, then Partial, then None. Unmapped means no active service has an assessment. Archived services, deleted services, blueprint hints, the Primary CSF Function dropdown, and CMMI or capability rating are excluded. Counts are outcomes in the CSF 2.0 core. They are not a maturity score, a blended percentage, or a certification.";

export type CoverageCounts = Record<OutcomeStatus, number>;

export type CoverageContribution = {
  mappingId: string;
  serviceId: string;
  coverage: ExplicitCoverage;
};

export type OutcomeAssessment = {
  element: FrameworkElement;
  status: OutcomeStatus;
  contributions: CoverageContribution[];
  /** Active-service assessments were absent, but archived services still have rows. */
  excludedArchived: number;
};

export type CoverageMappingRef = {
  id: string;
  tenant_id: string;
  service_id: string;
  element_id: string;
  coverage: string;
};

export type CoverageServiceRef = {
  id: string;
  tenant_id: string;
  archived_at: string | null;
};

export function isExplicitCoverage(value: string): value is ExplicitCoverage {
  return value === "full" || value === "partial" || value === "none";
}

export function emptyCounts(): CoverageCounts {
  return { full: 0, partial: 0, none: 0, unmapped: 0 };
}

export function aggregateCoverage(input: {
  elements: readonly FrameworkElement[];
  mappings: readonly CoverageMappingRef[];
  services: readonly CoverageServiceRef[];
  tenantId: string;
  /** When set, other frameworks in `elements` do not change this denominator. */
  frameworkId?: string;
}): { outcomes: OutcomeAssessment[]; counts: CoverageCounts; denominator: number } {
  const services = new Map(input.services.filter((service) => service.tenant_id === input.tenantId).map((service) => [service.id, service]));
  const byElement = new Map<string, CoverageMappingRef[]>();
  for (const mapping of input.mappings) {
    if (mapping.tenant_id !== input.tenantId) continue;
    const list = byElement.get(mapping.element_id) ?? [];
    list.push(mapping);
    byElement.set(mapping.element_id, list);
  }

  const outcomes: OutcomeAssessment[] = [];
  const counts = emptyCounts();
  const subcategories = input.elements
    .filter((element) => element.element_type === "subcategory")
    .filter((element) => !input.frameworkId || element.framework_id === input.frameworkId)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const element of subcategories) {
    const contributions: CoverageContribution[] = [];
    let excludedArchived = 0;
    for (const mapping of byElement.get(element.id) ?? []) {
      const service = services.get(mapping.service_id);
      if (!service) continue;
      if (!isExplicitCoverage(mapping.coverage)) continue;
      if (service.archived_at) {
        excludedArchived += 1;
        continue;
      }
      contributions.push({
        mappingId: mapping.id,
        serviceId: service.id,
        coverage: mapping.coverage,
      });
    }
    contributions.sort((a, b) => COVERAGE_RANK[b.coverage] - COVERAGE_RANK[a.coverage] || a.serviceId.localeCompare(b.serviceId));
    const status: OutcomeStatus = contributions[0]?.coverage ?? "unmapped";
    counts[status] += 1;
    outcomes.push({ element, status, contributions, excludedArchived });
  }

  return { outcomes, counts, denominator: subcategories.length };
}

export type DashboardFocus =
  | { kind: "status"; status: OutcomeStatus }
  | { kind: "function"; code: string };

/** Outcomes for the one open dashboard panel. A status slice is exactly that box's count. */
export function dashboardOutcomes(
  outcomes: readonly OutcomeAssessment[],
  elements: readonly FrameworkElement[],
  focus: DashboardFocus,
): OutcomeAssessment[] {
  if (focus.kind === "status") return outcomes.filter((outcome) => outcome.status === focus.status);
  return outcomes.filter((outcome) => ancestorOfType(outcome.element, "function", elements)?.code === focus.code);
}

export type CoverageFilter = {
  query: string;
  functionCode: string | null;
  categoryCode: string | null;
  /** `attention` is partial, none, and unmapped together. It is a filter, not a status. */
  status: OutcomeStatus | "attention" | null;
};

export function outcomeMatches(
  outcome: OutcomeAssessment,
  elements: readonly FrameworkElement[],
  filter: CoverageFilter,
  serviceText: string,
): boolean {
  if (filter.status === "attention") {
    if (outcome.status === "full") return false;
  } else if (filter.status && outcome.status !== filter.status) {
    return false;
  }
  const category = ancestorOfType(outcome.element, "category", elements);
  const fn = ancestorOfType(outcome.element, "function", elements);
  if (filter.functionCode && fn?.code !== filter.functionCode) return false;
  if (filter.categoryCode && category?.code !== filter.categoryCode) return false;
  const query = filter.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = [outcome.element.code, outcome.element.title, outcome.element.statement, category?.code, category?.title, category?.statement, fn?.code, fn?.title, serviceText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function countsFor(outcomes: readonly OutcomeAssessment[]): CoverageCounts {
  const counts = emptyCounts();
  for (const outcome of outcomes) counts[outcome.status] += 1;
  return counts;
}
