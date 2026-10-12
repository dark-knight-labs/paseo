import { memo, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GitBranch } from "lucide-react-native";

import { ComboboxItem } from "@/components/ui/combobox";
import { pickerItemLabel, type PickerItem } from "../new-workspace-picker-item";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedGitBranch = withUnistyles(GitBranch);
const gitBranchIconProps = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

interface AdditionalRepoBaseOptionProps {
  item: Extract<PickerItem, { kind: "branch" }>;
  selected: boolean;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}

export const AdditionalRepoBaseOption = memo(function AdditionalRepoBaseOption({
  item,
  selected,
  active,
  disabled,
  onPress,
}: AdditionalRepoBaseOptionProps) {
  const leadingSlot = useMemo(
    () => (
      <View style={styles.rowIconBox}>
        <ThemedGitBranch size={ICON_SIZE.sm} uniProps={gitBranchIconProps} />
      </View>
    ),
    [],
  );
  return (
    <ComboboxItem
      testID={`new-workspace-additional-base-branch-${item.name}`}
      label={pickerItemLabel(item)}
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
}));
