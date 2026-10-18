// useBase64URL keeps images inside the document. Fetching them would leave the pane.

export async function openDocxPreview(input: {
  host: HTMLElement;
  data: ArrayBuffer;
}): Promise<{ destroy: () => void }> {
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
