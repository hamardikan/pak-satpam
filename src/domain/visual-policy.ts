import type { RenderDashboardInput, RenderPanelInput } from "./tool-schemas.js";

export interface VisualAllowlistEntry {
  readonly panels: readonly string[];
}

export interface VisualAllowlist {
  readonly dashboards: Readonly<Record<string, VisualAllowlistEntry>>;
}

export const DEFAULT_SYNTHETIC_VISUAL_ALLOWLIST: VisualAllowlist = {
  dashboards: {
    "service-overview": { panels: ["request-rate"] },
  },
};

export function allowsPanel(
  policy: VisualAllowlist,
  input: Pick<RenderPanelInput, "dashboardId" | "panelId">,
): boolean {
  return policy.dashboards[input.dashboardId]?.panels.includes(input.panelId) === true;
}

export function allowsDashboard(
  policy: VisualAllowlist,
  input: Pick<RenderDashboardInput, "dashboardId">,
): boolean {
  return policy.dashboards[input.dashboardId] !== undefined;
}
