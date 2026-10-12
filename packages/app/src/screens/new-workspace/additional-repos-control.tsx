import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { HostProjectListItem } from "@/projects/host-projects";
import type { PickerItem } from "../new-workspace-picker-item";
import type { AdditionalRepoSelection } from "./additional-repos";
import { AdditionalRepoRow } from "./additional-repo-row";
import { MetaChevron } from "./meta-chevron";

interface AdditionalReposControlProps {
  isCompact: boolean;
  isPending: boolean;
  selections: AdditionalRepoSelection[];
  eligibleProjects: HostProjectListItem[];
  selectedServerId: string;
  badgePressableStyle: React.ComponentProps<typeof Pressable>["style"];
  onAdd: () => void;
  onSelectProject: (key: string, project: HostProjectListItem) => void;
  onSelectBase: (key: string, item: PickerItem) => void;
  onRemove: (key: string) => void;
  addLabel: string;
}

// Module-stable chevrons: shared element references so every row and the
// add button render the same chevron without recreating it per render.
const rowChevron = <MetaChevron />;
const addButtonChevron = <MetaChevron />;

export function AdditionalReposControl({
  isCompact,
  isPending,
  selections,
  eligibleProjects,
  selectedServerId,
  badgePressableStyle,
  onAdd,
  onSelectProject,
  onSelectBase,
  onRemove,
  addLabel,
}: AdditionalReposControlProps) {
  return (
    <View style={isCompact ? styles.additionalReposStack : styles.additionalReposRow}>
      {selections.map((selection) => (
        <AdditionalRepoRow
          key={selection.key}
          selection={selection}
          eligibleProjects={eligibleProjects}
          selectedServerId={selectedServerId}
          isPending={isPending}
          badgePressableStyle={badgePressableStyle}
          chevron={rowChevron}
          onSelectProject={onSelectProject}
          onSelectBase={onSelectBase}
          onRemove={onRemove}
        />
      ))}
      <Pressable
        testID="new-workspace-add-another-repo"
        onPress={onAdd}
        disabled={isPending}
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        style={badgePressableStyle}
      >
        <Text style={styles.badgeText} numberOfLines={1}>
          {addLabel}
        </Text>
        {addButtonChevron}
      </Pressable>
    </View>
  );
}

interface AdditionalReposChildrenInput {
  visible: boolean;
  isCompact: boolean;
  isPending: boolean;
  selections: AdditionalRepoSelection[];
  eligibleProjects: HostProjectListItem[];
  selectedServerId: string;
  badgePressableStyle: React.ComponentProps<typeof Pressable>["style"];
  onAdd: () => void;
  onSelectProject: (key: string, project: HostProjectListItem) => void;
  onSelectBase: (key: string, item: PickerItem) => void;
  onRemove: (key: string) => void;
  addLabel: string;
}

// Plain element builder (not a hook): returns the "Add another" subtree or
// null. Keeps the creation screen free of multi-repo JSX branches.
export function buildAdditionalReposChildren(
  input: AdditionalReposChildrenInput,
): React.ReactElement | null {
  if (!input.visible) return null;
  return (
    <AdditionalReposControl
      isCompact={input.isCompact}
      isPending={input.isPending}
      selections={input.selections}
      eligibleProjects={input.eligibleProjects}
      selectedServerId={input.selectedServerId}
      badgePressableStyle={input.badgePressableStyle}
      onAdd={input.onAdd}
      onSelectProject={input.onSelectProject}
      onSelectBase={input.onSelectBase}
      onRemove={input.onRemove}
      addLabel={input.addLabel}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  additionalReposRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingLeft: theme.spacing[4],
    paddingRight: theme.spacing[4],
    gap: theme.spacing[2],
  },
  additionalReposStack: {
    gap: theme.spacing[2],
  },
  badgeText: {
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
}));
