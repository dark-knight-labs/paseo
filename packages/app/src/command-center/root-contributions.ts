import type { SidebarGroupMode } from "@/stores/sidebar-view-store";
import type { CommandCenterContribution, CommandCenterIcon } from "./contributions";

export interface GroupingCommandCenterSource {
  groupMode: SidebarGroupMode;
  labels: {
    section: string;
    groupByProject: string;
    groupByStatus: string;
    groupByFolder: string;
  };
  icons: {
    project?: CommandCenterIcon;
    status?: CommandCenterIcon;
    folder?: CommandCenterIcon;
  };
  setGroupMode(mode: SidebarGroupMode): void;
}

const NEXT_GROUP_MODE: Record<SidebarGroupMode, SidebarGroupMode> = {
  project: "status",
  status: "folder",
  folder: "project",
};

// One entry that always names the mode you are not in, so it can never read as a no-op.
export function buildGroupingContribution(
  source: GroupingCommandCenterSource,
): CommandCenterContribution {
  // Collapse into nextGroupMode() from sidebar-view-store once #2504 lands.
  const target = NEXT_GROUP_MODE[source.groupMode];
  const titles: Record<SidebarGroupMode, string> = {
    project: source.labels.groupByProject,
    status: source.labels.groupByStatus,
    folder: source.labels.groupByFolder,
  };
  return {
    id: "sidebar-grouping",
    group: "actions",
    groupRank: 0,
    rank: 8,
    keywords: ["group", "grouping", "sort", "sidebar", "project", "status", "folder"],
    visibility: "query",
    run: () => source.setGroupMode(target),
    presentation: {
      kind: "action",
      title: titles[target],
      sectionTitle: source.labels.section,
      icon: source.icons[target],
    },
  };
}
