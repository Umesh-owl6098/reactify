import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { UPLOAD_ACCEPT, formatUploadMaxSizeLabel } from "@reactify/shared";
import { Button } from "@reactify/ui";
import { useUpload } from "./useUpload";

function getRejectionMessage(rejections: FileRejection[]): string {
  const error = rejections[0]?.errors[0];
  if (!error) {
    return "The selected file could not be uploaded.";
  }

  switch (error.code) {
    case "file-too-large":
      return `Image must be ${formatUploadMaxSizeLabel()} or smaller.`;
    case "file-invalid-type":
      return "Only PNG, JPEG, and WebP images are supported.";
    default:
      return error.message;
  }
}

export function UploadZone() {
  const { status, progress, error, isUploading, startUpload, rejectFile, retryUpload } =
    useUpload();

  const onDropAccepted = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        void startUpload(file);
      }
    },
    [startUpload],
  );

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const file = rejections[0]?.file;
      rejectFile(getRejectionMessage(rejections), file);
    },
    [rejectFile],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted,
    onDropRejected,
    accept: UPLOAD_ACCEPT,
    maxSize: 10_485_760,
    multiple: false,
    disabled: isUploading,
    noClick: isUploading,
    noKeyboard: isUploading,
  });

  const showRetry = status === "error";

  return (
    <section className="w-full max-w-2xl" aria-labelledby="upload-heading">
      <div className="mb-4 text-left">
        <h2 id="upload-heading" className="text-xl font-semibold text-white">
          Upload screenshot
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Drag and drop a PNG, JPEG, or WebP file up to {formatUploadMaxSizeLabel()}.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragActive
            ? "border-indigo-300 bg-indigo-500/10"
            : "border-slate-600 bg-slate-900/40 hover:border-indigo-400/70"
        } ${isUploading ? "cursor-wait opacity-80" : "cursor-pointer"}`}
      >
        <input {...getInputProps()} aria-label="Upload screenshot" />
        <p className="text-base font-medium text-slate-100">
          {isDragActive ? "Drop your screenshot here" : "Drag and drop your screenshot here"}
        </p>
        <p className="mt-2 text-sm text-slate-400">or click to browse files</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
            disabled={isUploading}
          >
            Choose file
          </Button>
          {showRetry ? (
            <Button
              type="button"
              variant="primary"
              onClick={(event) => {
                event.stopPropagation();
                void retryUpload();
              }}
            >
              Retry upload
            </Button>
          ) : null}
        </div>
      </div>

      {isUploading ? (
        <div className="mt-4" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
            <span>Uploading...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
