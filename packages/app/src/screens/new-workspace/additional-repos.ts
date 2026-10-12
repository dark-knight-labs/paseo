import type { HostProjectListItem } from "@/projects/host-projects";
import type { PickerItem } from "../new-workspace-picker-item";
import type { WorkspaceSecondaryWorktreeInput } from "@getpaseo/protocol/messages";

export interface AdditionalRepoSelection {
  key: string;
  project: HostProjectListItem | null;
  sourceDirectory: string | null;
  selectedItem: PickerItem | null;
}

export function createAdditionalRepoSelection(key: string): AdditionalRepoSelection {
  return { key, project: null, sourceDirectory: null, selectedItem: null };
}

/**
 * Projects eligible as additional repositories: git-driven (worktree-capable)
 * on the selected host, excluding the main project and already-added ones.
 * Same-host only — a worktree is cut on the main project's computer.
 */
export function filterEligibleAdditionalProjects(input: {
  projects: readonly HostProjectListItem[];
  serverId: string;
  mainProjectViewKey: string | null;
  selectedViewKeys: ReadonlySet<string>;
}): HostProjectListItem[] {
  return input.projects.filter((project) => {
    if (input.mainProjectViewKey && project.viewKey === input.mainProjectViewKey) return false;
    if (input.selectedViewKeys.has(project.viewKey)) return false;
    const placement = project.hosts.find((host) => host.serverId === input.serverId);
    if (!placement) return false;
    if (placement.worktreeSupport === "unsupported") return false;
    return project.projectKind === "git";
  });
}

export function buildSecondaryWorktreeInputs(input: {
  selections: readonly AdditionalRepoSelection[];
  serverId: string;
}): WorkspaceSecondaryWorktreeInput[] {
  const inputs: WorkspaceSecondaryWorktreeInput[] = [];
  for (const selection of input.selections) {
    if (!selection.project || !selection.sourceDirectory) continue;
    const projectId =
      selection.project.hosts.find((host) => host.serverId === input.serverId)?.projectId ?? null;
    inputs.push({
      cwd: selection.sourceDirectory,
      ...(projectId ? { projectId } : {}),
      ...(selection.selectedItem?.kind === "branch"
        ? { refName: selection.selectedItem.refName }
        : {}),
    });
  }
  return inputs;
}
