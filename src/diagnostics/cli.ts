#!/usr/bin/env node

import process from "node:process";
import { diagnoseRuntimeConfiguration } from "./config-diagnostics.js";
import { parseDoctorArguments } from "./doctor.js";

export const DOCTOR_USAGE = "Usage: pak-satpam-doctor --config PATH --mcp-token PATH [--grafana-token PATH]";

try {
  if (process.argv.length === 3 && process.argv[2] === "--help") {
    process.stdout.write(`${DOCTOR_USAGE}\n`);
  } else {
    const result = diagnoseRuntimeConfiguration(parseDoctorArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "doctor failed"}\n${DOCTOR_USAGE}\n`);
  process.exitCode = 2;
}
