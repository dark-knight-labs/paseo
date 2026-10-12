# Multi-repo workspaces E2E ledger

Run: 2026-09-13 — full end-to-end per user spec (dynamic worktree picker + multi-checkout cwd + Changes/navbar switchers)
Branch: implement/multi-repo-workspaces-3254
BASE: 086b80254

## Prior slice (done, uncommitted)

- workspace-linked-repos.ts pure helper (normalizeLinkedRepoRoots, MAX 10)
- protocol linkedRepoRoots optional, COMPAT tagged
- provisioning + paseo-worktree-service + session handlers
- tests: workspace-linked-repos.test.ts 7/7, session.workspaces.test.ts linked repo cases
- fork-decision: multi-repo-context-roots
- Limitation: no client surface (CLI/client/agent/app) forwards the field

## This run — user spec (2026-09-13)

- Creation UI: default normal; when isolation=worktree, show "Add another" below project line
- "Add another" opens: project dropdown (git-driven, worktree-capable, same computer as main project, excluding already-selected) + branch dropdown (source branch for new worktree branch)
- Repeatable: "Add another" persists for N secondaries
- On create: cwd contains all projects as worktree checkouts (multi-checkout cwd)
- Changes tab: repo switcher dropdown above branch switcher when cwd has >1 worktree checkout
- Navbar: repo switcher before Run services / 3-dot menu area

## Dispatches

- workflow wf_d7f11fb1-4f4 (multi-repo-understand): 5 mappers — creation-ui, protocol-provision, changes-git, navbar-services, projects-branches — dispatched 13:26 UTC, BASE 086b80254

## Design (2026-09-13 scouting)

Key files:

- Creation UI: packages/app/src/screens/new-workspace-screen.tsx (project/isolation/base pickers + useWorkspaceIsolation + createMultiplicityWorkspace/ensureWorkspace)
- Project model: packages/app/src/projects/host-project-model.ts (HostProjectListItem = WorkspaceStructureProject; worktreeSupport per host; projectKind git/non_git)
- Client: packages/client/src/daemon-client.ts createWorkspace (source+title+firstAgentContext only) / createPaseoWorktree
- Protocol: messages.ts WorkspaceCreateRequestSchema (line 2728, linkedRepoRoots COMPAT), WorkspaceDescriptorPayloadSchema (line 4057, linkedRepoRoots COMPAT)
- Daemon: session.ts handleWorkspaceCreateWorktree (~line 6490) -> createPaseoWorktreeWorkflow -> paseo-worktree-service.ts createPaseoWorktree -> createWorkspaceForWorktree (provisioning-service.ts line 214)
- Worktree core: worktree-core.ts (single createWorktreeCore per call), worktree.ts utils (validateBranchSlug, rollbackCreatedPaseoWorktree)
- Registry: workspace-registry.ts PersistedWorkspaceRecordSchema (linkedRepoRoots COMPAT line 96-98)
- Mapper workflow wf_d7f11fb1-4f4 still running; inline scouting covered creation+protocol+provisioning. Changes-tab/navbar mapper results pending — verify against journal before building those slices.

Plan (slices, each with fork-decision entry + proof):

- Model: workspace cwd = container dir holding one subdir per repo checkout. Main repo keeps today's behavior (workspace cwd IS its checkout, single-repo workspaces unchanged). Multi-repo: daemon creates container dir, main worktree at <container>/<slug>, each secondary at <container>/<slug>-N or per-repo slug; workspace cwd = container.
  (Alternative — cwd stays main checkout + linkedRepoRoots point at secondary checkouts — rejected: user explicitly wants cwd to contain all checkouts so the agent sees them as one directory.)

1. Protocol+daemon (this slice): `secondaryWorktrees` on workspace.create worktree source: [{cwd|projectId, refName?, baseBranch?, branchName?, worktreeSlug?}] + persisted `secondaryCheckouts: [{projectId, repoRoot, worktreePath, branch, baseBranch, displayName}]` on record + descriptor echo, all COMPAT-optional. Daemon: main worktree first, then one createWorktreeCore per secondary (sequential, independent branches per vibe-kanban lesson); rollback created worktrees on partial failure; container dir layout.
2. Client forwarding: DaemonClient.createWorkspace forwards secondaryWorktrees.
3. Creation UI: "Add another" under project line iff effectiveIsolation===worktree; rows = project dropdown (git-driven, same serverId, worktreeSupport OK, exclude selected) + branch dropdown; repeatable.
4. Changes tab: repo switcher above branch switcher when secondaryCheckouts present.
5. Navbar: repo switcher before Run services.

