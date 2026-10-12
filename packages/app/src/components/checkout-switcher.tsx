import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { FolderGit2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/styles/theme";
import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToolbarLabelSelectTrigger } from "@/components/ui/toolbar-label-trigger";
import type { WorkspaceCheckoutOption } from "@/workspace/multi-repo-checkouts";

interface CheckoutSwitcherProps {
  checkouts: WorkspaceCheckoutOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  testID?: string;
}

const foregroundMutedIconColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const ThemedFolderGit = withUnistyles(FolderGit2);

/**
 * Fork multi-repo (#3254): switches which checkout of a multi-repo workspace a
 * surface operates on. Rendered only when the workspace owns >1 checkout;
 * single-repo surfaces never mount it.
 */
export function CheckoutSwitcher({
  checkouts,
  selectedKey,
  onSelect,
  testID = "checkout-switcher",
}: CheckoutSwitcherProps) {
  const { t } = useTranslation();
  const anchorRef = useRef<View>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleSelect = useCallback(
    (key: string) => {
      onSelect(key);
      setIsOpen(false);
    },
    [onSelect],
  );

  const selected = checkouts.find((checkout) => checkout.key === selectedKey) ?? checkouts[0];
  const options = useMemo(
    () =>
      checkouts.map((checkout) => ({
        id: checkout.key,
        label: checkout.displayName,
      })),
    [checkouts],
  );

  const leadingSlot = useMemo(
    () => <ThemedFolderGit size={14} uniProps={foregroundMutedIconColorMapping} />,
    [],
  );

  const renderOption = useCallback<NonNullable<ComboboxProps["renderOption"]>>(
    ({ option, selected: isSelected, active, onPress }) => {
      const checkout = checkouts.find((candidate) => candidate.key === option.id);
      return (
        <ComboboxItem
          label={option.label}
          description={checkout?.branch ?? undefined}
          selected={isSelected}
          active={active}
          onPress={onPress}
          leadingSlot={leadingSlot}
        />
      );
    },
    [checkouts, leadingSlot],
  );

  if (!selected) {
    return null;
  }

  return (
    <View ref={anchorRef} collapsable={false} style={styles.anchor}>
      <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <ToolbarLabelSelectTrigger
            testID={testID}
            label={selected.displayName}
            open={isOpen}
            onPress={handleOpen}
            accessibilityRole="button"
            accessibilityLabel={t("checkoutSwitcher.currentCheckout", {
              name: selected.displayName,
            })}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <Text style={styles.tooltipText}>{t("checkoutSwitcher.triggerTooltip")}</Text>
        </TooltipContent>
      </Tooltip>
      <Combobox
        options={options}
        value={selected.key}
        onSelect={handleSelect}
        searchable
        placeholder={t("checkoutSwitcher.placeholder")}
        searchPlaceholder={t("checkoutSwitcher.searchPlaceholder")}
        emptyText={t("checkoutSwitcher.empty")}
        title={t("checkoutSwitcher.title")}
        open={isOpen}
        onOpenChange={setIsOpen}
        anchorRef={anchorRef}
        desktopPlacement="bottom-start"
        desktopPreventInitialFlash
        desktopMinWidth={280}
        renderOption={renderOption}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  anchor: {
    flexShrink: 1,
    minWidth: 0,
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
  },
}));
