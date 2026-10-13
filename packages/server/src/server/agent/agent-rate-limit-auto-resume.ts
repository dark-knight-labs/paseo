import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Logger } from "pino";
import { writeJsonFileAtomic } from "../atomic-file.js";
import type { AgentManager } from "./agent-manager.js";
import type { AgentStorage } from "./agent-storage.js";
import { formatSystemNotificationPrompt, sendPromptToAgent } from "./agent-prompt.js";
import { ensureAgentLoaded } from "./agent-loading.js";
import type { DaemonConfigStore } from "../daemon-config-store.js";
import { isRateLimitAutoResumeDisabled } from "@getpaseo/protocol/agent-labels";

export const DEFAULT_RATE_LIMIT_AUTO_RESUME_PROMPT = "Resume - rate limit cooldown has ended";
export const RATE_LIMIT_AUTO_RESUME_PENDING_FILE = "pending-rate-limit-auto-resumes.json";

// Matches RETRY_AFTER:YYYY-MM-DDTHH:MM:SSZ or with fractional seconds (.123Z) at the end of a message
export const RETRY_AFTER_PATTERN =
  /(?:^|\s)RETRY_AFTER:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*$/;

export function extractRetryAfterTimestamp(text: string | null | undefined): Date | null {
  if (!text) return null;
  const match = text.match(RETRY_AFTER_PATTERN);
  if (!match) return null;
  const parsed = new Date(match[1]);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

const PendingRateLimitRecordSchema = z.object({
  agentId: z.string(),
  scheduledFor: z.string(),
  retryAfter: z.string(),
  createdAt: z.string(),
});

export type PendingRateLimitRecord = z.infer<typeof PendingRateLimitRecordSchema>;

const PendingRateLimitFileSchema = z.array(PendingRateLimitRecordSchema);

export function getPendingRateLimitPath(paseoHome: string): string {
  return path.join(paseoHome, RATE_LIMIT_AUTO_RESUME_PENDING_FILE);
}

export async function readPendingRateLimitRecords(
  paseoHome: string,
  logger?: Pick<Logger, "warn">,
): Promise<PendingRateLimitRecord[]> {
  const filePath = getPendingRateLimitPath(paseoHome);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    const result = PendingRateLimitFileSchema.safeParse(parsed);
    if (!result.success) {
      logger?.warn?.(
        { err: result.error, filePath },
        "Invalid pending rate limit auto-resume file, ignoring",
      );
      return [];
    }
    return result.data;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    logger?.warn?.({ err: error, filePath }, "Failed to read pending rate limit auto-resume file");
    return [];
  }
}

export async function writePendingRateLimitRecords(
  paseoHome: string,
  records: PendingRateLimitRecord[],
  logger?: Pick<Logger, "warn" | "info">,
): Promise<void> {
  const filePath = getPendingRateLimitPath(paseoHome);
  if (records.length === 0) {
    try {
      await fs.rm(filePath, { force: true });
    } catch (error) {
      logger?.warn?.(
        { err: error, filePath },
        "Failed to clear pending rate limit auto-resume file",
      );
    }
    return;
  }
  try {
    await writeJsonFileAtomic(filePath, records);
  } catch (error) {
    logger?.warn?.({ err: error, filePath }, "Failed to write pending rate limit auto-resume file");
  }
}

interface ActiveTimerEntry {
  timeout: NodeJS.Timeout;
  scheduledFor: Date;
  retryAfter: string;
}

export interface AgentRateLimitAutoResumeManagerDependencies {
  paseoHome: string;
  agentManager: Pick<AgentManager, "appendTimelineItem" | "getAgent">;
  agentStorage: AgentStorage;
  daemonConfigStore: Pick<DaemonConfigStore, "get">;
  logger: Logger;
  sendPrompt?: typeof sendPromptToAgent;
}

export class AgentRateLimitAutoResumeManager {
  private readonly paseoHome: string;
  private readonly agentManager: Pick<AgentManager, "appendTimelineItem" | "getAgent">;
  private readonly agentStorage: AgentStorage;
  private readonly daemonConfigStore: Pick<DaemonConfigStore, "get">;
  private readonly logger: Logger;
  private readonly send: typeof sendPromptToAgent;
  private readonly activeTimers = new Map<string, ActiveTimerEntry>();
  private persistenceChain = Promise.resolve();

  constructor(dependencies: AgentRateLimitAutoResumeManagerDependencies) {
    this.paseoHome = dependencies.paseoHome;
    this.agentManager = dependencies.agentManager;
    this.agentStorage = dependencies.agentStorage;
    this.daemonConfigStore = dependencies.daemonConfigStore;
    this.logger = dependencies.logger;
    this.send = dependencies.sendPrompt ?? sendPromptToAgent;
  }

  hasPending(agentId: string): boolean {
    return this.activeTimers.has(agentId);
  }

  getPending(agentId: string): { scheduledFor: Date; retryAfter: string } | null {
    const entry = this.activeTimers.get(agentId);
    if (!entry) return null;
    return { scheduledFor: entry.scheduledFor, retryAfter: entry.retryAfter };
  }

  isEnabledForAgent(agentId: string): boolean {
    const globalConfig = this.daemonConfigStore.get();
    if (globalConfig.autoResumeOnRateLimit === false) {
      return false;
    }
    const agent = this.agentManager.getAgent(agentId);
    if (!agent || agent.lifecycle === "closed") {
      return false;
    }
    if (isRateLimitAutoResumeDisabled(agent.labels)) {
      return false;
    }
    return true;
  }

