import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";

import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption as ComboboxOptionType } from "@/components/ui/combobox";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { ProjectIconView } from "@/components/project-icon-view";
import type { HostProjectListItem } from "@/projects/host-projects";
import { useProjectIcons } from "@/projects/icons";
import { buildNewWorkspaceProjectIconTargets } from "./project-icon-targets";
import { pickerItemLabel, type PickerItem } from "../new-workspace-picker-item";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { ICON_SIZE } from "@/styles/theme";
import type { AdditionalRepoSelection } from "./additional-repos";
import { useAdditionalRepoBasePicker } from "./additional-repo-branches";
import { AdditionalRepoBaseOption } from "./additional-repo-base-option";
import {
  ADDITIONAL_REPO_ICON_SIZE,
  AdditionalRepoBranchIcon,
  AdditionalRepoFolderIcon,
  AdditionalRepoRemoveIcon,
  additionalRepoMutedIconProps,
} from "./additional-repo-icons";
import { AdditionalRepoProjectOption } from "./additional-repo-project-option";

interface AdditionalRepoRowProps {
  selection: AdditionalRepoSelection;
  eligibleProjects: HostProjectListItem[];
  selectedServerId: string;
  isPending: boolean;
  badgePressableStyle: React.ComponentProps<typeof Pressable>["style"];
  chevron: React.ReactNode;
  onSelectProject: (key: string, project: HostProjectListItem) => void;
  onSelectBase: (key: string, item: PickerItem) => void;
  onRemove: (key: string) => void;
}

function projectOptionId(viewKey: string): string {
  return `additional-project:${viewKey}`;
}

