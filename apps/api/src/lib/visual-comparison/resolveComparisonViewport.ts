import type { z } from "zod";
import type { VisualComparisonViewportSchema } from "@reactify/generation-contracts";

type ViewportSize = z.infer<typeof VisualComparisonViewportSchema>;

/** A viewport with the scale factor resolved, ready to store on a comparison. */
export interface ResolvedViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

/**
 * Chooses the viewport the preview is captured at.
 *
 * A comparison is only meaningful when the preview and the uploaded design have
 * the same shape. Capturing a 2000x1111 design against a hard-coded 1440x810
 * (16:9) viewport forces the normalizer to letterbox one of the two images, and
 * the padding alone shows up as a large "difference". Deriving the height from
 * the real source dimensions keeps both images on the same aspect ratio, so the
 * reported metrics describe the design rather than the padding.
 */

/** Below this relative difference the requested viewport already matches the source. */
const ASPECT_TOLERANCE = 0.005;

export const MIN_VIEWPORT_HEIGHT = 320;
export const MAX_VIEWPORT_HEIGHT = 4000;

export interface SourceDimensions {
  width: number;
  height: number;
}

export function resolveComparisonViewport(
  requested: ViewportSize,
  source: SourceDimensions | null | undefined,
): ResolvedViewport {
  const deviceScaleFactor = requested.deviceScaleFactor ?? 1;
  const base: ResolvedViewport = {
    width: requested.width,
    height: requested.height,
    deviceScaleFactor,
  };

  if (!source || !Number.isFinite(source.width) || !Number.isFinite(source.height)) {
    return base;
  }

  if (source.width <= 0 || source.height <= 0) {
    return base;
  }

  const sourceAspect = source.width / source.height;
  const derivedHeight = Math.round(requested.width / sourceAspect);

  if (derivedHeight < MIN_VIEWPORT_HEIGHT || derivedHeight > MAX_VIEWPORT_HEIGHT) {
    return base;
  }

  const requestedAspect = requested.width / requested.height;
  const relativeDelta = Math.abs(requestedAspect - sourceAspect) / sourceAspect;
  if (relativeDelta <= ASPECT_TOLERANCE) {
    return base;
  }

  return {
    width: requested.width,
    height: derivedHeight,
    deviceScaleFactor,
  };
}