- Mapper workflow stopped (inline scouting covered creation+protocol+provisioning; Changes/navbar mapped during implementation).

## Completions

- (pending)

## Rulings

- Reuse linkedRepoRoots slice as context-roots model; extend to worktree secondaries with per-repo source branch (new field, COMPAT-tagged)
- vibe-kanban lessons apply: per-repo independent branches, rollback partial creation, no shared branch name

## Correction (2026-09-13, post slice-1 review)

Slice 1 as built creates real secondary worktrees but scatters them across the
per-repo worktrees root — workspace cwd is still just the main checkout. That
does NOT satisfy "cwd contains all the projects as worktree checkouts".

Revised model (single workspace record, container cwd):

- Multi-repo workspace cwd = NEW container dir `<worktrees-root>/<hash>/...`
  holding one subdir per repo checkout. It is NOT itself a git repo (git CLI
  from cwd fails; agent git tools take explicit cwd per checkout — already the
  pattern: resolveScopedCwd resolves absolute paths, no same-or-descendant
  confinement on the agent cwd).
- Why not nest the container inside the main worktree (`<main>/.paseo.repos/`)?
  `git worktree list` / `git status` from the main checkout would show every
  secondary as untracked dirt, and the main repo's teardown/setup scripts would
  see foreign checkouts. A neutral container keeps each git repo clean.
- Descriptor compatibility: workspaceDirectory = container; main repo stays
  addressable via worktreeRoot/mainRepoRoot/gitRuntime exactly as today, so the
  Changes tab, branch switcher, and auto-name keep working against the main
  checkout. secondaryCheckouts (already shipped in slice 1) address the rest.
- Observer: syncObserverForWorkspace registers the container cwd (non-git, so
  it only removes state — no crash). Per-checkout snapshots already work by
  explicit cwd (getSnapshot(cwd)). Follow-up slice registers secondary
  checkouts with the observer so Changes/sidebar stay live per repo.
- Archive: resolveWorkspaceBackingDirectory takes the worktreeRoot path today
  (single worktree). Multi-repo archive must delete main + all secondary
  worktreePaths + the container. Follow-up slice extends the backing shape;
  until then archive removes the main worktree and leaves secondaries (recorded
  here as a known gap, not silent behavior).
- Legacy `create_paseo_worktree_request` path untouched: secondaries only flow
  through workspace.create.request (new field, absent = single-repo).

## Completions (2026-09-13)

- Slice 1 (daemon+protocol+client): secondaryWorktrees request field, secondaryCheckouts
  persistence + descriptor echo, sequential per-repo worktree creation with rollback,
  session validation (source/cap/duplicate), DaemonClient forwarding. All COMPAT-optional.
- Container layout: multi-repo workspace cwd = `<slug>--multi` container holding main +
  secondary checkouts as siblings (never nested in a git checkout); `git worktree repair`
  after every move; archive removes each checkout from its owning repo + container iff empty.
- Creation UI: "Add another" below project line iff worktree isolation; per-row project
  picker (git-only, same host, excludes selected) + starting-ref picker (live suggestions,
  checkout-status default base); repeatable rows; payload flows through ensureWorkspace.
- House rules honored: no useUnistyles/useQuery in new app code (themed withUnistyles icons,
  useFetchQuery via use-branch-suggestions-query.ts shared with the main picker), i18n keys
  in all 9 locales, complexity ≤20 via extraction (submit/terminal/input/checkout helpers,
  additional-repos hook + control modules, daemon record/rollback helpers).
- Fork decision: multi-repo-worktree-checkouts (+ proof). Full fork:verify green.
- Verification: typecheck 0; app+daemon lint 0 on touched files; 211 daemon/protocol tests;
  41 app tests; fork-verify all green.
- Known follow-ups (not this slice): Changes-tab repo switcher, navbar repo switcher,
  per-checkout git observer registration, CLI flags, per-repo write scopes.

## Note on full fork:verify (2026-09-13)

- 40/41 decisions pass, including new multi-repo-worktree-checkouts.
- browser-localhost-tunnel FAILs identically on the clean tree (verified via
  stash) — pre-existing breakage unrelated to this slice. Left untouched.

## Slice 2 plan — repo switchers + live per-checkout status (2026-09-13)

Surfaces:

- Changes tab: repo switcher above branch switcher iff workspace has secondaryCheckouts.
  Entry: packages/app/src/git/diff-pane.tsx ChangesRepositoryToolbar (BranchSwitcher at :631).
- Navbar: repo switcher before Run services (WorkspaceScriptsButton at workspace-screen.tsx:3802,
  mobile cluster at :1060). Descriptor via useWorkspace(normalizedServerId, normalizedWorkspaceId) (:1562).
