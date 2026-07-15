import assert from "node:assert/strict";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { assertToolSurface } from "./assert-tool-surface.mjs";

const [image, platform] = process.argv.slice(2);
assert(image, "container image is required");
assert(platform === "linux/amd64" || platform === "linux/arm64", "container platform must be linux/amd64 or linux/arm64");

const transport = new StdioClientTransport({
  command: "docker",
  args: ["run", "--rm", "-i", "--platform", platform, "--entrypoint", "node", image, "dist/cli.js"],
  stderr: "pipe",
});
const client = new Client({ name: "container-stdio-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assertToolSurface(tools.tools);
  assert(tools.tools.filter((tool) => tool.name.startsWith("observability.")).every((tool) => tool.annotations?.readOnlyHint === true));

  const health = CallToolResultSchema.parse(
    await client.callTool({
      name: "observability.health_snapshot",
      arguments: { services: ["api"] },
    }),
  );
  assert.equal(health.isError, undefined);
  assert.equal(health.structuredContent?.schemaVersion, "1.0");
  process.stdout.write(`container_stdio_smoke=ok platform=${platform}\n`);
} finally {
  await client.close();
}