  scheduleIfNeeded(agentId: string, text: string | null | undefined): boolean {
    const retryDate = extractRetryAfterTimestamp(text);
    if (!retryDate) {
      return false;
    }
    if (!this.isEnabledForAgent(agentId)) {
      this.logger.debug(
        { agentId },
        "Skipping rate limit auto-resume: disabled globally or for agent",
      );
      return false;
    }

    const iso = retryDate.toISOString();
    const now = Date.now();
    if (retryDate.getTime() <= now) {
      this.logger.debug(
        { agentId, scheduledFor: iso },
        "Skipping rate limit auto-resume: timestamp is not in the future",
      );
      return false;
    }

    this.cancelTimerOnly(agentId);
    const delayMs = retryDate.getTime() - now;
    this.logger.info(
      { agentId, scheduledFor: iso, delayMs },
      "Scheduling auto-resume after rate limit cooldown",
    );

    const timeout = setTimeout(() => {
      void this.triggerResume(agentId);
    }, delayMs);

    this.activeTimers.set(agentId, {
      timeout,
      scheduledFor: retryDate,
      retryAfter: iso,
    });

    void this.persistActiveTimers();
    return true;
  }

  cancel(agentId: string): void {
    if (!this.activeTimers.has(agentId)) return;
    this.cancelTimerOnly(agentId);
    void this.persistActiveTimers();
    this.logger.debug({ agentId }, "Canceled pending rate limit auto-resume");
  }

  cancelAll(): void {
    for (const entry of this.activeTimers.values()) {
      clearTimeout(entry.timeout);
    }
    this.activeTimers.clear();
    void writePendingRateLimitRecords(this.paseoHome, [], this.logger);
  }

  private cancelTimerOnly(agentId: string): void {
    const existing = this.activeTimers.get(agentId);
    if (existing) {
      clearTimeout(existing.timeout);
      this.activeTimers.delete(agentId);
    }
  }

  waitForPersistence(): Promise<void> {
    return this.persistenceChain;
  }

  private async persistActiveTimers(): Promise<void> {
    const records: PendingRateLimitRecord[] = [];
    for (const [agentId, entry] of this.activeTimers.entries()) {
      records.push({
        agentId,
        scheduledFor: entry.scheduledFor.toISOString(),
        retryAfter: entry.retryAfter,
        createdAt: new Date().toISOString(),
      });
    }
    this.persistenceChain = this.persistenceChain
      .then(async () => {
        await writePendingRateLimitRecords(this.paseoHome, records, this.logger);
        return undefined;
      })
      .catch((err) => {
        this.logger.warn({ err }, "Failed in persistenceChain");
        return undefined;
      });
    await this.persistenceChain;
  }

  async triggerResume(agentId: string): Promise<void> {
    this.cancelTimerOnly(agentId);
    void this.persistActiveTimers();

    if (!this.isEnabledForAgent(agentId)) {
      this.logger.info(
        { agentId },
        "Rate limit auto-resume aborted: no longer enabled or agent archived",
      );
      return;
    }

    const agent = this.agentManager.getAgent(agentId);
    if (!agent || agent.lifecycle === "closed") {
      return;
    }
    const stored = await this.agentStorage.get(agentId);
    if (stored?.archivedAt) {
      return;
    }

    this.logger.info({ agentId }, "Executing auto-resume after rate limit cooldown");
    try {
      await ensureAgentLoaded(agentId, {
        agentManager: this.agentManager as unknown as AgentManager,
        agentStorage: this.agentStorage,
        logger: this.logger,
      });

      await this.agentManager.appendTimelineItem(agentId, {
        type: "resume",
        reason: "rate_limit_retry",
      });

      await this.send({
        agentManager: this.agentManager as unknown as AgentManager,
        agentStorage: this.agentStorage,
        agentId,
        prompt: formatSystemNotificationPrompt(DEFAULT_RATE_LIMIT_AUTO_RESUME_PROMPT),
        logger: this.logger,
        unarchive: false,
      });

      this.logger.info({ agentId }, "Rate limit auto-resume continuation dispatched successfully");
    } catch (error) {
      this.logger.warn({ err: error, agentId }, "Failed to execute rate limit auto-resume");
    }
  }

  async bootstrap(): Promise<void> {
    const records = await readPendingRateLimitRecords(this.paseoHome, this.logger);
    if (records.length === 0) return;

    this.logger.info(
      { count: records.length },
      "Restoring pending rate limit auto-resume timers after restart",
    );

    const now = Date.now();
    const globalConfig = this.daemonConfigStore.get();
    if (globalConfig.autoResumeOnRateLimit === false) {
      return;
    }

    for (const record of records) {
      const stored = await this.agentStorage.get(record.agentId);
      if (!stored || stored.archivedAt) {
        continue;
      }
      if (isRateLimitAutoResumeDisabled(stored.labels)) {
        continue;
      }
      const targetDate = new Date(record.scheduledFor);
      if (Number.isNaN(targetDate.getTime())) {
        continue;
      }

      if (targetDate.getTime() <= now) {
        // Cooldown expired while daemon was down -> trigger immediately
        this.logger.info(
          { agentId: record.agentId, scheduledFor: record.scheduledFor },
          "Rate limit cooldown expired during downtime, triggering immediate resume",
        );
        await this.triggerResume(record.agentId);
      } else {
        const delayMs = targetDate.getTime() - now;
        this.logger.info(
          { agentId: record.agentId, scheduledFor: record.scheduledFor, delayMs },
          "Rescheduling rate limit auto-resume timer after restart",
        );
        const timeout = setTimeout(() => {
          void this.triggerResume(record.agentId);
        }, delayMs);
        this.activeTimers.set(record.agentId, {
          timeout,
          scheduledFor: targetDate,
          retryAfter: record.retryAfter,
        });
      }
    }

    void this.persistActiveTimers();
  }
}
