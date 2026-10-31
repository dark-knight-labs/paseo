import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import { buildFolderGroups, folderOfProjectName } from "./sidebar-folder-view-model";

function row(id: string, projectName: string, name = id): SidebarWorkspaceEntry {
  return { workspaceKey: `srv:${id}`, projectName, name } as SidebarWorkspaceEntry;
}

describe("folderOfProjectName", () => {
  it("takes the text before the first middle-dot delimiter", () => {
    expect(folderOfProjectName("kahf · dns-config")).toBe("kahf");
    expect(folderOfProjectName("burak · hub (homelab)")).toBe("burak");
    expect(folderOfProjectName("a · b · c")).toBe("a");
  });

  it("has no folder without the exact space-dot-space delimiter or with nothing before it", () => {
    expect(folderOfProjectName("paseo")).toBeNull();
    expect(folderOfProjectName("kahf·dns")).toBeNull();
    expect(folderOfProjectName("kahf - dns")).toBeNull();
    expect(folderOfProjectName(" · dns")).toBeNull();
  });
});

describe("buildFolderGroups", () => {
  it("sorts folders case-insensitively with Other last", () => {
    const groups = buildFolderGroups(
      [row("1", "zeta · x"), row("2", "scratch"), row("3", "Alpha · y"), row("4", "beta · z")],
      i18n.t,
    );
    expect(groups.map((group) => group.label)).toEqual(["Alpha", "beta", "zeta", "Other"]);
  });

  it("merges folders that differ only by case and keeps the first spelling", () => {
    const groups = buildFolderGroups([row("1", "Kahf · a"), row("2", "kahf · b")], i18n.t);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Kahf");
    expect(groups[0]?.rows).toHaveLength(2);
  });

  it("files a literal Other folder with the delimiter-less projects", () => {
    const groups = buildFolderGroups([row("1", "Other · a"), row("2", "plain")], i18n.t);
    expect(groups.map((group) => [group.id, group.rows.length])).toEqual([["other", 2]]);
  });

  it("sorts rows by project name, then workspace name", () => {
    const groups = buildFolderGroups(
      [row("1", "k · b", "main"), row("2", "k · a", "z"), row("3", "k · a", "a")],
      i18n.t,
    );
    expect(groups[0]?.rows.map((entry) => entry.workspaceKey)).toEqual(["srv:3", "srv:2", "srv:1"]);
  });

  it("returns nothing for no workspaces", () => {
    expect(buildFolderGroups([], i18n.t)).toEqual([]);
  });
});
