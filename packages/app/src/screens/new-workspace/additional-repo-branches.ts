import { useMemo } from "react";

import { useBranchSuggestionsQuery } from "@/git/use-branch-suggestions-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import {
  buildPickerOptionData,
  defaultBasePickerItem,
  type BranchPickerDetail,
  type PickerItem,
  type PickerOptionData,
} from "../new-workspace-picker-item";

interface AdditionalRepoBasePickerInput {
  serverId: string;
  sourceDirectory: string | null;
  searchQuery: string;
  enabled: boolean;
  selectedItem: PickerItem | null;
}

function toBranchPickerDetails(
  details: readonly {
    name: string;
    committerDate: number;
    hasLocal?: boolean;
    hasRemote?: boolean;
    localAhead?: number;
    localBehind?: number;
  }[],
): BranchPickerDetail[] {
  return details.map((detail) => ({
    name: detail.name,
    committerDate: detail.committerDate,
    ...(detail.hasLocal !== undefined ? { hasLocal: detail.hasLocal } : {}),
    ...(detail.hasRemote !== undefined ? { hasRemote: detail.hasRemote } : {}),
    ...(detail.localAhead !== undefined ? { localAhead: detail.localAhead } : {}),
    ...(detail.localBehind !== undefined ? { localBehind: detail.localBehind } : {}),
  }));
}

export function useAdditionalRepoBasePicker(input: AdditionalRepoBasePickerInput): {
  data: PickerOptionData;
  isFetching: boolean;
} {
  // The repo's own checkout status gives the same "current branch, prefer
  // upstream" default base the main picker uses — cached, no extra fetch.
  const { status: checkoutStatus } = useCheckoutStatusQuery({
    serverId: input.serverId,
    cwd: input.sourceDirectory ?? "",
  });
  // Live suggestions load lazily: only the selected repo's cwd is queried,
  // only while its base picker is open. Closed rows cost nothing.
  const branchQuery = useBranchSuggestionsQuery({
    serverId: input.serverId,
    cwd: input.sourceDirectory ?? "",
    query: input.searchQuery,
    limit: 20,
    enabled: input.enabled && Boolean(input.sourceDirectory),
  });
  const data = useMemo(() => {
    const baseItem =
      input.selectedItem ??
      defaultBasePickerItem({
        currentBranch:
          checkoutStatus && "currentBranch" in checkoutStatus
            ? (checkoutStatus.currentBranch ?? null)
            : null,
        upstreamRef: checkoutStatus?.upstreamRef ?? null,
      });
    return buildPickerOptionData({
      branchDetails: toBranchPickerDetails(branchQuery.data?.branchDetails ?? []),
      prItems: [],
      baseItem,
    });
  }, [branchQuery.data, checkoutStatus, input.selectedItem]);
  return { data, isFetching: branchQuery.isFetching };
}
