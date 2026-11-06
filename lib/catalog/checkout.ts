import { nextReviewDate } from "@/lib/catalog/compute";
import { blueprintById, type Blueprint } from "@/lib/catalog/blueprints";
import { buildService } from "@/lib/catalog/service";
import { suggestServiceCode } from "@/lib/catalog/service-code";
import type { ServiceCodeMode, ServiceRecord } from "@/lib/catalog/types";

export type CheckoutPlanInput = {
  tenantId: string;
  blueprintIds: readonly string[];
  mode: ServiceCodeMode;
  status: string;
  ownerTeam: string;
  deliveryTeam: string | null;
  existingCodes: readonly string[];
  prefixForCategory: (category: string) => string | null;
  reviewedOn: string;
  now: string;
  idFor?: (blueprintId: string, index: number) => string;
};

export function planBlueprintCheckout(input: CheckoutPlanInput): ServiceRecord[] {
  const owner = input.ownerTeam.trim();
  if (!owner) throw new Error("Choose a default owner team before adding services.");
  const status = input.status.trim() || "draft";
  const deliveryOverride = input.deliveryTeam?.trim() ? input.deliveryTeam.trim() : null;
  const codes = [...input.existingCodes];
  const services: ServiceRecord[] = [];

  input.blueprintIds.forEach((blueprintId, index) => {
    const blueprint = blueprintById(blueprintId);
    if (!blueprint) return;
    const prefix = input.prefixForCategory(blueprint.category);
    const serviceCode = suggestServiceCode({
      existingCodes: codes,
      mode: input.mode,
      categoryPrefix: prefix,
    });
    codes.push(serviceCode);
    const reviewed = nextReviewDate(input.reviewedOn, blueprint.review_cadence) ? input.reviewedOn : null;
    const record = buildService(
      input.tenantId,
      {
        id: input.idFor?.(blueprint.id, index) ?? crypto.randomUUID(),
        service_code: serviceCode,
        name: blueprint.name,
        category: blueprint.category,
        status,
        service_tier: blueprint.service_tier,
        summary: blueprint.summary,
        owner_team: owner,
        description: stampedDescription(blueprint),
        in_scope: blueprint.in_scope,
        out_of_scope: blueprint.out_of_scope,
        deliverables: blueprint.deliverables,
        prerequisites: blueprint.prerequisites,
        delivery_team: deliveryOverride ?? blueprint.suggested_delivery_team,
        delivery_model: blueprint.delivery_model,
        target_audience: blueprint.target_audience,
        intake_method: blueprint.intake_method,
        approval_required: blueprint.approval_required,
        approver: blueprint.approver,
        lead_time: blueprint.lead_time,
        hours_of_coverage: blueprint.hours_of_coverage,
        sla_response_target: blueprint.sla_response_target,
        sla_resolution_target: blueprint.sla_resolution_target,
        primary_csf_function: blueprint.primary_csf_function,
        threats_addressed: blueprint.threats_addressed,
        data_classification_handled: blueprint.data_classification_handled,
        kpis_and_metrics: blueprint.kpis_and_metrics,
        review_cadence: blueprint.review_cadence,
        last_reviewed_date: reviewed,
        internal_name: null,
        support_contact: null,
        current_tooling_notes: null,
        third_party_providers: null,
        internal_notes: null,
      },
      input.now,
    );
    services.push({
      ...record,
      custom_fields: {
        blueprint_id: blueprint.id,
        escalation_path: blueprint.escalation_path,
        nist_csf_subcategories: blueprint.nist_csf,
      },
    });
  });

  return services;
}

function stampedDescription(blueprint: Blueprint): string {
  return `${blueprint.description}\n\nEscalation: ${blueprint.escalation_path}`;
}
