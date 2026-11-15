import type { Role } from "@/lib/catalog/types";

export function canWriteServices(role: Role | null): boolean {
  return role === "platform_owner" || role === "tenant_admin" || role === "editor";
}

export function canAdminister(role: Role | null): boolean {
  return role === "platform_owner" || role === "tenant_admin";
}

export function canProvision(role: Role | null): boolean {
  return role === "platform_owner" || role === "tenant_admin";
}

export function canGrantPlatformOwner(role: Role | null): boolean {
  return role === "platform_owner";
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "platform_owner":
      return "Platform owner";
    case "tenant_admin":
      return "Admin";
    case "editor":
      return "Editor";
    case "viewer":
      return "Viewer";
    case "service_manager":
      return "Service Manager";
  }
}
