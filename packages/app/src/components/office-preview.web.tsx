import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, type LayoutChangeEvent, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { openOfficePreview } from "@/components/office-preview-render.web";
import type { OfficePreviewProps } from "./office-preview";

type PreviewPhase = "loading" | "ready" | "failed";

export function OfficePreview({ uri, label, kind }: OfficePreviewProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<PreviewPhase>("loading");
  const [width, setWidth] = useState(0);
  const measureWidth = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next <= 0) return;
    setWidth((current) => (current > 0 ? current : next));
  }, []);

  useEffect(() => {
    const node = hostRef.current;
    if (width <= 0) return;
    if (!(node instanceof HTMLElement)) {
      setPhase("failed");
      return;
    }

    let cancelled = false;
    let session: { destroy: () => void } | null = null;
    setPhase("loading");
    node.replaceChildren();

    void (async () => {
      try {
        const response = await fetch(uri);
        if (!response.ok) throw new Error("preview fetch failed");
        const data = await response.arrayBuffer();
        if (cancelled) return;
        session = await openOfficePreview({ kind, host: node, data, width });
        if (cancelled) {
          session.destroy();
          session = null;
          return;
        }
        setPhase("ready");
      } catch {
        if (!cancelled) {
          node.replaceChildren();
          setPhase("failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      session?.destroy();
      session = null;
    };
  }, [kind, uri, width]);

  return (
    <View
      style={styles.container}
      accessibilityLabel={label}
      testID="office-file-preview"
      onLayout={measureWidth}
    >
      <View ref={hostRef as never} style={phase === "failed" ? styles.hiddenHost : styles.host} />
      {phase === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" />
        </View>
      ) : null}
      {phase === "failed" ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{t("panels.file.failedToLoadPreview")}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  host: {
    flex: 1,
    minHeight: 0,
  },
  hiddenHost: {
    display: "none",
  },
  loading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