export function AdditionalRepoRow({
  selection,
  eligibleProjects,
  selectedServerId,
  isPending,
  badgePressableStyle,
  chevron,
  onSelectProject,
  onSelectBase,
  onRemove,
}: AdditionalRepoRowProps) {
  const { t } = useTranslation();
  const [projectOpen, setProjectOpen] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);
  const [baseQuery, setBaseQuery] = useState("");
  const projectAnchorRef = useRef<View>(null);
  const baseAnchorRef = useRef<View>(null);

  const projectByOptionId = useMemo(() => {
    const map = new Map<string, HostProjectListItem>();
    for (const project of eligibleProjects) {
      map.set(projectOptionId(project.viewKey), project);
    }
    if (selection.project && !map.has(projectOptionId(selection.project.viewKey))) {
      map.set(projectOptionId(selection.project.viewKey), selection.project);
    }
    return map;
  }, [eligibleProjects, selection.project]);

  const projectOptions: ComboboxOptionType[] = useMemo(
    () =>
      [...projectByOptionId.values()].map((project) => ({
        id: projectOptionId(project.viewKey),
        label: project.projectName,
      })),
    [projectByOptionId],
  );

  const iconTargets = useMemo(
    () => buildNewWorkspaceProjectIconTargets([...projectByOptionId.values()], selectedServerId),
    [projectByOptionId, selectedServerId],
  );
  const iconDataByKey = useProjectIcons({ projects: iconTargets });

  const { data: baseData, isFetching: baseFetching } = useAdditionalRepoBasePicker({
    serverId: selectedServerId,
    sourceDirectory: selection.sourceDirectory,
    searchQuery: baseQuery,
    enabled: baseOpen,
    selectedItem: selection.selectedItem,
  });

  const openProjectPicker = useCallback(() => setProjectOpen(true), []);
  const openBasePicker = useCallback(() => setBaseOpen(true), []);
  const closeBasePicker = useCallback((open: boolean) => {
    setBaseOpen(open);
    if (!open) setBaseQuery("");
  }, []);
  const handleSelectProjectOption = useCallback(
    (id: string) => {
      const project = projectByOptionId.get(id);
      if (project) onSelectProject(selection.key, project);
      setProjectOpen(false);
    },
    [onSelectProject, projectByOptionId, selection.key],
  );
  const handleSelectBaseOption = useCallback(
    (id: string) => {
      const item = baseData.itemById.get(id);
      if (item) onSelectBase(selection.key, item);
      setBaseOpen(false);
      setBaseQuery("");
    },
    [baseData.itemById, onSelectBase, selection.key],
  );
  const handleRemove = useCallback(() => onRemove(selection.key), [onRemove, selection.key]);
  const renderProjectOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOptionType;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => {
      const project = projectByOptionId.get(option.id);
      if (!project) return <View key={option.id} />;
      return (
        <AdditionalRepoProjectOption
          optionId={option.id}
          project={project}
          iconDataUri={iconDataByKey.get(project.viewKey) ?? null}
          selectedServerId={selectedServerId}
          selected={selected}
          active={active}
          disabled={isPending}
          onPress={onPress}
        />
      );
    },
    [iconDataByKey, isPending, projectByOptionId, selectedServerId],
  );
  const renderBaseOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOptionType;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => {
      const item = baseData.itemById.get(option.id);
      if (!item || item.kind !== "branch") return <View key={option.id} />;
      return (
        <AdditionalRepoBaseOption
          item={item}
          selected={selected}
          active={active}
          disabled={isPending}
          onPress={onPress}
        />
      );
    },
    [baseData.itemById, isPending],
  );

  const projectLabel =
    selection.project?.projectName ?? t("newWorkspace.additionalRepos.projectPlaceholder");
  const baseLabel = selection.selectedItem
    ? pickerItemLabel(selection.selectedItem)
    : t("newWorkspace.additionalRepos.basePlaceholder");
  const placeholderInitial =
    projectIconPlaceholderLabelFromDisplayName(projectLabel).charAt(0).toUpperCase() || "?";

  return (
    <View style={styles.row}>
      <ComboboxTrigger
        chevron={chevron}
        ref={projectAnchorRef}
        testID={`new-workspace-additional-project-trigger-${selection.key}`}
        onPress={openProjectPicker}
        disabled={isPending}
        style={badgePressableStyle}
        accessibilityRole="button"
        accessibilityLabel={t("newWorkspace.additionalRepos.projectTitle")}
      >
        <View style={styles.badgeIconBox}>
          {selection.project ? (
            <ProjectIconView
              iconDataUri={iconDataByKey.get(selection.project.viewKey) ?? null}
              initial={placeholderInitial}
              projectViewKey={selection.project.viewKey}
              size={ICON_SIZE.md}
              textStyle={styles.projectIconFallbackText}
            />
          ) : (
            <AdditionalRepoFolderIcon
              size={ADDITIONAL_REPO_ICON_SIZE}
              uniProps={additionalRepoMutedIconProps}
            />
          )}
        </View>
        <Text style={styles.badgeText} numberOfLines={1}>
          {projectLabel}
        </Text>
      </ComboboxTrigger>
      <Combobox
        options={projectOptions}
        value={selection.project ? projectOptionId(selection.project.viewKey) : ""}
        onSelect={handleSelectProjectOption}
        searchable
        searchPlaceholder="Search projects"
        title={t("newWorkspace.additionalRepos.projectTitle")}
        open={projectOpen}
        onOpenChange={setProjectOpen}
        desktopPlacement="bottom-start"
        desktopMinWidth={360}
        anchorRef={projectAnchorRef}
        emptyText={t("newWorkspace.additionalRepos.noEligibleProjects")}
        renderOption={renderProjectOption}
      />
      <ComboboxTrigger
        chevron={chevron}
        ref={baseAnchorRef}
        testID={`new-workspace-additional-base-trigger-${selection.key}`}
        onPress={openBasePicker}
        disabled={isPending || !selection.sourceDirectory}
        style={badgePressableStyle}
        accessibilityRole="button"
        accessibilityLabel={t("newWorkspace.refPicker.startingRef")}
      >
        <View style={styles.badgeIconBox}>
          <AdditionalRepoBranchIcon
            size={ADDITIONAL_REPO_ICON_SIZE}
            uniProps={additionalRepoMutedIconProps}
          />
        </View>
        <Text style={styles.badgeText} numberOfLines={1}>
          {baseLabel}
        </Text>
      </ComboboxTrigger>
      <Combobox
        options={baseData.options}
        value={baseData.selectedOptionId}
        onSelect={handleSelectBaseOption}
        searchable
        searchPlaceholder={t("newWorkspace.refPicker.searchPlaceholder")}
        title={t("newWorkspace.refPicker.title")}
        open={baseOpen}
        onOpenChange={closeBasePicker}
        onSearchQueryChange={setBaseQuery}
        desktopPlacement="bottom-start"
        anchorRef={baseAnchorRef}
        emptyText={
          baseFetching
            ? t("newWorkspace.refPicker.searching")
            : t("newWorkspace.refPicker.noMatchingRefs")
        }
        renderOption={renderBaseOption}
      />
      <Pressable
        testID={`new-workspace-additional-remove-${selection.key}`}
        onPress={handleRemove}
        disabled={isPending}
        accessibilityRole="button"
        accessibilityLabel={t("newWorkspace.additionalRepos.remove", {
          name: selection.project?.projectName ?? "",
        })}
        style={styles.removeButton}
      >
        <AdditionalRepoRemoveIcon
          size={ADDITIONAL_REPO_ICON_SIZE}
          uniProps={additionalRepoMutedIconProps}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  badgeText: {
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
  badgeIconBox: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectIconFallbackText: {
    fontSize: 10,
    fontWeight: "600",
  },
  removeButton: {
    width: theme.iconSize.lg,
    height: theme.iconSize.lg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
}));
