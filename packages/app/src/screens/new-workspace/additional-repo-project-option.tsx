import { memo, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ComboboxItem } from "@/components/ui/combobox";
import { ProjectIconView } from "@/components/project-icon-view";
import { getHostProjectSourceDirectory, type HostProjectListItem } from "@/projects/host-projects";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { ICON_SIZE } from "@/styles/theme";

interface AdditionalRepoProjectOptionProps {
  optionId: string;
  project: HostProjectListItem;
  iconDataUri: string | null;
  selectedServerId: string;
  selected: boolean;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}

export const AdditionalRepoProjectOption = memo(function AdditionalRepoProjectOption({
  optionId,
  project,
  iconDataUri,
  selectedServerId,
  selected,
  active,
  disabled,
  onPress,
}: AdditionalRepoProjectOptionProps) {
  void optionId;
  const leadingSlot = useMemo(
    () => (
      <View style={styles.rowIconBox}>
        <ProjectIconView
          iconDataUri={iconDataUri}
          initial={
            projectIconPlaceholderLabelFromDisplayName(project.projectName)
              .charAt(0)
              .toUpperCase() || "?"
          }
          projectViewKey={project.viewKey}
          size={ICON_SIZE.md}
          textStyle={styles.projectIconFallbackText}
        />
      </View>
    ),
    [iconDataUri, project],
  );
  return (
    <ComboboxItem
      testID={`new-workspace-additional-project-option-${project.viewKey}`}
      label={project.projectName}
      description={
        getHostProjectSourceDirectory(project, selectedServerId) ?? project.iconWorkingDir
      }
      selected={selected}
      active={active}
      disabled={disabled}
      onPress={onPress}
      leadingSlot={leadingSlot}
    />
  );
});

const styles = StyleSheet.create(() => ({
  rowIconBox: {
    width: ICON_SIZE.md,
    height: ICON_SIZE.md,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconFallbackText: {
    fontSize: 10,
    fontWeight: "600",
  },
}));
