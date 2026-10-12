import { describe, expect, it } from "vitest";

import { hasMultipleCheckouts, listWorkspaceCheckouts } from "./multi-repo-checkouts";

describe("listWorkspaceCheckouts", () => {
  it("returns the workspace directory as the single main checkout", () => {
    expect(
      listWorkspaceCheckouts({
        workspaceDirectory: "/wt/main",
        projectDisplayName: "service-a",
        secondaryCheckouts: [],
        worktreeRoot: null,
      }),
    ).toEqual([
      {
        key: "main",
        displayName: "service-a",
        worktreePath: "/wt/main",
        branch: null,
        baseBranch: null,
        isMain: true,
      },
    ]);
  });

  it("lists the relocated main checkout first, then secondaries", () => {
    const checkouts = listWorkspaceCheckouts({
      workspaceDirectory: "/wt/multi",
      projectDisplayName: "service-a",
      worktreeRoot: "/wt/multi/service-a",
      secondaryCheckouts: [
        {
          projectId: "proj-b",
          displayName: "service-b",
          repoRoot: "/repo/b",
          worktreePath: "/wt/multi/service-b",
          branch: "feature-b",
          baseBranch: "main",
        },
      ],
    });
    expect(checkouts.map((checkout) => checkout.worktreePath)).toEqual([
      "/wt/multi/service-a",
      "/wt/multi/service-b",
    ]);
    expect(checkouts[1]).toMatchObject({
      displayName: "service-b",
      branch: "feature-b",
      baseBranch: "main",
      isMain: false,
    });
  });
});

describe("hasMultipleCheckouts", () => {
  it("is false for single-repo and unknown workspaces", () => {
    expect(hasMultipleCheckouts(null)).toBe(false);
    expect(hasMultipleCheckouts(undefined)).toBe(false);
    expect(hasMultipleCheckouts({ secondaryCheckouts: [] })).toBe(false);
  });

  it("is true when secondary checkouts exist", () => {
    expect(
      hasMultipleCheckouts({
        secondaryCheckouts: [
          {
            projectId: "proj-b",
            displayName: "service-b",
            repoRoot: "/repo/b",
            worktreePath: "/wt/multi/service-b",
            branch: null,
            baseBranch: null,
          },
        ],
      }),
    ).toBe(true);
  });
});
