import { create } from "zustand";
import type { AllowedImageMimeType, ImageUploadResponse } from "@reactify/shared";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadState {
  status: UploadStatus;
  progress: number;
  error: string | null;
  selectedFile: File | null;
  localPreviewUrl: string | null;
  upload: ImageUploadResponse | null;
  setUploading: (file: File, localPreviewUrl: string) => void;
  setProgress: (progress: number) => void;
  setSuccess: (upload: ImageUploadResponse) => void;
  setError: (message: string) => void;
  resetForRetry: () => void;
  clear: () => void;
}

const initialState = {
  status: "idle" as UploadStatus,
  progress: 0,
  error: null,
  selectedFile: null,
  localPreviewUrl: null,
  upload: null,
};

export const useUploadStore = create<UploadState>((set, get) => ({
  ...initialState,
  setUploading: (file, localPreviewUrl) =>
    set({
      status: "uploading",
      progress: 0,
      error: null,
      selectedFile: file,
      localPreviewUrl,
      upload: null,
    }),
  setProgress: (progress) => set({ progress }),
  setSuccess: (upload) =>
    set({
      status: "success",
      progress: 100,
      error: null,
      upload,
    }),
  setError: (message) => set({ status: "error", error: message }),
  resetForRetry: () => {
    const { selectedFile, localPreviewUrl } = get();
    set({
      status: selectedFile ? "idle" : "idle",
      progress: 0,
      error: null,
      localPreviewUrl,
      upload: null,
    });
  },
  clear: () => {
    const { localPreviewUrl } = get();
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    set({ ...initialState });
  },
}));

export function formatMimeType(mimeType: AllowedImageMimeType): string {
  switch (mimeType) {
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG";
    case "image/webp":
      return "WebP";
  }
}
