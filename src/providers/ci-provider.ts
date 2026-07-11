import type {
  CIFailedJobAnalysisInput,
  CIFailedJobAnalysisResult,
  CILogEvidenceInput,
  CILogEvidenceResult,
  CIRerunFailedWorkflowInput,
  CIRerunFailedWorkflowResult,
  CIRemediationPlanInput,
  CIRemediationPlanResult,
  CIWorkflowStatusInput,
  CIWorkflowStatusResult,
} from "../domain/ci-schemas.js";

export type CIProviderErrorCode = "unavailable" | "malformed" | "permission";

export class CIProviderError extends Error {
  constructor(readonly code: CIProviderErrorCode) {
    super(`CI provider ${code}`);
    this.name = "CIProviderError";
  }
}

export interface CIProvider {
  getWorkflowStatus(input: CIWorkflowStatusInput): Promise<CIWorkflowStatusResult>;
  getFailedJobAnalysis(input: CIFailedJobAnalysisInput): Promise<CIFailedJobAnalysisResult>;
  getLogEvidence(input: CILogEvidenceInput): Promise<CILogEvidenceResult>;
  getRemediationPlan(input: CIRemediationPlanInput): Promise<CIRemediationPlanResult>;
  rerunFailedWorkflow(input: Omit<CIRerunFailedWorkflowInput, "requestId" | "approvalToken">): Promise<CIRerunFailedWorkflowResult>;
}

export interface CITokenProvider {
  getToken(repository: string): Promise<string>;
}
