import { Buffer } from "buffer";
import {
  applyOfficePreviewMessage,
  createOfficePreviewAssembly,
  type OfficePreviewAssembly,
  type OfficePreviewDocument,
  type OfficePreviewInbound,
} from "@/components/office-preview-bytes";

Object.defineProperty(globalThis, "Buffer", { value: Buffer });
Object.defineProperty(globalThis, "process", {
  value: {
    env: { NODE_ENV: "production" },
    nextTick(fn: (...args: unknown[]) => void, ...args: unknown[]) {
      queueMicrotask(() => fn(...args));
    },
  },
});

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage?: (data: string) => void;
    };
    __PASEO_OFFICE_PREVIEW_RECEIVE__?: (message: OfficePreviewInbound) => void;
  }
}

function installStyles(css: string): void {
  const style = document.createElement("style");
  style.textContent = `
${css}
html, body, #host {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
#host {
  overflow: auto;
}
`;
  document.head.appendChild(style);
}

function sendToNative(message: { type: "bridgeReady" | "ready" | "failed" }): void {
  window.ReactNativeWebView?.postMessage?.(JSON.stringify(message));
}

export function startOfficePreviewWebView(input: {
  css: string;
  open: (preview: {
    host: HTMLElement;
    data: ArrayBuffer;
    width: number;
  }) => Promise<{ destroy: () => void }>;
}): void {
  installStyles(input.css);
  const host = document.getElementById("host");
  let assembly: OfficePreviewAssembly = createOfficePreviewAssembly();
  let session: { destroy: () => void } | null = null;
  let renderGeneration = 0;

  const renderDocument = async (documentToRender: OfficePreviewDocument): Promise<void> => {
    if (!host) {
      sendToNative({ type: "failed" });
      return;
    }
    const generation = renderGeneration + 1;
    renderGeneration = generation;
    const data = documentToRender.bytes.buffer;
    if (!(data instanceof ArrayBuffer)) {
      sendToNative({ type: "failed" });
      return;
    }
    const nextSession = await input.open({
      host,
      data,
      width: documentToRender.width,
    });
    if (generation !== renderGeneration) {
      nextSession.destroy();
      return;
    }
    session?.destroy();
    session = nextSession;
    sendToNative({ type: "ready" });
  };

  window.__PASEO_OFFICE_PREVIEW_RECEIVE__ = (message) => {
    const next = applyOfficePreviewMessage(assembly, message);
    assembly = next.state;
    if (!next.document) return;
    host?.replaceChildren();
    void renderDocument(next.document).catch(() => {
      sendToNative({ type: "failed" });
    });
  };

  sendToNative({ type: "bridgeReady" });
}
