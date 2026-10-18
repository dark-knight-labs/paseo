import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { OfficePreviewProps } from "./office-preview";

// The renderers need a DOM node. Native shows the same unavailable state other binary files do.
export function OfficePreview({ label }: OfficePreviewProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.centerState} accessibilityLabel={label}>
      <Text style={styles.emptyText}>{t("panels.file.binaryPreviewUnavailable")}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
