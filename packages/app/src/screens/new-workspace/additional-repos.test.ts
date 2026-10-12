import { describe, expect, it } from "vitest";

import type { HostProjectListItem } from "@/projects/host-projects";
import { buildSecondaryWorktreeInputs, filterEligibleAdditionalProjects } from "./additional-repos";

function project(input: {
  viewKey: string;
  name: string;
  kind: "git" | "non_git" | "unknown";
  hosts: {
    serverId: string;
    projectId: string;
    worktreeSupport: "supported" | "unsupported" | "unknown";
  }[];
}): HostProjectListItem {
  return {
    viewKey: input.viewKey,
    projectKey: null,
    projectName: input.name,
    projectKind: input.kind,
    iconWorkingDir: "/tmp/icon",
    hosts: input.hosts.map((host) => ({ ...host, iconWorkingDir: `/tmp/${host.projectId}` })),
    workspaceKeys: [],
  };
}

describe("filterEligibleAdditionalProjects", () => {
  const main = project({
    viewKey: "main",
    name: "service-a",
    kind: "git",
    hosts: [{ serverId: "host-1", projectId: "proj-a", worktreeSupport: "supported" }],
  });
  const other = project({
    viewKey: "other",
    name: "service-b",
    kind: "git",
    hosts: [{ serverId: "host-1", projectId: "proj-b", worktreeSupport: "supported" }],
  });

  it("excludes the main project and already-selected projects", () => {
    const eligible = filterEligibleAdditionalProjects({
      projects: [main, other],
      serverId: "host-1",
      mainProjectViewKey: "main",
      selectedViewKeys: new Set(["other"]),
    });
    expect(eligible).toEqual([]);
  });

  it("keeps git projects that support worktrees on the selected host", () => {
    const eligible = filterEligibleAdditionalProjects({
      projects: [main, other],
      serverId: "host-1",
      mainProjectViewKey: "main",
      selectedViewKeys: new Set(),
    });
    expect(eligible.map((candidate) => candidate.viewKey)).toEqual(["other"]);
  });

  it("excludes non-git, unsupported, and other-host projects", () => {
    const candidates = [
      project({
        viewKey: "plain",
        name: "notes",
        kind: "non_git",
        hosts: [{ serverId: "host-1", projectId: "proj-notes", worktreeSupport: "unsupported" }],
      }),
      project({
        viewKey: "remote",
        name: "service-c",
        kind: "git",
        hosts: [{ serverId: "host-2", projectId: "proj-c", worktreeSupport: "supported" }],
      }),
    ];
    expect(
      filterEligibleAdditionalProjects({
        projects: candidates,
        serverId: "host-1",
        mainProjectViewKey: null,
        selectedViewKeys: new Set(),
      }),
    ).toEqual([]);
  });
});

describe("buildSecondaryWorktreeInputs", () => {
  it("skips incomplete rows and carries the selected base ref", () => {
    const serviceB = project({
      viewKey: "other",
      name: "service-b",
      kind: "git",
      hosts: [{ serverId: "host-1", projectId: "proj-b", worktreeSupport: "supported" }],
    });
    expect(
      buildSecondaryWorktreeInputs({
        serverId: "host-1",
        selections: [
          { key: "a", project: null, sourceDirectory: null, selectedItem: null },
          {
            key: "b",
            project: serviceB,
            sourceDirectory: "/tmp/proj-b",
            selectedItem: {
              kind: "branch",
              name: "develop",
              refName: "refs/remotes/origin/develop",
              accessibilityLabel: "develop, origin branch",
            },
          },
        ],
      }),
    ).toEqual([
      { cwd: "/tmp/proj-b", projectId: "proj-b", refName: "refs/remotes/origin/develop" },
    ]);
  });
});