- ChangesSurface callers pass cwd (diff-panel.tsx:132, compact-explorer-sidebar.tsx:498) — the
  switcher must re-target cwd per selected checkout (main worktreeRoot + secondary worktreePaths).

Data:

- Wire field exists (messages.ts:4130 secondaryCheckouts, COMPAT-optional) but app
  WorkspaceDescriptor (session-store.ts:107) + normalizeWorkspaceDescriptor drop it. Add
  `secondaryCheckouts?: WorkspaceSecondaryCheckout[]` passthrough (absent = single-repo).
- New shared module (e.g. packages/app/src/workspace/multi-repo-checkouts.ts): build checkout
  list [{key, displayName, worktreePath, branch, baseBranch, isMain}], selected-cwd state
  helper, loaded from useWorkspace.

Daemon:

- workspace-git-observer syncObserverForWorkspace registers workspaceDirectory only; container
  cwd is non-git so it only removes state. Extend: for records with secondaryCheckouts, also
  register each checkout path (main worktreeRoot + secondary worktreePaths) so getSnapshot/
  checkout_status/diff subscribers get live per-checkout data by explicit cwd. No schema change.
- useWorkingDiff/useCheckoutStatusQuery already take explicit cwd — no daemon RPC change needed.

Proof (new fork-decision section multi-repo-checkout-switchers):

- daemon test: observer registers secondary paths (workspace-git-observer-service.test.ts).
- app tests: checkout-list builder unit test; i18n resources test (new keys in 9 locales).

## Slice 2 implementation (2026-09-13)

Observer design (workspace-git-observer-service.ts):

- Watch targets/subscriptions stay keyed by cwd (shared across workspaces as today).
- Workspace state gains `extraCwds: Set<string>` alongside primary `cwd`: primary keeps
  exact current semantics (replace-on-change, branch/lastBranchName, descriptor key);
  extras only add watch targets + subscriptions under the same workspaceId.
- `syncObservers` registers descriptor.secondaryCheckouts[].worktreePath as extras.
  `removeForWorkspaceId` detaches the workspace from primary + all extras. Non-git
  container cwd still only removes state (no subscription), unchanged.
- Per-checkout snapshots flow through existing explicit-cwd paths (getSnapshot,
  checkout_status_request, emitStatusUpdate) — no RPC/schema change.

App design:

- session-store: WorkspaceDescriptor gains `secondaryCheckouts` passthrough (absent = []).
- New `packages/app/src/workspace/multi-repo-checkouts.ts`: pure builder
  listWorkspaceCheckouts(descriptor) -> [{key, displayName, worktreePath, branch, isMain}]
  (main = worktreeRoot ?? workspaceDirectory) + tests.
