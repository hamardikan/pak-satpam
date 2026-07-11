export interface CIAllowlist {
  readonly workflowsByRepository: Readonly<Record<string, readonly string[]>>;
}

export function createCIAllowlist(workflowsByRepository: Record<string, readonly string[]>): CIAllowlist {
  return {
    workflowsByRepository: Object.fromEntries(
      Object.entries(workflowsByRepository).map(([repo, workflows]) => [repo, [...new Set(workflows)]]),
    ),
  };
}

export function isCIResourceAllowed(policy: CIAllowlist, repo: string, workflow: string): boolean {
  return policy.workflowsByRepository[repo]?.includes(workflow) ?? false;
}

export function assertCIResourceAllowed(policy: CIAllowlist, repo: string, workflow: string): void {
  if (!isCIResourceAllowed(policy, repo, workflow)) throw new Error("ci_policy_denied");
}
