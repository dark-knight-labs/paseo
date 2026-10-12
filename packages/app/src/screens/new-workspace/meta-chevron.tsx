import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown } from "lucide-react-native";

import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedChevronDown = withUnistyles(ChevronDown);
const chevronExtraMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });

// Every picker chip on the creation screens shares one chevron so they stay a
// single visual family. Extra-muted: the chevron is an affordance, not
// information, and it should sit behind the label it belongs to.
export function MetaChevron() {
  return (
    <View style={styles.chevronContainer}>
      <ThemedChevronDown size={ICON_SIZE.sm} uniProps={chevronExtraMutedMapping} />
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  chevronContainer: {
    flexShrink: 0,
    transform: [{ translateY: 1 }],
  },
}));
