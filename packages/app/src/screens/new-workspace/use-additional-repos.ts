import { useCallback, useMemo, useRef, useState } from "react";

import { getHostProjectSourceDirectory, type HostProjectListItem } from "@/projects/host-projects";
import type { PickerItem } from "../new-workspace-picker-item";
import {
  createAdditionalRepoSelection,
  filterEligibleAdditionalProjects,
  type AdditionalRepoSelection,
} from "./additional-repos";

interface UseAdditionalReposInput {
  projects: HostProjectListItem[];
  selectedServerId: string;
  selectedProject: HostProjectListItem | null;
}

interface UseAdditionalReposResult {
  selections: AdditionalRepoSelection[];
  eligibleProjects: HostProjectListItem[];
  handleAdd: () => void;
  handleSelectProject: (key: string, project: HostProjectListItem) => void;
  handleSelectBase: (key: string, item: PickerItem) => void;
  handleRemove: (key: string) => void;
  reset: () => void;
}

// Multi-repo (#3254) additional-repository state for the creation screen. Rows
// are keyed monotonically (never reused after removal) so deleting a row never
// shifts another row's picker state.
export function useAdditionalRepos(input: UseAdditionalReposInput): UseAdditionalReposResult {
  const { projects, selectedServerId, selectedProject } = input;
  const [selections, setSelections] = useState<AdditionalRepoSelection[]>([]);
  // Write-only render state: a useState counter would re-render twice per add.
  const keyCounter = useRef(0);

  const handleAdd = useCallback(() => {
    keyCounter.current += 1;
    const key = `additional-${keyCounter.current}`;
    setSelections((current) => [...current, createAdditionalRepoSelection(key)]);
  }, []);

  const handleSelectProject = useCallback(
    (key: string, project: HostProjectListItem) => {
      const sourceDirectory = getHostProjectSourceDirectory(project, selectedServerId);
      setSelections((current) =>
        current.map((selection) =>
          selection.key === key
            ? { ...selection, project, sourceDirectory, selectedItem: null }
            : selection,
        ),
      );
    },
    [selectedServerId],
  );

  const handleSelectBase = useCallback((key: string, item: PickerItem) => {
    setSelections((current) =>
      current.map((selection) =>
        selection.key === key ? { ...selection, selectedItem: item } : selection,
      ),
    );
  }, []);

  const handleRemove = useCallback((key: string) => {
    setSelections((current) => current.filter((selection) => selection.key !== key));
  }, []);

  const reset = useCallback(() => {
    setSelections([]);
  }, []);

  const selectedViewKeys = useMemo(
    () =>
      new Set(
        selections
          .map((selection) => selection.project?.viewKey)
          .filter((viewKey): viewKey is string => Boolean(viewKey)),
      ),
    [selections],
  );

  const eligibleProjects = useMemo(
    () =>
      filterEligibleAdditionalProjects({
        projects,
        serverId: selectedServerId,
        mainProjectViewKey: selectedProject?.viewKey ?? null,
        selectedViewKeys,
      }),
    [projects, selectedProject, selectedServerId, selectedViewKeys],
  );

  return {
    selections,
    eligibleProjects,
    handleAdd,
    handleSelectProject,
    handleSelectBase,
    handleRemove,
    reset,
  };
}
