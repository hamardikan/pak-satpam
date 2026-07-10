import { readFileSync, statSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { LogicalIdSchema } from "../domain/tool-schemas.js";
import type { VisualAllowlist } from "../domain/visual-policy.js";
import { GrafanaVisualProvider } from "../providers/grafana-visual-provider.js";
import type {
  Clock,
  ObservabilityProvider,
  ObservabilityVisualProvider,
} from "../providers/observability-provider.js";
import { VictoriaMetricsProvider } from "../providers/victoriametrics-provider.js";

const MAX_CONFIG_BYTES = 256 * 1_024;

const HttpProviderSchema = z
  .object({
    type: z.string().min(1).max(64),
    base_url: z.url(),
  })
  .strict();

const QuerySchema = z
  .object({
    expression: z.string().min(1).max(4_096),
    label_keys: z.array(LogicalIdSchema).max(20).default([]),
  })
  .strict();

const NumericMatchSchema = z
  .object({
    operator: z.enum(["eq", "gt", "gte", "lt", "lte"]),
    value: z.number().finite(),
  })
  .strict();

const ServiceHealthSchema = z
  .object({
    query_template: LogicalIdSchema,
    healthy_when: NumericMatchSchema,
    degraded_when: NumericMatchSchema.optional(),
    summary: z.string().min(1).max(512).refine((value) => !/[<>]/.test(value)),
  })
  .strict();

const DashboardSchema = z
  .object({
    uid: LogicalIdSchema,
    slug: LogicalIdSchema,
    title: z.string().min(1).max(256).refine((value) => !/[<>]/.test(value)),
    panels: z
      .record(
        LogicalIdSchema,
        z.object({ id: z.number().int().min(1).max(999_999_999) }).strict(),
      )
      .refine((panels) => Object.keys(panels).length <= 50),
  })
  .strict();

const RuntimeConfigSchema = z
  .object({
    version: z.literal(1),
    providers: z
      .object({
        metrics: HttpProviderSchema.extend({ type: z.literal("prometheus-compatible") }).strict(),
        alerts: HttpProviderSchema.extend({ type: z.literal("vmalert") }).strict(),
        grafana: HttpProviderSchema.extend({ type: z.literal("grafana") }).strict(),
      })
      .strict(),
    policy: z
      .object({
        named_queries: z.record(LogicalIdSchema, QuerySchema),
        service_health: z.record(LogicalIdSchema, ServiceHealthSchema),
        dashboards: z.record(LogicalIdSchema, DashboardSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((configuration, context) => {
    for (const [serviceId, health] of Object.entries(configuration.policy.service_health)) {
      if (configuration.policy.named_queries[health.query_template] === undefined) {
        context.addIssue({
          code: "custom",
          path: ["policy", "service_health", serviceId, "query_template"],
          message: "must reference a named query",
        });
      }
    }
  });

export interface LoadRuntimeConfigurationOptions {
  readonly configPath: string;
  readonly grafanaTokenPath: string;
  readonly mcpTokenPath: string;
  readonly fetch: typeof globalThis.fetch;
  readonly clock?: Clock;
}

export class LoadedRuntimeConfiguration {
  readonly #bearerToken: string;

  constructor(
    public readonly provider: ObservabilityProvider,
    public readonly visualProvider: ObservabilityVisualProvider,
    public readonly visualAllowlist: VisualAllowlist,
    bearerToken: string,
  ) {
    this.#bearerToken = bearerToken;
  }

  get bearerToken(): string {
    return this.#bearerToken;
  }
}

export function loadRuntimeConfiguration(
  options: LoadRuntimeConfigurationOptions,
): LoadedRuntimeConfiguration {
  const document = readBoundedFile(options.configPath, false);
  let raw: unknown;
  try {
    raw = parseYaml(document);
  } catch {
    throw new Error("Invalid runtime configuration");
  }
  const parsed = RuntimeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid runtime configuration");
  }

  const grafanaToken = readBoundedFile(options.grafanaTokenPath, true).trim();
  const bearerToken = readBoundedFile(options.mcpTokenPath, true).trim();
  if (grafanaToken.length < 16 || bearerToken.length < 16) {
    throw new Error("Runtime secret is missing or too short");
  }

  const configuration = parsed.data;
  const queryTemplates = Object.fromEntries(
    Object.entries(configuration.policy.named_queries).map(([name, query]) => [
      name,
      { expression: query.expression, labelKeys: query.label_keys },
    ]),
  );
  const serviceHealth = Object.fromEntries(
    Object.entries(configuration.policy.service_health).map(([name, health]) => [
      name,
      {
        queryTemplate: health.query_template,
        healthyWhen: health.healthy_when,
        ...(health.degraded_when === undefined
          ? {}
          : { degradedWhen: health.degraded_when }),
        summary: health.summary,
      },
    ]),
  );
  const provider = new VictoriaMetricsProvider({
    baseUrl: configuration.providers.metrics.base_url,
    alertsBaseUrl: configuration.providers.alerts.base_url,
    fetch: options.fetch,
    queryTemplates,
    serviceHealth,
    visualsEnabled: true,
    dashboardRefs: Object.entries(configuration.policy.dashboards).map(
      ([dashboardId, dashboard]) => ({ dashboardId, title: dashboard.title }),
    ),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  const panels: Record<string, string> = {};
  const dashboards: Record<string, string> = {};
  const allowlistDashboards: Record<string, { panels: string[] }> = {};
  for (const [dashboardId, dashboard] of Object.entries(configuration.policy.dashboards)) {
    const basePath = `${encodeURIComponent(dashboard.uid)}/${encodeURIComponent(dashboard.slug)}`;
    dashboards[dashboardId] = `/render/d/${basePath}`;
    allowlistDashboards[dashboardId] = { panels: Object.keys(dashboard.panels) };
    for (const [panelId, panel] of Object.entries(dashboard.panels)) {
      panels[`${dashboardId}:${panelId}`] = `/render/d-solo/${basePath}?panelId=${String(panel.id)}`;
    }
  }
  const visualProvider = new GrafanaVisualProvider({
    baseUrl: configuration.providers.grafana.base_url,
    token: grafanaToken,
    fetch: options.fetch,
    panels,
    dashboards,
  });

  return new LoadedRuntimeConfiguration(
    provider,
    visualProvider,
    { dashboards: allowlistDashboards },
    bearerToken,
  );
}

function readBoundedFile(path: string, secret: boolean): string {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_CONFIG_BYTES) {
    throw new Error(secret ? "Invalid secret file" : "Invalid runtime configuration");
  }
  if (secret && (metadata.mode & 0o077) !== 0) {
    throw new Error("Secret file permissions are too broad");
  }
  return readFileSync(path, "utf8");
}
