import type { CIAllowlist } from "./policy.js";
import type { ApprovalTokenService } from "./approval.js";
import type { CIProvider } from "../providers/ci-provider.js";

export interface CIService {
  readonly provider: CIProvider;
  readonly policy: CIAllowlist;
  readonly approval: ApprovalTokenService;
}
