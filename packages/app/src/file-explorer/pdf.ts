import { isWeb } from "@/constants/platform";
import { officePreviewKind } from "@/file-explorer/office";

export function isPdfMimeType(mimeType: string | null | undefined): boolean {
  return mimeType?.split(";", 1)[0]?.trim().toLowerCase() === "application/pdf";
}

export function shouldPersistFilePreviewMedia(file: {
  kind: string;
  mime: string;
  path?: string;
}): boolean {
  if (file.kind === "image" || isPdfMimeType(file.mime)) return true;
  // The pane renders these from a blob URL, same as a PDF. Native has no DOM
  // renderer, so it does not keep a second copy of the bytes.
  if (!isWeb) return false;
  return officePreviewKind({ mimeType: file.mime, path: file.path }) !== null;
}
