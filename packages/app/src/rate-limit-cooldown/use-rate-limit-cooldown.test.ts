import { describe, expect, it } from "vitest";
import { formatCooldownCountdown, formatCooldownTimeUtc } from "./use-rate-limit-cooldown";

describe("formatCooldownCountdown", () => {
  it("formats seconds", () => {
    expect(formatCooldownCountdown(0)).toBe("0s");
    expect(formatCooldownCountdown(-500)).toBe("0s");
    expect(formatCooldownCountdown(5000)).toBe("5s");
    expect(formatCooldownCountdown(45000)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatCooldownCountdown(60000)).toBe("1m");
    expect(formatCooldownCountdown(75000)).toBe("1m 15s");
    expect(formatCooldownCountdown(14 * 60 * 1000 + 23 * 1000)).toBe("14m 23s");
  });

  it("formats hours and minutes", () => {
    expect(formatCooldownCountdown(3600000)).toBe("1h");
    expect(formatCooldownCountdown(3600000 + 15 * 60000)).toBe("1h 15m");
  });
});

describe("formatCooldownTimeUtc", () => {
  it("formats UTC time string", () => {
    const d = new Date("2026-10-20T02:00:12.000Z");
    expect(formatCooldownTimeUtc(d)).toBe("02:00:12 UTC");
  });
});
