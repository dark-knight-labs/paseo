import { useState } from "react";

import type { WorkspaceDescriptor } from "@/stores/session-store";

export interface WorkspaceCheckoutOption {
  key: string;
  displayName: string;
  worktreePath: string;
  branch: string | null;
  baseBranch: string | null;
  isMain: boolean;
}

/**
 * Fork multi-repo (#3254): every checkout belonging to a workspace, main first.
 * The main checkout is the record's worktreeRoot (the relocated main worktree),
 * falling back to the workspace directory for single-repo workspaces. Returns a
 * single entry for workspaces without secondary checkouts, so callers only
 * branch when `length > 1`.
 */
export function listWorkspaceCheckouts(
  workspace: Pick<
    WorkspaceDescriptor,
    "workspaceDirectory" | "projectDisplayName" | "secondaryCheckouts" | "worktreeRoot"
  >,
): WorkspaceCheckoutOption[] {
  const main: WorkspaceCheckoutOption = {
    key: "main",
    displayName: workspace.projectDisplayName,
    worktreePath: workspace.worktreeRoot ?? workspace.workspaceDirectory,
    branch: null,
    baseBranch: null,
    isMain: true,
  };
  const secondaries = (workspace.secondaryCheckouts ?? []).map(
    (checkout, index): WorkspaceCheckoutOption => ({
      key: `secondary-${index}`,
      displayName: checkout.displayName,
      worktreePath: checkout.worktreePath,
      branch: checkout.branch,
      baseBranch: checkout.baseBranch,
      isMain: false,
    }),
  );
  return [main, ...secondaries];
}

export function hasMultipleCheckouts(
  workspace: Pick<WorkspaceDescriptor, "secondaryCheckouts"> | null | undefined,
): boolean {
  return (workspace?.secondaryCheckouts?.length ?? 0) > 0;
}

interface ActiveCheckoutSelection {
  multiRepo: WorkspaceCheckoutOption[] | null;
  selectedKey: string;
  onSelectCheckout: (key: string) => void;
  activeCwd: string;
  activeCheckout: WorkspaceCheckoutOption | undefined;
}

/**
 * Per-surface checkout selection. Defaults to main; a stale key resolves
 * within the current set, and single-checkout surfaces keep `cwd` verbatim.
 */
export function useActiveCheckout(input: {
  cwd: string;
  checkouts?: WorkspaceCheckoutOption[];
}): ActiveCheckoutSelection {
  const multiRepo = (input.checkouts ?? []).length > 1 ? (input.checkouts ?? null) : null;
  const [selectedKey, setSelectedCheckoutKey] = useState("main");
  const activeCheckout = multiRepo?.find((checkout) => checkout.key === selectedKey);
  return {
    multiRepo,
    selectedKey,
    onSelectCheckout: setSelectedCheckoutKey,
    activeCwd: activeCheckout?.worktreePath ?? input.cwd,
    activeCheckout,
  };
}
