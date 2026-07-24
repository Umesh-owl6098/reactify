import { toPng } from "html-to-image";

const SETTLE_TIMEOUT_MS = 1500;

export async function capturePreviewScreenshot(root: HTMLElement): Promise<string> {
  await settlePreview(root);
  const iframe = root.querySelector("iframe");
  const target = iframe?.contentDocument?.body ?? root;
  const dataUrl = await toPng(target, {
    cacheBust: true,
    pixelRatio: 1,
    skipFonts: false,
  });
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? dataUrl : dataUrl;
  return base64;
}

async function settlePreview(root: HTMLElement): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_TIMEOUT_MS));
  await waitForImages(root);
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const iframe = root.querySelector("iframe");
  const images = Array.from((iframe?.contentDocument ?? root).querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}
