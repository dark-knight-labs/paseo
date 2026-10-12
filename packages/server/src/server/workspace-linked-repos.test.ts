import path from "node:path";
import { describe, expect, test } from "vitest";

import { WorkspaceCreateRequestSchema } from "@getpaseo/protocol/messages";

import { createPersistedWorkspaceRecord } from "./workspace-registry.js";
import { MAX_LINKED_REPO_ROOTS, normalizeLinkedRepoRoots } from "./workspace-linked-repos.js";

const CWD = path.resolve("/tmp/multi-repo-main");

describe("normalizeLinkedRepoRoots", () => {
  test("returns no roots when none are requested", () => {
    expect(normalizeLinkedRepoRoots({ cwd: CWD, roots: undefined })).toEqual([]);
    expect(normalizeLinkedRepoRoots({ cwd: CWD, roots: [] })).toEqual([]);
  });

  test("trims entries and drops blanks", () => {
    expect(normalizeLinkedRepoRoots({ cwd: CWD, roots: ["  ", "/tmp/other  ", ""] })).toEqual([
      path.resolve("/tmp/other"),
    ]);
  });

  test("drops the workspace cwd and dedupes repeats", () => {
    expect(
      normalizeLinkedRepoRoots({
        cwd: CWD,
        roots: [CWD, "/tmp/other", "/tmp/other/", `${CWD}/`],
      }),
    ).toEqual([path.resolve("/tmp/other")]);
  });

  test("caps the number of linked roots", () => {
    const roots = Array.from(
      { length: MAX_LINKED_REPO_ROOTS + 5 },
      (_, index) => `/tmp/repo-${index}`,
    );
    expect(normalizeLinkedRepoRoots({ cwd: CWD, roots })).toHaveLength(MAX_LINKED_REPO_ROOTS);
  });
});

describe("linked repo roots persistence", () => {
  test("pre-fork records without the field still parse", () => {
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: "wks_linked_compat",
      projectId: "prj_linked_compat",
      cwd: CWD,
      kind: "directory",
      displayName: "main",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(workspace.linkedRepoRoots).toBeUndefined();
  });

  test("linked roots round-trip through the persisted record", () => {
    const linkedRepoRoots = [path.resolve("/tmp/other"), path.resolve("/tmp/notes")];
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: "wks_linked",
      projectId: "prj_linked",
      cwd: CWD,
      kind: "directory",
      displayName: "main",
      linkedRepoRoots,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(workspace.linkedRepoRoots).toEqual(linkedRepoRoots);
  });
});

describe("linked repo roots wire schema", () => {
  test("workspace.create.request parses with and without linked roots", () => {
    const base = {
      type: "workspace.create.request",
      requestId: "req-linked",
      source: { kind: "directory", path: CWD },
    } as const;
    expect(WorkspaceCreateRequestSchema.parse(base).linkedRepoRoots).toBeUndefined();
    expect(
      WorkspaceCreateRequestSchema.parse({ ...base, linkedRepoRoots: ["/tmp/other"] })
        .linkedRepoRoots,
    ).toEqual(["/tmp/other"]);
  });
});
