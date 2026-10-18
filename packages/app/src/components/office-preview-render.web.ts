import type { OfficePreviewKind } from "@/file-explorer/office";
import { openDocxPreview } from "./office-preview-docx.web";
import { openPptxPreview } from "./office-preview-pptx.web";
import { openXlsxPreview } from "./office-preview-xlsx.web";

export interface OfficePreviewSession {
  destroy: () => void;
}

interface OpenOfficePreviewInput {
  kind: OfficePreviewKind;
  host: HTMLElement;
  data: ArrayBuffer;
  width: number;
}

export function openOfficePreview(input: OpenOfficePreviewInput): Promise<OfficePreviewSession> {
  if (input.kind === "docx") return openDocxPreview(input);
  if (input.kind === "xlsx") return openXlsxPreview(input);
  return openPptxPreview(input);
}
