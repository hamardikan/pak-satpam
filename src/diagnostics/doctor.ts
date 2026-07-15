export interface DoctorCliOptions {
  readonly configPath: string;
  readonly mcpTokenPath: string;
  readonly grafanaTokenPath?: string;
}

export function parseDoctorArguments(arguments_: readonly string[]): DoctorCliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === undefined || !argument.startsWith("--")) throw new Error("unknown doctor argument");
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${argument}`);
    if (values.has(argument)) throw new Error(`duplicate argument ${argument}`);
    values.set(argument, value);
    index += 1;
  }

  const supported = new Set(["--config", "--mcp-token", "--grafana-token"]);
  for (const argument of values.keys()) {
    if (!supported.has(argument)) throw new Error(`unknown doctor argument ${argument}`);
  }
  const configPath = required(values, "--config");
  const mcpTokenPath = required(values, "--mcp-token");
  const grafanaTokenPath = values.get("--grafana-token");
  return grafanaTokenPath === undefined
    ? { configPath, mcpTokenPath }
    : { configPath, mcpTokenPath, grafanaTokenPath };
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) throw new Error(`missing required argument ${name}`);
  return value;
}
