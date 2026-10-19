export async function openPptxPreview(input: {
  host: HTMLElement;
  data: ArrayBuffer;
  width: number;
}): Promise<{ destroy: () => void }> {
  const { init } = await import("pptx-preview");
  const width = Math.max(input.width, 320);
  const previewer = init(input.host, {
    width,
    height: Math.round((width * 9) / 16),
    mode: "list",
  });
  try {
    await previewer.preview(input.data);
  } catch (error) {
    previewer.destroy();
    throw error;
  }
  return { destroy: () => previewer.destroy() };
}
