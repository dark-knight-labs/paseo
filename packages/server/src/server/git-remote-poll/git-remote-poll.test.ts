import { describe, expect, test } from "vitest";
import {
  GIT_REMOTE_POLL_QUIET_MS,
  nextRemotePollQuietDeadlineMs,
  selectRemotePollCwds,
  type RemotePollAgentClock,
  type RemotePollInput,
} from "./select-remote-poll-cwds.js";

const CWD = "/tmp/repo";
const OTHER = "/tmp/other";
const NOW = 1_000_000_000_000;

function clock(cwd: string, ageMs: number, archived = false): RemotePollAgentClock {
  return { cwd, updatedAtMs: NOW - ageMs, archived };
}

function input(
  agents: readonly RemotePollAgentClock[],
  openCwds: readonly string[] = [],
): RemotePollInput {
  return { nowMs: NOW, agents, openCwds: new Set(openCwds) };
}

describe("selectRemotePollCwds", () => {
  test("a non-archived updatedAt older than 6 hours is out, and exactly 6 hours is out", () => {
    expect(selectRemotePollCwds(input([clock(CWD, GIT_REMOTE_POLL_QUIET_MS + 1)]))).not.toContain(
      CWD,
    );
    expect(selectRemotePollCwds(input([clock(CWD, GIT_REMOTE_POLL_QUIET_MS)]))).not.toContain(CWD);
  });

  test("updatedAt of now is in, and the function has no statusEnteredAt so a 7 hour old clock is out", () => {
    expect(selectRemotePollCwds(input([clock(CWD, 0)]))).toContain(CWD);
    expect(selectRemotePollCwds(input([clock(CWD, 7 * 60 * 60 * 1000)]))).not.toContain(CWD);
  });

  test("the newest non-archived updatedAt on a directory wins", () => {
    const selected = selectRemotePollCwds(
      input([clock(CWD, GIT_REMOTE_POLL_QUIET_MS + 1), clock(CWD, 60_000), clock(CWD, 0, true)]),
    );
    expect(selected).toContain(CWD);
  });

  test("an archived agent clock does not put its directory in the set", () => {
    expect(selectRemotePollCwds(input([clock(CWD, 0, true)]))).not.toContain(CWD);
  });

  test("a non-finite updatedAt does not admit a directory", () => {
    expect(
      selectRemotePollCwds(input([{ cwd: CWD, updatedAtMs: Number.NaN, archived: false }])),
    ).not.toContain(CWD);
  });

  test("an open directory with a stale agent is in the set", () => {
    expect(
      selectRemotePollCwds(input([clock(CWD, GIT_REMOTE_POLL_QUIET_MS + 1)], [CWD])),
    ).toContain(CWD);
  });

  test("open members arm no quiet deadline, and the soonest non-open member does", () => {
    const agents = [clock(CWD, 60_000), clock(OTHER, 2 * 60_000)];
    expect(nextRemotePollQuietDeadlineMs(input(agents, [CWD, OTHER]))).toBeNull();
    expect(nextRemotePollQuietDeadlineMs(input(agents, [CWD]))).toBe(
      NOW - 2 * 60_000 + GIT_REMOTE_POLL_QUIET_MS,
    );
    expect(nextRemotePollQuietDeadlineMs(input([]))).toBeNull();
  });
});
