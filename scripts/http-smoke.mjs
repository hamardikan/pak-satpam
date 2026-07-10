import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const endpoint = new URL(process.argv[2]);
const token = readFileSync(process.argv[3], "utf8").trim();
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "http-runtime-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 7);
  assert(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true));
  const result = CallToolResultSchema.parse(
    await client.callTool({
      name: "observability.health_snapshot",
      arguments: { services: ["smoke-service"] },
    }),
  );
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent?.freshness, "unknown");
  const data = result.structuredContent?.data;
  assert(data && typeof data === "object" && Array.isArray(data.targets));
  assert.equal(data.targets[0]?.status, "unknown");
  process.stdout.write("http_runtime_smoke=ok\n");
} finally {
  await client.close();
}
