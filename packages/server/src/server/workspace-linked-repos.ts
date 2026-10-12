import { resolve } from "node:path";

import { areEquivalentPaths } from "../utils/path.js";

/**
 * Maximum number of linked context roots a workspace may declare.
 *
 * The cap keeps the workspace descriptor small on the wire and bounds the
 * per-create directory-existence fan-out in the session layer.
 */
export const MAX_LINKED_REPO_ROOTS = 10;

export interface NormalizeLinkedRepoRootsInput {
  cwd: string;
  roots: readonly string[] | undefined;
}

/**
 * Normalizes declared multi-repo context roots for a workspace.
 *
 * Trims entries, drops blanks, resolves lexically (matching project identity
 * semantics), drops the workspace's own cwd, dedupes preserving first-seen
 * order, and caps the result. Filesystem existence is checked by the caller
 * (the session create handlers), not here, so this stays pure and testable.
 */
export function normalizeLinkedRepoRoots(input: NormalizeLinkedRepoRootsInput): string[] {
  if (!input.roots || input.roots.length === 0) {
    return [];
  }
  const normalizedCwd = resolve(input.cwd);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const root of input.roots) {
    const trimmed = root.trim();
    if (!trimmed) {
      continue;
    }
    const resolved = resolve(trimmed);
    if (areEquivalentPaths(resolved, normalizedCwd)) {
      continue;
    }
    const key = resolved;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(resolved);
    if (result.length >= MAX_LINKED_REPO_ROOTS) {
      break;
    }
  }
  return result;
}
