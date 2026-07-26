import { usePreviewStore } from "./previewStore";

export function PreviewUnavailableBanner() {
  const bundlerUnavailable = usePreviewStore((state) => state.bundlerUnavailable);
  const reloadPreview = usePreviewStore((state) => state.reloadPreview);

  if (!bundlerUnavailable) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-50" role="alert">
      <p className="font-medium">Preview service unavailable</p>
      <p className="mt-1">{bundlerUnavailable}</p>
      <button
        type="button"
        className="mt-3 rounded-lg border border-amber-200/40 px-3 py-1.5 text-sm text-amber-50"
        onClick={reloadPreview}
      >
        Retry preview
      </button>
    </div>
  );
}
