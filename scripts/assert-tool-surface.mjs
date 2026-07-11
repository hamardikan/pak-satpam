import assert from "node:assert/strict";

const BASE_TOOLS = [
  "observability.capabilities",
  "observability.health_snapshot",
  "observability.active_alerts",
  "observability.query_metrics",
  "observability.render_panel",
  "observability.render_dashboard",
  "observability.incident_context",
];

const CI_TOOLS = [
  "ci.workflow_status",
  "ci.failed_job_analysis",
  "ci.log_evidence",
  "ci.remediation_plan",
  "ci.rerun_failed_workflow",
];

export function assertToolSurface(tools) {
  const names = tools.map((tool) => tool.name);
  const ciNames = names.filter((name) => name.startsWith("ci."));
  assert.deepEqual(names.filter((name) => !name.startsWith("ci.")), BASE_TOOLS);
  assert(ciNames.length === 0 || ciNames.length === CI_TOOLS.length, `unexpected optional CI tool count: ${ciNames.length}`);
  if (ciNames.length > 0) {
    assert.deepEqual(ciNames, CI_TOOLS);
    const rerun = tools.find((tool) => tool.name === "ci.rerun_failed_workflow");
    assert.deepEqual(rerun?.annotations, {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  }
}
