// useBase64URL keeps images inside the document. Fetching them would leave the pane.

import type { OfficePreviewKind } from "@/file-explorer/office";

export interface OfficePreviewSession {
  destroy: () => void;
}

interface OpenOfficePreviewInput {
  kind: OfficePreviewKind;
  host: HTMLElement;
  data: ArrayBuffer;
  width: number;
}

async function openDocx(input: OpenOfficePreviewInput): Promise<OfficePreviewSession> {
  const [{ default: jsPreviewDocx }] = await Promise.all([
    import("@js-preview/docx"),
    import("@js-preview/docx/lib/index.css"),
  ]);
  const previewer = jsPreviewDocx.init(input.host, {
    useBase64URL: true,
    inWrapper: true,
    breakPages: true,
  });
  await previewer.preview(input.data);
  return { destroy: () => previewer.destroy() };
}

async function openXlsx(input: OpenOfficePreviewInput): Promise<OfficePreviewSession> {
  const [{ default: jsPreviewExcel }] = await Promise.all([
    import("@js-preview/excel"),
    import("@js-preview/excel/lib/index.css"),
  ]);
  const previewer = jsPreviewExcel.init(input.host, {
    minColLength: 0,
    showContextmenu: false,
  });
  await previewer.preview(input.data);
  return { destroy: () => previewer.destroy() };
}

async function openPptx(input: OpenOfficePreviewInput): Promise<OfficePreviewSession> {
  const { init } = await import("pptx-preview");
  const width = Math.max(input.width, 320);
  const previewer = init(input.host, {
    width,
    height: Math.round((width * 9) / 16),
    mode: "list",
  });
  await previewer.preview(input.data);
  return { destroy: () => previewer.destroy() };
}

const OPENERS: Record<
  OfficePreviewKind,
  (input: OpenOfficePreviewInput) => Promise<OfficePreviewSession>
> = {
  docx: openDocx,
  xlsx: openXlsx,
  pptx: openPptx,
};

export function openOfficePreview(input: OpenOfficePreviewInput): Promise<OfficePreviewSession> {
  return OPENERS[input.kind](input);
}
