export type AisleId =
  | "soc"
  | "iam"
  | "endpoint"
  | "network"
  | "cloud_app"
  | "vuln"
  | "ir"
  | "grc"
  | "privacy"
  | "ai"
  | "advisory";

export const AISLES: Array<{ id: AisleId; label: string }> = [
  { id: "soc", label: "SOC & Threat Detection" },
  { id: "iam", label: "Identity & Access Management" },
  { id: "endpoint", label: "Endpoint Security" },
  { id: "network", label: "Network Security" },
  { id: "cloud_app", label: "Cloud & Application Security" },
  { id: "vuln", label: "Vulnerability Management" },
  { id: "ir", label: "Incident Response & Forensics" },
  { id: "grc", label: "Governance, Risk & Compliance" },
  { id: "privacy", label: "Data Protection & Privacy" },
  { id: "ai", label: "AI Security" },
  { id: "advisory", label: "Security Awareness & Advisory" },
];
