#!/usr/bin/env node

import process from "node:process";
import {
  ApprovalTokenService,
  InMemoryApprovalAuditStore,
  MAX_APPROVAL_TTL_SECONDS,
} from "./ci/approval.js";

interface ApprovalCliOptions {
  readonly keyFile: string;
  readonly repo: string;
  readonly workflow: string;
  readonly runId: string;
  readonly runAttempt: number;
  readonly headSha: string;
  readonly requestId: string;
  readonly ttlSeconds: number;
}

const USAGE = "Usage: observability-agent-mcp-approval --key-file PATH --repo OWNER/REPO --workflow FILE --run-id ID --run-attempt N --head-sha SHA --request-id ID --ttl-seconds SECONDS";

try {
  const options = parseArguments(process.argv.slice(2));
  const service = new ApprovalTokenService({
    key: ApprovalTokenService.readKeyFile(options.keyFile),
    clock: () => new Date(),
    audit: new InMemoryApprovalAuditStore(),
  });
  const token = service.issue({
    repo: options.repo,
    workflow: options.workflow,
    runId: options.runId,
    runAttempt: options.runAttempt,
    headSha: options.headSha,
    requestId: options.requestId,
    ttlSeconds: options.ttlSeconds,
  });
  process.stdout.write(`${token}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "approval issuance failed"}\n${USAGE}\n`);
  process.exitCode = 1;
}

function parseArguments(arguments_: readonly string[]): ApprovalCliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") throw new Error(USAGE);
    if (argument === undefined || !argument.startsWith("--")) throw new Error("unknown approval argument");
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${argument}`);
    if (values.has(argument)) throw new Error(`duplicate argument ${argument}`);
    values.set(argument, value);
    index += 1;
  }

  const keyFile = required(values, "--key-file");
  const repo = required(values, "--repo");
  const workflow = required(values, "--workflow");
  const runId = required(values, "--run-id");
  const runAttempt = parseInteger(required(values, "--run-attempt"), "--run-attempt");
  const headSha = required(values, "--head-sha");
  const requestId = required(values, "--request-id");
  const ttlSeconds = parseInteger(required(values, "--ttl-seconds"), "--ttl-seconds");
  const supported = new Set(["--key-file", "--repo", "--workflow", "--run-id", "--run-attempt", "--head-sha", "--request-id", "--ttl-seconds"]);
  for (const argument of values.keys()) {
    if (!supported.has(argument)) throw new Error(`unknown approval argument ${argument}`);
  }
  if (!/^\d{1,20}$/.test(runId)) throw new Error("--run-id must be a numeric GitHub run ID");
  if (runAttempt < 1 || runAttempt > 100) throw new Error("--run-attempt must be between 1 and 100");
  if (!/^[a-f0-9]{40}$/.test(headSha)) throw new Error("--head-sha must be a lowercase 40-character SHA");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_APPROVAL_TTL_SECONDS) {
    throw new Error(`--ttl-seconds must be between 1 and ${MAX_APPROVAL_TTL_SECONDS}`);
  }
  return { keyFile, repo, workflow, runId, runAttempt, headSha, requestId, ttlSeconds };
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) throw new Error(`missing required argument ${name}`);
  return value;
}

function parseInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is too large`);
  return parsed;
}
