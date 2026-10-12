import { describe, expect, it } from "vitest";
import { buildSecondaryWorktreeInputs, buildWorkspaceSource } from "./create.js";

describe("workspace create source", () => {
  it("maps local isolation to a directory workspace", () => {
    expect(
      buildWorkspaceSource({ isolation: "local", path: "/tmp/project", project: "project-1" }),
    ).toEqual({ kind: "directory", path: "/tmp/project", projectId: "project-1" });
  });

  it("keeps branch names separate from managed worktree slugs", () => {
    expect(
      buildWorkspaceSource({
        isolation: "worktree",
        path: "/tmp/project",
        mode: "branch-off",
        newBranch: "feature/auth",
        worktreeSlug: "feature-auth",
        base: "main",
      }),
    ).toEqual({
      kind: "worktree",
      cwd: "/tmp/project",
      action: "branch-off",
      branchName: "feature/auth",
      worktreeSlug: "feature-auth",
      baseBranch: "main",
    });
  });

  it("uses a project as the worktree source without capturing the ambient directory", () => {
    expect(
      buildWorkspaceSource({
        isolation: "worktree",
        project: "project-1",
        mode: "branch-off",
        newBranch: "fix-x",
      }),
    ).toEqual({
      kind: "worktree",
      projectId: "project-1",
      action: "branch-off",
      branchName: "fix-x",
    });
  });

  it("checks out an existing branch into a worktree workspace", () => {
    expect(
      buildWorkspaceSource({
        isolation: "worktree",
        path: "/tmp/project",
        mode: "checkout-branch",
        branch: "existing-work",
        worktreeSlug: "existing-work-copy",
      }),
    ).toEqual({
      kind: "worktree",
      cwd: "/tmp/project",
      action: "checkout",
      refName: "existing-work",
      worktreeSlug: "existing-work-copy",
    });
  });

  it("checks out a pull request into a worktree workspace", () => {
    expect(
      buildWorkspaceSource({
        isolation: "worktree",
        path: "/tmp/project",
        mode: "checkout-pr",
        prNumber: "42",
        forge: "gitlab",
      }),
    ).toEqual({
      kind: "worktree",
      cwd: "/tmp/project",
      action: "checkout",
      checkoutSource: {
        kind: "change_request",
        forge: "gitlab",
        number: 42,
      },
    });
  });

  it("lets the source checkout select the forge when it is omitted", () => {
    expect(
      buildWorkspaceSource({
        isolation: "worktree",
        path: "/tmp/project",
        mode: "checkout-pr",
        prNumber: "42",
      }),
    ).toEqual({
      kind: "worktree",
      cwd: "/tmp/project",
      action: "checkout",
      checkoutSource: {
        kind: "change_request",
        number: 42,
      },
    });
  });

  it("requires the mode-specific checkout target", () => {
    expect(() => buildWorkspaceSource({ isolation: "worktree", mode: "checkout-branch" })).toThrow(
      "--branch is required",
    );
    expect(() => buildWorkspaceSource({ isolation: "worktree", mode: "checkout-pr" })).toThrow(
      "--pr-number is required",
    );
  });

  it("rejects worktree options for local isolation", () => {
    expect(() => buildWorkspaceSource({ isolation: "local", mode: "branch-off" })).toThrow(
      "Worktree options require --isolation worktree",
    );
  });

  it("rejects unknown isolation", () => {
    expect(() => buildWorkspaceSource({ isolation: "container" })).toThrow(
      "Unsupported workspace isolation",
    );
  });
});

describe("workspace create link-repo", () => {
  it("returns undefined when no link repos are given", () => {
    expect(buildSecondaryWorktreeInputs({})).toBeUndefined();
    expect(buildSecondaryWorktreeInputs({ linkRepo: [], linkBase: [] })).toBeUndefined();
  });

  it("maps paths to cwd inputs and pairs bases positionally", () => {
    expect(
      buildSecondaryWorktreeInputs({
        linkRepo: ["/tmp/service-b", "/tmp/shared-lib"],
        linkBase: ["main", "develop"],
      }),
    ).toEqual([
      { cwd: "/tmp/service-b", refName: "main" },
      { cwd: "/tmp/shared-lib", refName: "develop" },
    ]);
  });

  it("maps project: ids to projectId inputs without a base", () => {
    expect(buildSecondaryWorktreeInputs({ linkRepo: ["project:proj-b"] })).toEqual([
      { projectId: "proj-b" },
    ]);
  });

  it("rejects blank entries and mismatched base counts", () => {
    expect(() => buildSecondaryWorktreeInputs({ linkRepo: ["  "] })).toThrow(
      "--link-repo must not be blank",
    );
    expect(() => buildSecondaryWorktreeInputs({ linkBase: ["main"] })).toThrow(
      "--link-base requires --link-repo",
    );
    expect(() =>
      buildSecondaryWorktreeInputs({ linkRepo: ["/tmp/a", "/tmp/b"], linkBase: ["main"] }),
    ).toThrow("must match --link-repo count");
  });

  it("rejects link repos for local isolation", () => {
    expect(() =>
      buildWorkspaceSource({ isolation: "local", linkRepo: ["/tmp/service-b"] }),
    ).toThrow("Worktree options require --isolation worktree");
  });
});
