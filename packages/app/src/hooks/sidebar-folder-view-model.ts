import type { TFunction } from "i18next";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";

const FOLDER_DELIMITER = " · ";
const OTHER_FOLDER_ID = "other";

export interface FolderGroup {
  /** Case-folded folder name; the single "other" id is both the fallback and a project folder literally named "Other". */
  id: string;
  label: string;
  rows: SidebarWorkspaceEntry[];
}

/**
 * A project is filed under the text before the first " · " in its display name, so
 * "kahf · dns-config" lives in "kahf". Names without the delimiter, or with nothing before it,
 * have no folder.
 */
export function folderOfProjectName(projectName: string): string | null {
  const index = projectName.indexOf(FOLDER_DELIMITER);
  if (index < 0) return null;
  const folder = projectName.slice(0, index).trim();
  return folder.length > 0 ? folder : null;
}

/**
 * Folders sort alphabetically ignoring case, "Other" last. Rows inside sort by project name, then
 * workspace name; the row already names its project, so the order is what keeps one project's
 * workspaces together.
 */
export function buildFolderGroups(
  workspaces: readonly SidebarWorkspaceEntry[],
  t: TFunction,
): FolderGroup[] {
  const groups = new Map<string, FolderGroup>();
  for (const workspace of workspaces) {
    const folder = folderOfProjectName(workspace.projectName);
    const id = folder === null ? OTHER_FOLDER_ID : folder.toLocaleLowerCase();
    let group = groups.get(id);
    if (!group) {
      const label = folder === null || id === OTHER_FOLDER_ID ? t("sidebar.folderOther") : folder;
      group = { id, label, rows: [] };
      groups.set(id, group);
    }
    group.rows.push(workspace);
  }

  for (const group of groups.values()) {
    group.rows.sort(compareFolderRows);
  }
  return [...groups.values()].sort(compareFolders);
}

function compareFolders(a: FolderGroup, b: FolderGroup): number {
  if (a.id === OTHER_FOLDER_ID) return b.id === OTHER_FOLDER_ID ? 0 : 1;
  if (b.id === OTHER_FOLDER_ID) return -1;
  return a.id.localeCompare(b.id);
}

function compareFolderRows(a: SidebarWorkspaceEntry, b: SidebarWorkspaceEntry): number {
  return (
    a.projectName.localeCompare(b.projectName) ||
    a.name.localeCompare(b.name) ||
    a.workspaceKey.localeCompare(b.workspaceKey)
  );
}
