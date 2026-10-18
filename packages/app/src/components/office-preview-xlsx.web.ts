export async function openXlsxPreview(input: {
  host: HTMLElement;
  data: ArrayBuffer;
}): Promise<{ destroy: () => void }> {
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
