import type { SCMChangeEvidenceInput, SCMChangeEvidenceResult } from "./schemas.js";

export type SCMProviderErrorCode = "unavailable" | "malformed" | "permission" | "unsupported";

export class SCMProviderError extends Error {
  constructor(readonly code: SCMProviderErrorCode) {
    super(`SCM provider ${code}`);
    this.name = "SCMProviderError";
  }
}

export interface SCMReadProvider {
  getChangeEvidence(input: SCMChangeEvidenceInput): Promise<SCMChangeEvidenceResult>;
  getRepositoryEvidence(input: SCMChangeEvidenceInput): Promise<SCMChangeEvidenceResult>;
}

export interface SCMRepositoryEvidencePort extends SCMReadProvider {}
export type SCMRepositoryEvidenceProvider = SCMReadProvider;
