import { useTranslation } from "react-i18next";

import type { BranchSuggestionsResponse } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

export const BRANCH_SUGGESTIONS_STALE_TIME_MS = 15_000;

interface BranchSuggestionsClient {
  getBranchSuggestions: (
    options: { cwd: string; query?: string; limit?: number },
    requestId?: string,
  ) => Promise<BranchSuggestionsResponse["payload"]>;
}

interface UseBranchSuggestionsQueryInput {
  serverId: string;
  cwd: string | null;
  query?: string;
  limit?: number;
  enabled?: boolean;
}

export function branchSuggestionsQueryKey(
  serverId: string,
  cwd: string | null,
  query: string,
  limit: number,
) {
  return ["branch-suggestions", serverId, cwd ?? "", query.trim(), limit] as const;
}

export function buildBranchSuggestionsQueryOptions(
  input: UseBranchSuggestionsQueryInput & {
    client: BranchSuggestionsClient | null;
    isConnected: boolean;
    hostDisconnectedMessage: string;
  },
) {
  const trimmedQuery = input.query?.trim() ?? "";
  const limit = input.limit ?? 20;
  return {
    queryKey: branchSuggestionsQueryKey(input.serverId, input.cwd, trimmedQuery, limit),
    queryFn: async () => {
      if (!input.client) {
        throw new Error(input.hostDisconnectedMessage);
      }
      if (!input.cwd) {
        throw new Error(input.hostDisconnectedMessage);
      }
      return input.client.getBranchSuggestions({
        cwd: input.cwd,
        ...(trimmedQuery ? { query: trimmedQuery } : {}),
        limit,
      });
    },
    enabled:
      Boolean(input.client) && input.isConnected && Boolean(input.cwd) && (input.enabled ?? true),
    dataShape: "list" as const,
    staleTimeMs: BRANCH_SUGGESTIONS_STALE_TIME_MS,
  };
}

export function useBranchSuggestionsQuery(input: UseBranchSuggestionsQueryInput) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(input.serverId);
  const isConnected = useHostRuntimeIsConnected(input.serverId);
  return useFetchQuery(
    buildBranchSuggestionsQueryOptions({
      ...input,
      client,
      isConnected,
      hostDisconnectedMessage: t("common.errors.daemonClientUnavailable"),
    }),
  );
}
