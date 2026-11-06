import type { CatalogFilters, ServiceRecord } from "@/lib/catalog/types";

export function filterServices(services: ServiceRecord[], filters: CatalogFilters): ServiceRecord[] {
  const query = filters.query.trim().toLowerCase();
  return services.filter((service) => {
    if (filters.category && service.category !== filters.category) return false;
    if (filters.status && service.status !== filters.status) return false;
    if (filters.service_tier && service.service_tier !== filters.service_tier) return false;
    if (filters.owner_team && service.owner_team !== filters.owner_team) return false;
    if (filters.capability_rating && service.capability_rating !== filters.capability_rating) return false;
    if (!query) return true;
    const haystack = [service.service_code, service.name, service.internal_name, service.summary, service.service_owner]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}