- Changes tab (diff-pane.tsx ChangesRepositoryToolbar): repo switcher above BranchSwitcher
  iff >1 checkout; selection re-targets the surface cwd (lives in ChangesSurface state or
  pane state? — ChangesSurface takes cwd prop; switcher must live where cwd is chosen:
  diff-panel.tsx WorkingDiffPanel + compact-explorer-sidebar ChangedFilesPane. Decision:
  put the switcher INSIDE ChangesSurface header (it owns cwd? No — cwd is a prop...).
  Actual decision: ChangesSurface gains optional `checkouts` prop; when >1, header shows
  repo switcher and uses selected checkout cwd for all sub-queries. Callers pass
  checkouts from useWorkspace descriptor. Single-checkout callers unchanged.
- Navbar (workspace-screen.tsx headerRight): repo switcher before WorkspaceScriptsButton
  iff >1 checkout; display-only affordance switching?? Navbar has no cwd state — switching
  there must navigate/retarget. Decision: navbar switcher opens the Changes tab scoped to
  the chosen checkout (sets pane target), NOT a global cwd switch. Hmm — user said "repo
  switcher dropdown right before the Run services button ... from where I can access the
  3 dot menu to copy workspace path". Re-read: they want the switcher THERE. Simplest
  coherent behavior: selecting a checkout copies?? No. Decision: navbar switcher selects
  the "active checkout" in a lightweight workspace-scoped store; Changes tab + copy-path
  menu read it. Copy workspace path copies the SELECTED checkout path. That matches "from
  where I can access the 3 dot menu to copy workspace path" — the switcher contextualizes
  the menu.

## Slice 2 correction — navbar switcher is display + copy-path scope (2026-09-13)

Re-read the request: "a worktree repo switcher dropdown right before the Run services
button ... from where I can access the 3 dot menu to copy workspace path". The switcher
sits next to the 3-dot menu whose Copy path action (handleCopyWorkspacePath,
workspace-screen.tsx:2820) copies workspaceDirectory. Coherent behavior without inventing
a global cwd concept:

- Navbar switcher selects among checkouts (main + secondaries); the selection is local
  component state defaulting to main, reset when workspaceId changes.
- Copy workspace path copies the SELECTED checkout path (falls back to workspaceDirectory
  for single-repo, unchanged behavior).
- Changes tab owns its own selection (per-pane, defaults main) and re-targets cwd for
  all its queries. Two independent selections is correct: navbar = "which path do I mean",
  Changes = "which repo am I reviewing". No shared store, no cross-talk.

## Slice 2 completions (2026-09-13)

- Daemon: git observer registers secondary checkout paths under the workspace id
  (extraCwds on watch state, shared subscriptions by cwd, teardown detaches all);
  worktreeRoot echoed on both descriptor paths (COMPAT-optional).
- App: WorkspaceDescriptor passthrough (secondaryCheckouts materialized, worktreeRoot
  null default); listWorkspaceCheckouts + useActiveCheckout shared module; CheckoutSwitcher
  component (toolbar trigger geometry, branch in rows); ChangesSurface checkouts prop with
  per-pane selection re-targeting all queries; both Changes callers wired; navbar switcher
  before Run services scoping Copy path; checkoutSwitcher i18n keys in 9 locales.
- Verification: typecheck 0; lint 0 on touched files; 237 daemon/protocol + 484 app tests;
  fork-verify multi-repo-checkout-switchers ok (browser-localhost-tunnel still pre-broken).

## Slice 3 plan — CLI flags for secondaries (2026-09-13)

Surface: `paseo workspace create --isolation worktree` gains repeatable `--link-repo`:

- `--link-repo <path-or-project>` (repeatable): secondary repo by local path (cwd) or
  `project:<id>` for a registered project id. Matches daemon input {cwd|projectId}.
- `--link-base <ref>` (repeatable, positional pairing): base ref for the corresponding
  --link-repo entry (maps to refName). Count must equal --link-repo count when given;
  mismatched counts are a CLI error, not a daemon round-trip.
- Daemon-side branchName/worktreeSlug stay generated (CLI does not need per-repo branch
  naming; agent auto-name covers the main branch). No baseBranch/client sidecar.
- Local isolation + --link-repo = same "Worktree options require --isolation worktree" error.
- `workspace ls` row unchanged (cwd shows the container; per-checkout listing is a later slice).

Files: cli workspace/create.ts (options + buildSecondaryWorktreeInputs + runCreateCommand
forwarding), index.ts (flag registration), create.test.ts. DaemonClient already forwards
secondaryWorktrees. Proof: CLI unit tests in fork-decision section (new or extended —
new section multi-repo-cli-link-repo).

## Slice 3 completions (2026-09-13)

- CLI: repeatable --link-repo (path | project:<id>) + positional --link-base, validated
  client-side (blanks, bases-without-repos, count mismatch, local-isolation misuse);
  forwarded via DaemonClient.secondaryWorktrees. Branch/slug stay daemon-generated.
- Verification: 14 CLI tests; typecheck 0; lint 0; fork-verify multi-repo-cli-link-repo ok.

---

# 2026-10-12: post-sync divergence recovery

## Situation (measured)

- Branch `implement/multi-repo-workspaces-3254` @ 086b80254 = old main (v0.7.2 + 112 fork cards).
- `main` @ f8a36f313 = rebased onto v0.11.1 (upstream ee0d901ef) + new fork PRs #106-#120.
- `git cherry main HEAD` reports 59 commits with no patch-id twin. Expected for a rebase
  (patch-ids shift when surrounding upstream code moved) and NOT by itself evidence of loss.
- All multi-repo work (slices 1-3) is UNCOMMITTED: 31 modified + 19 untracked = 50 paths.
- merge-base(main, HEAD) = 9400a49af (old base).

## Plan (verifiable units)

1. `skip: n/a` Protect: WIP commit the 50 paths on this branch. Verify `git status` clean and
   the multi-repo files are present in the commit. push backup branch to origin.
2. Prove main is a content-superset of old-main before discarding the branch's 112 cards:
   hunt the silent-drop shape from docs/fork-sync.md "What past syncs lost" (call site gone,
   receiving code stays). Idempotent, no code change.
3. Apply ONLY the new-work commit onto a fresh branch off `main`; resolve conflicts.
4. Verify on the real artifact: typecheck, lint, targeted tests, fork:verify, and the new
   multi-repo decisions.
