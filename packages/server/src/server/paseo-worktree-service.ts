import { mkdir, readdir, rename, rmdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import type { WorkspaceGitService } from "./workspace-git-service.js";
import { getRealpathAwareRelativePath } from "../utils/path.js";
import type { PersistedWorkspaceRecord } from "./workspace-registry.js";
import type { WorkspaceProvisioningService } from "./session/workspace-provisioning/workspace-provisioning-service.js";
import {
  createWorktreeCore,
  type CreateWorktreeCoreDeps,
  type CreateWorktreeCoreInput,
} from "./worktree-core.js";
import {
  mapWorkspaceRelativeCwdToWorktree,
  repairMovedPaseoWorktree,
  rollbackCreatedPaseoWorktree,
  seedPaseoConfigFile,
  validateBranchSlug,
  type WorktreeConfig,
} from "../utils/worktree.js";
import { expandTilde } from "../utils/path.js";
import { getCurrentBranch, localBranchExists, renameCurrentBranch } from "../utils/checkout-git.js";
import {
  markPaseoWorktreeFirstAgentBranchAutoNameAttempted,
  normalizeBaseRefName,
  readPaseoWorktreeMetadata,
  writePaseoWorktreeFirstAgentBranchAutoNameMetadata,
} from "../utils/worktree-metadata.js";
import type { WorktreeCreationIntent } from "./resolve-worktree-creation-intent.js";
import { resolveFirstAgentPromptTitle } from "./agent/create-agent-title.js";
import { buildAgentBranchNameSeed } from "./agent/prompt-attachments.js";
import type { FirstAgentContext } from "@getpaseo/protocol/messages";
import { runWithGitCommandPriority } from "../utils/run-git-command.js";

export interface SecondaryPaseoWorktreeInput {
  cwd?: string;
  projectId?: string;
  refName?: string;
  baseBranch?: string;
  branchName?: string;
  worktreeSlug?: string;
}

export interface SecondaryPaseoWorktreeResult {
  worktree: WorktreeConfig;
  intent: WorktreeCreationIntent;
  repoRoot: string;
  created: boolean;
  projectId: string | null;
  displayName: string;
}

export interface CreatePaseoWorktreeInput extends CreateWorktreeCoreInput {
  projectId?: string;
  title?: string;
  linkedRepoRoots?: string[];
  secondaries?: SecondaryPaseoWorktreeInput[];
}

export interface CreatePaseoWorktreeResult {
  worktree: WorktreeConfig;
  intent: WorktreeCreationIntent;
  workspace: PersistedWorkspaceRecord;
  repoRoot: string;
  created: boolean;
  secondaries: SecondaryPaseoWorktreeResult[];
}

export type CreatePaseoWorktreeFn = (
  input: CreatePaseoWorktreeInput,
  options?: {
    resolveDefaultBranch?: (repoRoot: string) => Promise<string>;
  },
) => Promise<CreatePaseoWorktreeResult>;

export interface AttemptFirstAgentBranchAutoNameResult {
  attempted: boolean;
  renamed: boolean;
  branchName: string | null;
}

export interface CreatePaseoWorktreeDeps extends CreateWorktreeCoreDeps {
  workspaceGitService: WorkspaceGitService;
  workspaceProvisioning: Pick<WorkspaceProvisioningService, "createWorkspaceForWorktree">;
}

export async function createPaseoWorktree(
  input: CreatePaseoWorktreeInput,
  deps: CreatePaseoWorktreeDeps,
): Promise<CreatePaseoWorktreeResult> {
  return runWithGitCommandPriority("high", () => createPaseoWorktreeWithPriority(input, deps));
}

async function createPaseoWorktreeWithPriority(
  input: CreatePaseoWorktreeInput,
  deps: CreatePaseoWorktreeDeps,
): Promise<CreatePaseoWorktreeResult> {
  const workspaceCwdPlan = await planWorkspaceCwdForWorktree(input.cwd, deps.workspaceGitService);
  const createdWorktree = await createWorktreeCore(input, deps);
  // Every worktree created after the main one is tracked here so a partial
  // multi-repo failure rolls back everything this call created (vibe-kanban
  // lesson: never leave half a workspace behind).
  const createdSecondaries: SecondaryPaseoWorktreeResult[] = [];
  let multiRepo: Awaited<ReturnType<typeof createMultiRepoContainer>> | null = null;
  try {
    maybeMarkFirstAgentBranchAutoNameEligible({ createdWorktree });
    const workspaceCwd = mapWorkspaceRelativeCwdToWorktree({
      relativeWorkspaceCwd: workspaceCwdPlan.relativeWorkspaceCwd,
      targetWorktreePath: createdWorktree.worktree.worktreePath,
    });
    if (!(await isDirectory(workspaceCwd))) {
      throw new Error(`Selected project directory is missing from the worktree: ${workspaceCwd}`);
    }

    if (createdWorktree.created) {
      await seedPaseoConfigFile({
        sourceCwd: workspaceCwdPlan.inputCwd,
        targetCwd: workspaceCwd,
      });
    }
    if (input.secondaries && input.secondaries.length > 0) {
      multiRepo = await createMultiRepoContainer({
        secondaries: input.secondaries,
        mainWorktreePath: createdWorktree.worktree.worktreePath,
        deps,
        runSetup: input.runSetup,
        paseoHome: input.paseoHome,
        worktreesRoot: input.worktreesRoot,
        created: createdSecondaries,
      });
    }
    // Multi-repo: the workspace cwd is the container holding every checkout,
    // so the agent works in one directory with all repos side by side.
    // Single-repo keeps today's behavior (cwd is the main checkout).
    // The main checkout moved into the container, so every downstream consumer
    // (record, descriptor, invalidation, rollback) uses the relocated path.
    const workspace = multiRepo
      ? await createMultiRepoWorkspaceRecord({
          multiRepo,
          sourceCwd: workspaceCwdPlan.inputCwd,
          projectId: input.projectId,
          repoRoot: createdWorktree.repoRoot,
          branch: createdWorktree.worktree.branchName || null,
          baseBranch: resolveIntentBaseBranch(createdWorktree.intent),
          title: input.title?.trim() || resolveFirstAgentPromptTitle(input.firstAgentContext),
          expectsInitialAgent: Boolean(input.firstAgentContext),
          linkedRepoRoots: input.linkedRepoRoots,
          deps,
        })
      : await createSingleRepoWorkspaceRecord({
          workspaceCwd,
          sourceCwd: workspaceCwdPlan.inputCwd,
          projectId: input.projectId,
          repoRoot: createdWorktree.repoRoot,
          worktreePath: createdWorktree.worktree.worktreePath,
          branch: createdWorktree.worktree.branchName || null,
          baseBranch: resolveIntentBaseBranch(createdWorktree.intent),
          title: input.title?.trim() || resolveFirstAgentPromptTitle(input.firstAgentContext),
          expectsInitialAgent: Boolean(input.firstAgentContext),
          linkedRepoRoots: input.linkedRepoRoots,
          deps,
        });

    const mainWorktreePath = multiRepo?.mainWorktreePath ?? createdWorktree.worktree.worktreePath;
    deps.github.invalidate({ cwd: mainWorktreePath });
    for (const secondary of multiRepo?.secondaries ?? []) {
      deps.github.invalidate({ cwd: secondary.worktree.worktreePath });
    }

    return {
      worktree: { ...createdWorktree.worktree, worktreePath: mainWorktreePath },
      intent: createdWorktree.intent,
      workspace,
      repoRoot: createdWorktree.repoRoot,
      created: createdWorktree.created,
      secondaries: multiRepo?.secondaries ?? [],
    };
  } catch (error) {
    await rollbackMultiRepoAttempt({
      multiRepo,
      mainWorktreePath: createdWorktree.worktree.worktreePath,
      createdSecondaries,
      runSetup: input.runSetup,
      paseoHome: input.paseoHome,
      worktreesRoot: input.worktreesRoot,
    });
    return rollbackMainWorktreeIfCreated({
      created: createdWorktree.created,
      repoRoot: createdWorktree.repoRoot,
      worktreePath: createdWorktree.worktree.worktreePath,
      runSetup: input.runSetup,
      paseoHome: input.paseoHome,
      worktreesRoot: input.worktreesRoot,
      error,
    });
  }
}

async function rollbackMainWorktreeIfCreated(input: {
  created: boolean;
  repoRoot: string;
  worktreePath: string;
  runSetup?: boolean;
  paseoHome?: string;
  worktreesRoot?: string;
  error: unknown;
}): Promise<never> {
  if (!input.created) {
    throw input.error;
  }
  return rollbackCreatedPaseoWorktree(
    {
      cwd: input.repoRoot,
      worktreePath: input.worktreePath,
      ...(input.runSetup === false ? { teardownCwds: [] } : {}),
      paseoHome: input.paseoHome,
      worktreesBaseRoot: input.worktreesRoot,
    },
    input.error,
  );
}

interface MultiRepoWorkspaceRecordInput {
  multiRepo: NonNullable<Awaited<ReturnType<typeof createMultiRepoContainer>>>;
  sourceCwd: string;
  projectId?: string;
  repoRoot: string;
  branch: string | null;
  baseBranch: string | null;
  title: string | null;
  expectsInitialAgent: boolean;
  linkedRepoRoots?: string[];
  deps: CreatePaseoWorktreeDeps;
}

function createMultiRepoWorkspaceRecord(
  input: MultiRepoWorkspaceRecordInput,
): Promise<PersistedWorkspaceRecord> {
  return input.deps.workspaceProvisioning.createWorkspaceForWorktree({
    sourceCwd: input.sourceCwd,
    projectId: input.projectId,
    repoRoot: input.repoRoot,
    cwd: input.multiRepo.containerPath,
    worktreeRoot: input.multiRepo.mainWorktreePath,
    branch: input.branch,
    baseBranch: input.baseBranch,
    title: input.title,
    expectsInitialAgent: input.expectsInitialAgent,
    ...(input.linkedRepoRoots && input.linkedRepoRoots.length > 0
      ? { linkedRepoRoots: input.linkedRepoRoots }
      : {}),
    ...(input.multiRepo.secondaries.length > 0
      ? {
          secondaryCheckouts: input.multiRepo.secondaries.map((secondary) => ({
            projectId: secondary.projectId ?? secondary.displayName,
            displayName: secondary.displayName,
            repoRoot: secondary.repoRoot,
            worktreePath: secondary.worktree.worktreePath,
            branch: secondary.worktree.branchName || null,
            baseBranch: resolveIntentBaseBranch(secondary.intent),
          })),
        }
      : {}),
  });
}

interface SingleRepoWorkspaceRecordInput {
  workspaceCwd: string;
  sourceCwd: string;
  projectId?: string;
  repoRoot: string;
  worktreePath: string;
  branch: string | null;
  baseBranch: string | null;
  title: string | null;
  expectsInitialAgent: boolean;
  linkedRepoRoots?: string[];
  deps: CreatePaseoWorktreeDeps;
}

function createSingleRepoWorkspaceRecord(
  input: SingleRepoWorkspaceRecordInput,
): Promise<PersistedWorkspaceRecord> {
  return input.deps.workspaceProvisioning.createWorkspaceForWorktree({
    sourceCwd: input.sourceCwd,
    projectId: input.projectId,
    repoRoot: input.repoRoot,
    cwd: input.workspaceCwd,
    worktreeRoot: input.worktreePath,
    branch: input.branch,
    baseBranch: input.baseBranch,
    title: input.title,
    expectsInitialAgent: input.expectsInitialAgent,
    ...(input.linkedRepoRoots && input.linkedRepoRoots.length > 0
      ? { linkedRepoRoots: input.linkedRepoRoots }
      : {}),
  });
}

async function rollbackMultiRepoAttempt(input: {
  multiRepo: Awaited<ReturnType<typeof createMultiRepoContainer>> | null;
  mainWorktreePath: string;
  createdSecondaries: SecondaryPaseoWorktreeResult[];
  runSetup?: boolean;
  paseoHome?: string;
  worktreesRoot?: string;
}): Promise<void> {
  // Move the main checkout back to its created path so the worktree
  // rollback below sees the layout git actually recorded.
  if (input.multiRepo) {
    try {
      await rename(input.multiRepo.mainWorktreePath, input.mainWorktreePath);
      await repairMovedPaseoWorktree(input.mainWorktreePath);
    } catch {
      // Best-effort: the worktree rollback below still removes by path.
    }
  }
  await rollbackSecondaryPaseoWorktrees({
    created: input.createdSecondaries,
    runSetup: input.runSetup,
    paseoHome: input.paseoHome,
    worktreesRoot: input.worktreesRoot,
  });
  if (input.multiRepo) {
    await removeDirectoryIfEmpty(input.multiRepo.containerPath).catch(() => {});
  }
}

/**
 * Builds the multi-repo container: a plain directory holding the main checkout
 * plus one independent worktree per requested secondary repo. The container is
 * a sibling of the main worktree (never nested inside a git checkout) so no
 * repo sees the others as untracked dirt. Sequential on purpose: each repo
 * keeps its own branch lifecycle, and a failure anywhere rolls back everything
 * created so far rather than leaving half a workspace.
 */
async function createMultiRepoContainer(input: {
  secondaries: SecondaryPaseoWorktreeInput[];
  mainWorktreePath: string;
  deps: CreatePaseoWorktreeDeps;
  runSetup?: boolean;
  paseoHome?: string;
  worktreesRoot?: string;
  created: SecondaryPaseoWorktreeResult[];
}): Promise<{
  containerPath: string;
  mainWorktreePath: string;
  secondaries: SecondaryPaseoWorktreeResult[];
}> {
  const mainSlug = basename(input.mainWorktreePath);
  const containerPath = await uniqueContainerPath(
    resolve(input.mainWorktreePath, ".."),
    `${mainSlug}--multi`,
  );
  await mkdir(containerPath, { recursive: true });
  const mainDirName = await uniqueContainerDirName(containerPath, mainSlug);
  const relocatedMainPath = join(containerPath, mainDirName);
  try {
    await rename(input.mainWorktreePath, relocatedMainPath);
    await repairMovedPaseoWorktree(relocatedMainPath);
  } catch (error) {
    // Best-effort: put the main checkout back where git recorded it before
    // reporting the failure, so the outer catch rolls back a known layout.
    await rename(relocatedMainPath, input.mainWorktreePath).catch(() => {});
    throw new Error("Failed to stage the main checkout inside the multi-repo workspace", {
      cause: error,
    });
  }

  const results: SecondaryPaseoWorktreeResult[] = [];
  const seenRepoRoots = new Set<string>();
  try {
    for (const secondary of input.secondaries) {
      const result = await createAndStageSecondary({
        secondary,
        containerPath,
        seenRepoRoots,
        deps: input.deps,
        runSetup: input.runSetup,
        paseoHome: input.paseoHome,
        worktreesRoot: input.worktreesRoot,
        created: input.created,
      });
      results.push(result);
    }
  } catch (error) {
    // Move the main checkout back so the outer catch rolls back a layout it
    // recognizes (main worktree at its created path, container removable).
    try {
      await rename(relocatedMainPath, input.mainWorktreePath);
      await repairMovedPaseoWorktree(input.mainWorktreePath);
    } catch {
      // Best-effort: the outer rollback still removes by path.
    }
    throw error;
  }
  return { containerPath, mainWorktreePath: relocatedMainPath, secondaries: results };
}

async function createAndStageSecondary(input: {
  secondary: SecondaryPaseoWorktreeInput;
  containerPath: string;
  seenRepoRoots: Set<string>;
  deps: CreatePaseoWorktreeDeps;
  runSetup?: boolean;
  paseoHome?: string;
  worktreesRoot?: string;
  created: SecondaryPaseoWorktreeResult[];
}): Promise<SecondaryPaseoWorktreeResult> {
  const { secondary } = input;
  if (!secondary.cwd && !secondary.projectId) {
    throw new Error("Each additional repository needs a project to check out from");
  }
  const sourceCwd = secondary.cwd ? resolve(expandTilde(secondary.cwd)) : null;
  if (!sourceCwd) {
    throw new Error("Each additional repository needs a project to check out from");
  }
  const created = await createWorktreeCore(
    {
      cwd: sourceCwd,
      ...(secondary.worktreeSlug ? { worktreeSlug: secondary.worktreeSlug } : {}),
      ...(secondary.branchName ? { branchName: secondary.branchName } : {}),
      ...(secondary.refName ? { refName: secondary.refName } : {}),
      // Secondaries share the workspace's worktree home so staging them
      // into the container is a same-device move, and they get the same
      // setup lifecycle as the main checkout.
      ...(input.runSetup !== undefined ? { runSetup: input.runSetup } : {}),
      ...(input.paseoHome !== undefined ? { paseoHome: input.paseoHome } : {}),
      ...(input.worktreesRoot !== undefined ? { worktreesRoot: input.worktreesRoot } : {}),
    },
    input.deps,
  );
  if (input.seenRepoRoots.has(created.repoRoot)) {
    await rollbackSecondaryWorktree({
      repoRoot: created.repoRoot,
      worktreePath: created.worktree.worktreePath,
      runSetup: input.runSetup,
      paseoHome: input.paseoHome,
      worktreesRoot: input.worktreesRoot,
    });
    throw new Error("Each additional repository must be a different repository");
  }
  input.seenRepoRoots.add(created.repoRoot);
  const dirName = await uniqueContainerDirName(
    input.containerPath,
    basename(created.repoRoot) || created.repoRoot,
  );
  const containerCheckoutPath = join(input.containerPath, dirName);
  try {
    await rename(created.worktree.worktreePath, containerCheckoutPath);
    await repairMovedPaseoWorktree(containerCheckoutPath);
  } catch (error) {
    await rollbackSecondaryWorktree({
      repoRoot: created.repoRoot,
      worktreePath: created.worktree.worktreePath,
      runSetup: input.runSetup,
      paseoHome: input.paseoHome,
      worktreesRoot: input.worktreesRoot,
    });
    throw new Error(
      `Failed to stage the ${basename(created.repoRoot)} checkout inside the multi-repo workspace`,
      { cause: error },
    );
  }
  const displayName = basename(created.repoRoot) || created.repoRoot;
  const result: SecondaryPaseoWorktreeResult = {
    worktree: { ...created.worktree, worktreePath: containerCheckoutPath },
    intent: created.intent,
    repoRoot: created.repoRoot,
    created: created.created,
    projectId: secondary.projectId ?? null,
    displayName,
  };
  if (created.created) {
    input.created.push(result);
  }
  return result;
}

async function uniqueContainerPath(parentDir: string, desired: string): Promise<string> {
  let candidate = join(parentDir, desired);
  let suffix = 2;
  while (!(await isMissingPath(candidate))) {
    candidate = join(parentDir, `${desired}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

async function removeDirectoryIfEmpty(targetPath: string): Promise<void> {
  const entries = await readdir(targetPath);
  if (entries.length === 0) {
    await rmdir(targetPath);
  }
}

async function uniqueContainerDirName(containerPath: string, desired: string): Promise<string> {
  const slug = desired.trim() || "repo";
  let candidate = slug;
  let suffix = 2;
  while (!(await isMissingPath(join(containerPath, candidate)))) {
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function isMissingPath(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return false;
  } catch {
    return true;
  }
}

async function rollbackSecondaryWorktree(input: {
  repoRoot: string;
  worktreePath: string;
  runSetup?: boolean;
  paseoHome?: string;
  worktreesRoot?: string;
}): Promise<void> {
  try {
    await rollbackCreatedPaseoWorktree(
      {
        cwd: input.repoRoot,
        worktreePath: input.worktreePath,
        ...(input.runSetup === false ? { teardownCwds: [] } : {}),
        paseoHome: input.paseoHome,
        worktreesBaseRoot: input.worktreesRoot,
      },
      new Error("multi-repo workspace creation failed"),
    );
  } catch {
    // rollbackCreatedPaseoWorktree always throws its cause; reaching here means
    // the cleanup itself ran. Swallow so one failed rollback never hides the
    // original error or blocks rolling back the remaining worktrees.
  }
}

async function rollbackSecondaryPaseoWorktrees(input: {
  created: SecondaryPaseoWorktreeResult[];
  runSetup?: boolean;
  paseoHome?: string;
  worktreesRoot?: string;
}): Promise<void> {
  for (let index = input.created.length - 1; index >= 0; index -= 1) {
    const secondary = input.created[index];
    if (!secondary) continue;
    await rollbackSecondaryWorktree({
      repoRoot: secondary.repoRoot,
      worktreePath: secondary.worktree.worktreePath,
      runSetup: input.runSetup,
      paseoHome: input.paseoHome,
      worktreesRoot: input.worktreesRoot,
    });
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

async function planWorkspaceCwdForWorktree(
  inputCwd: string,
  workspaceGitService: Pick<WorkspaceGitService, "getCheckout">,
): Promise<{ inputCwd: string; relativeWorkspaceCwd: string }> {
  const normalizedInputCwd = resolve(inputCwd);
  const sourceCheckout = await workspaceGitService.getCheckout(normalizedInputCwd);
  const sourceWorktreePath = sourceCheckout.worktreeRoot ?? normalizedInputCwd;
  const relativeWorkspaceCwd = getRealpathAwareRelativePath(sourceWorktreePath, normalizedInputCwd);
  if (relativeWorkspaceCwd === null) {
    throw new Error(`Workspace cwd is outside its source worktree: ${normalizedInputCwd}`);
  }
  return { inputCwd: normalizedInputCwd, relativeWorkspaceCwd };
}

export async function attemptFirstAgentBranchAutoName(options: {
  cwd: string;
  firstAgentContext: FirstAgentContext | undefined;
  generateBranchNameFromContext: (input: {
    cwd: string;
    firstAgentContext: FirstAgentContext;
  }) => Promise<string | null>;
  getCurrentBranch?: typeof getCurrentBranch;
  renameCurrentBranch?: typeof renameCurrentBranch;
  localBranchExists?: typeof localBranchExists;
}): Promise<AttemptFirstAgentBranchAutoNameResult> {
  const firstAgentContext = options.firstAgentContext;
  if (!firstAgentContext || !buildAgentBranchNameSeed(firstAgentContext)) {
    return { attempted: false, renamed: false, branchName: null };
  }

  let metadata: ReturnType<typeof readPaseoWorktreeMetadata>;
  try {
    metadata = readPaseoWorktreeMetadata(options.cwd);
  } catch {
    return { attempted: false, renamed: false, branchName: null };
  }
  if (
    !metadata ||
    metadata.version !== 2 ||
    metadata.firstAgentBranchAutoName?.status !== "pending"
  ) {
    return { attempted: false, renamed: false, branchName: null };
  }

  const getCurrentBranchImpl = options.getCurrentBranch ?? getCurrentBranch;
  const placeholderBranchName = metadata.firstAgentBranchAutoName.placeholderBranchName;
  if ((await getCurrentBranchImpl(options.cwd)) !== placeholderBranchName) {
    markPaseoWorktreeFirstAgentBranchAutoNameAttempted(options.cwd);
    return { attempted: true, renamed: false, branchName: null };
  }

  markPaseoWorktreeFirstAgentBranchAutoNameAttempted(options.cwd);

  const branchName = await options.generateBranchNameFromContext({
    cwd: options.cwd,
    firstAgentContext,
  });
  if (!branchName) {
    return { attempted: true, renamed: false, branchName: null };
  }
  const validation = validateBranchSlug(branchName);
  if (!validation.valid || branchName === placeholderBranchName) {
    return { attempted: true, renamed: false, branchName: null };
  }
  if ((await getCurrentBranchImpl(options.cwd)) !== placeholderBranchName) {
    return { attempted: true, renamed: false, branchName: null };
  }

  const localBranchExistsImpl = options.localBranchExists ?? localBranchExists;
  const targetName = await findAvailableBranchName({
    cwd: options.cwd,
    desiredName: branchName,
    placeholderBranchName,
    localBranchExists: localBranchExistsImpl,
  });
  if (!targetName) {
    return { attempted: true, renamed: false, branchName: null };
  }

  const renameCurrentBranchImpl = options.renameCurrentBranch ?? renameCurrentBranch;
  const renamedBranch = await renameCurrentBranchImpl(options.cwd, targetName);
  return {
    attempted: true,
    renamed: true,
    branchName: renamedBranch.currentBranch ?? targetName,
  };
}

const MAX_BRANCH_NAME_SUFFIX_ATTEMPTS = 50;

async function findAvailableBranchName(options: {
  cwd: string;
  desiredName: string;
  placeholderBranchName: string;
  localBranchExists: (cwd: string, branchName: string) => Promise<boolean>;
}): Promise<string | null> {
  const { cwd, desiredName, placeholderBranchName } = options;
  if (!(await options.localBranchExists(cwd, desiredName))) {
    return desiredName;
  }
  for (let suffix = 2; suffix <= MAX_BRANCH_NAME_SUFFIX_ATTEMPTS; suffix++) {
    const candidate = `${desiredName}-${suffix}`;
    if (candidate === placeholderBranchName) {
      continue;
    }
    if (!(await options.localBranchExists(cwd, candidate))) {
      return candidate;
    }
  }
  return null;
}

function maybeMarkFirstAgentBranchAutoNameEligible(options: {
  createdWorktree: Awaited<ReturnType<typeof createWorktreeCore>>;
}): void {
  const { createdWorktree } = options;
  if (!createdWorktree.created || createdWorktree.intent.kind !== "branch-off") {
    return;
  }

  writePaseoWorktreeFirstAgentBranchAutoNameMetadata(createdWorktree.worktree.worktreePath, {
    placeholderBranchName: createdWorktree.worktree.branchName,
  });
}

// The base branch is normalized to match worktree.json's baseRefName (origin/
// stripped). checkout-branch worktrees have no distinct base, so they stay null.
function resolveIntentBaseBranch(intent: WorktreeCreationIntent): string | null {
  switch (intent.kind) {
    case "branch-off":
      return normalizeBaseRefName(intent.baseBranch);
    case "checkout-change-request":
      return normalizeBaseRefName(intent.baseRefName);
    case "checkout-github-pr":
      return normalizeBaseRefName(intent.baseRefName);
    case "checkout-branch":
      return null;
  }
}
