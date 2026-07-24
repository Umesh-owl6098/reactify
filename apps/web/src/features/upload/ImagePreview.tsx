import { getImagePreviewUrl } from "../../lib/api";
import { formatMimeType, useUploadStore } from "./uploadStore";
import { useUpload } from "./useUpload";

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImagePreview() {
  const { upload, localPreviewUrl, status } = useUpload();
  const selectedFile = useUploadStore((state) => state.selectedFile);

  const previewSrc = upload
    ? getImagePreviewUrl(upload.previewUrl)
    : localPreviewUrl;

  if (!previewSrc) {
    return null;
  }

  const label = upload
    ? `${formatMimeType(upload.mimeType)} · ${formatBytes(upload.sizeBytes)}`
    : selectedFile
      ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}`
      : "Screenshot preview";

  return (
    <figure className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60">
      <img
        src={previewSrc}
        alt="Uploaded screenshot preview"
        className="max-h-[420px] w-full object-contain bg-slate-950"
      />
      <figcaption className="border-t border-slate-700 px-4 py-3 text-left text-sm text-slate-300">
        {status === "uploading" ? "Uploading preview..." : label}
      </figcaption>
    </figure>
  );
}
