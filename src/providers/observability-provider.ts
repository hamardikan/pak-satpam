import type {
  ActiveAlertsInput,
  ActiveAlertsResult,
  CapabilitiesInput,
  CapabilitiesResult,
  HealthSnapshotInput,
  HealthSnapshotResult,
  IncidentContextInput,
  IncidentContextResult,
  QueryMetricsInput,
  QueryMetricsResult,
  RenderDashboardInput,
  RenderPanelInput,
} from "../domain/tool-schemas.js";

export interface ObservabilityProvider {
  capabilities(input: CapabilitiesInput): Promise<CapabilitiesResult>;
  healthSnapshot(input: HealthSnapshotInput): Promise<HealthSnapshotResult>;
  activeAlerts(input: ActiveAlertsInput): Promise<ActiveAlertsResult>;
  queryMetrics(input: QueryMetricsInput): Promise<QueryMetricsResult>;
  incidentContext(input: IncidentContextInput): Promise<IncidentContextResult>;
}

export type Clock = () => Date;

/** Bounded PNG evidence suitable for a server transport layer. */
export interface VisualRenderResult {
  readonly mimeType: "image/png";
  readonly data: Uint8Array;
  readonly rawByteSize: number;
  readonly width: number;
  readonly height: number;
}

/** Optional production visual capability, kept separate from core metric evidence. */
export interface ObservabilityVisualProvider {
  renderPanel(input: RenderPanelInput): Promise<VisualRenderResult>;
  renderDashboard(input: RenderDashboardInput): Promise<VisualRenderResult>;
}
