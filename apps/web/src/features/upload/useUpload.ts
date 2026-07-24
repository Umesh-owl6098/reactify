import { useCallback } from "react";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  UPLOAD_MAX_BYTES,
  formatUploadMaxSizeLabel,
} from "@reactify/shared";
import { getUploadErrorMessage, uploadImage } from "../../lib/api";
import { useUploadStore } from "./uploadStore";

function validateClientFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return "Only PNG, JPEG, and WebP images are supported.";
  }

  if (file.size > UPLOAD_MAX_BYTES) {
    return `Image must be ${formatUploadMaxSizeLabel()} or smaller.`;
  }

  if (file.size === 0) {
    return "The selected file is empty.";
  }

  return null;
}

export function useUpload() {
  const status = useUploadStore((state) => state.status);
  const progress = useUploadStore((state) => state.progress);
  const error = useUploadStore((state) => state.error);
  const upload = useUploadStore((state) => state.upload);
  const localPreviewUrl = useUploadStore((state) => state.localPreviewUrl);
  const selectedFile = useUploadStore((state) => state.selectedFile);
  const setUploading = useUploadStore((state) => state.setUploading);
  const setProgress = useUploadStore((state) => state.setProgress);
  const setSuccess = useUploadStore((state) => state.setSuccess);
  const setError = useUploadStore((state) => state.setError);
  const resetForRetry = useUploadStore((state) => state.resetForRetry);
  const clear = useUploadStore((state) => state.clear);

  const rememberFile = useCallback(
    (file: File) => {
      const previousPreview = useUploadStore.getState().localPreviewUrl;
      if (previousPreview) {
        URL.revokeObjectURL(previousPreview);
      }

      const previewUrl = URL.createObjectURL(file);
      useUploadStore.setState({
        selectedFile: file,
        localPreviewUrl: previewUrl,
      });
      return previewUrl;
    },
    [],
  );

  const startUpload = useCallback(
    async (file: File) => {
      const previewUrl = rememberFile(file);
      const validationError = validateClientFile(file);

      if (validationError) {
        setError(validationError);
        return;
      }

      setUploading(file, previewUrl);

      try {
        const response = await uploadImage(file, setProgress);
        setSuccess(response);
      } catch (uploadError) {
        setError(getUploadErrorMessage(uploadError));
      }
    },
    [rememberFile, setError, setProgress, setSuccess, setUploading],
  );

  const rejectFile = useCallback(
    (message: string, file?: File) => {
      if (file) {
        rememberFile(file);
      }
      setError(message);
    },
    [rememberFile, setError],
  );

  const retryUpload = useCallback(async () => {
    if (!selectedFile) {
      setError("Select an image before retrying.");
      return;
    }

    resetForRetry();
    await startUpload(selectedFile);
  }, [resetForRetry, selectedFile, setError, startUpload]);

  return {
    status,
    progress,
    error,
    upload,
    localPreviewUrl,
    selectedFile,
    startUpload,
    rejectFile,
    retryUpload,
    clear,
    isUploading: status === "uploading",
    hasPreview: Boolean(localPreviewUrl || upload),
  };
}
