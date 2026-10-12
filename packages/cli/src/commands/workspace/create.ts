import type { Command } from "commander";
import { connectToDaemon, getDaemonHost } from "../../utils/client.js";
import type { CommandError, CommandOptions, SingleResult } from "../../output/index.js";
import type { WorkspaceSecondaryWorktreeInput } from "@getpaseo/protocol/messages";
import { toWorkspaceRow, workspaceSchema, type WorkspaceRow } from "./shared.js";

export interface WorkspaceCreateOptions extends CommandOptions {
  isolation?: string;
  path?: string;
  project?: string;
  title?: string;
  mode?: string;
  worktreeSlug?: string;
  newBranch?: string;
  base?: string;
  branch?: string;
  prNumber?: string;
  forge?: string;
  linkRepo?: string[];
  linkBase?: string[];
}

interface WorktreeSourceBase {
  kind: "worktree";
  cwd?: string;
  projectId?: string;
  worktreeSlug?: string;
}

function assertOptionsAbsent(values: unknown[], message: string): void {
  if (values.some((value) => value !== undefined)) {
    throw new Error(message);
  }
}

/**
 * Fork multi-repo (#3254): builds one secondary worktree input per --link-repo.
 * Entries are local paths (checked out by directory) or `project:<id>` for a
 * registered project. --link-base pairs positionally; a count mismatch is a
 * CLI error so the user finds out before any worktree is cut.
 */
export function buildSecondaryWorktreeInputs(
  options: Pick<WorkspaceCreateOptions, "linkRepo" | "linkBase">,
): WorkspaceSecondaryWorktreeInput[] | undefined {
  const repos = options.linkRepo ?? [];
  const bases = options.linkBase ?? [];
  if (repos.length === 0) {
    if (bases.length > 0) {
      throw new Error("--link-base requires --link-repo");
    }
    return undefined;
  }
  if (bases.length > 0 && bases.length !== repos.length) {
    throw new Error(
      `--link-base count (${bases.length}) must match --link-repo count (${repos.length})`,
    );
  }
  const inputs: WorkspaceSecondaryWorktreeInput[] = [];
  for (const [index, repo] of repos.entries()) {
    const trimmed = repo.trim();
    if (!trimmed) {
      throw new Error("--link-repo must not be blank");
    }
    const projectMatch = /^project:(.+)$/.exec(trimmed);
    const base = bases[index]?.trim();
    if (base !== undefined && base.length === 0) {
      throw new Error("--link-base must not be blank");
    }
    const projectId = projectMatch?.[1]?.trim();
    if (projectMatch && !projectId) {
      throw new Error("--link-repo project id must not be blank");
    }
    const input: WorkspaceSecondaryWorktreeInput = projectId ? { projectId } : { cwd: trimmed };
    if (base) {
      input.refName = base;
    }
    inputs.push(input);
  }
  return inputs;
}

function buildLocalWorkspaceSource(options: WorkspaceCreateOptions, path: string) {
  assertOptionsAbsent(
    [
      options.mode,
      options.worktreeSlug,
      options.newBranch,
      options.base,
      options.branch,
      options.prNumber,
      options.forge,
      ...(options.linkRepo ?? []),
      ...(options.linkBase ?? []),
    ],
    "Worktree options require --isolation worktree",
  );
  return {
    kind: "directory" as const,
    path,
    ...(options.project ? { projectId: options.project } : {}),
  };
}

function buildBranchOffSource(options: WorkspaceCreateOptions, source: WorktreeSourceBase) {
  assertOptionsAbsent(
    [options.branch, options.prNumber, options.forge],
    "--branch, --pr-number, and --forge require a checkout mode",
  );
  return {
    ...source,
    action: "branch-off" as const,
    ...(options.newBranch ? { branchName: options.newBranch } : {}),
    ...(options.base ? { baseBranch: options.base } : {}),
  };
}

function buildBranchCheckoutSource(options: WorkspaceCreateOptions, source: WorktreeSourceBase) {
  if (!options.branch) {
    throw new Error("--branch is required for --mode checkout-branch");
  }
  assertOptionsAbsent(
    [options.newBranch, options.base, options.prNumber, options.forge],
    "--new-branch, --base, --pr-number, and --forge are not valid for --mode checkout-branch",
  );
  return { ...source, action: "checkout" as const, refName: options.branch };
}

function buildPullRequestCheckoutSource(
  options: WorkspaceCreateOptions,
  source: WorktreeSourceBase,
) {
  if (options.prNumber === undefined || options.prNumber === "") {
    throw new Error("--pr-number is required for --mode checkout-pr");
  }
  const prNumber = Number(options.prNumber);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error("--pr-number must be a positive integer");
  }
  assertOptionsAbsent(
    [options.newBranch, options.base, options.branch],
    "--new-branch, --base, and --branch are not valid for --mode checkout-pr",
  );
  return {
    ...source,
    action: "checkout" as const,
    checkoutSource: {
      kind: "change_request" as const,
      ...(options.forge ? { forge: options.forge } : {}),
      number: prNumber,
    },
  };
}

function buildWorktreeWorkspaceSource(options: WorkspaceCreateOptions, path: string | undefined) {
  const source: WorktreeSourceBase = {
    kind: "worktree",
    ...(path ? { cwd: path } : {}),
    ...(options.project ? { projectId: options.project } : {}),
    ...(options.worktreeSlug ? { worktreeSlug: options.worktreeSlug } : {}),
  };
  switch (options.mode ?? "branch-off") {
    case "branch-off":
      return buildBranchOffSource(options, source);
    case "checkout-branch":
      return buildBranchCheckoutSource(options, source);
    case "checkout-pr":
      return buildPullRequestCheckoutSource(options, source);
    default:
      throw new Error(`Unsupported worktree mode: ${String(options.mode)}`);
  }
}

export function buildWorkspaceSource(options: WorkspaceCreateOptions) {
  if (options.isolation === "local") {
    return buildLocalWorkspaceSource(options, options.path ?? process.cwd());
  }
  if (options.isolation === "worktree") {
    const sourcePath = options.path ?? (options.project ? undefined : process.cwd());
    return buildWorktreeWorkspaceSource(options, sourcePath);
  }
  throw new Error(`Unsupported workspace isolation: ${String(options.isolation)}`);
}

export async function runCreateCommand(
  options: WorkspaceCreateOptions,
  _command: Command,
): Promise<SingleResult<WorkspaceRow>> {
  const host = getDaemonHost({ host: options.host });
  const client = await connectToDaemon({ host: options.host }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw {
      code: "DAEMON_NOT_RUNNING",
      message: `Cannot connect to daemon at ${host}: ${message}`,
    } satisfies CommandError;
  });

  try {
    const secondaryWorktrees = buildSecondaryWorktreeInputs(options);
    const payload = await client.createWorkspace({
      source: buildWorkspaceSource(options),
      ...(options.title ? { title: options.title } : {}),
      ...(secondaryWorktrees ? { secondaryWorktrees } : {}),
    });
    if (!payload.workspace) {
      throw new Error(payload.error ?? "Workspace creation failed");
    }
    return { type: "single", data: toWorkspaceRow(payload.workspace), schema: workspaceSchema };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw { code: "WORKSPACE_CREATE_FAILED", message } satisfies CommandError;
  } finally {
    await client.close().catch(() => undefined);
  }
}
