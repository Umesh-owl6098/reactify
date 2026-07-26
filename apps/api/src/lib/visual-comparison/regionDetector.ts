import type { VisualRegionDifference } from "@reactify/generation-contracts";

export interface RegionDetectionOptions {
  noiseThreshold: number;
  mergeDistance: number;
  maxRegions: number;
  minRegionSize: number;
}

/**
 * Fraction of a cell's pixels that must differ before the cell counts as part
 * of a region. Without this, the thin anti-aliased outline around every shape
 * forms a single connected path across the whole image, and the resulting
 * bounding box covers the entire canvas while describing nothing.
 */
const CELL_DENSITY_THRESHOLD = 0.35;

interface RawRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffSum: number;
  diffCount: number;
}

function boxesOverlapOrNear(a: RawRegion, b: RawRegion, distance: number): boolean {
  return !(
    a.x + a.width + distance < b.x ||
    b.x + b.width + distance < a.x ||
    a.y + a.height + distance < b.y ||
    b.y + b.height + distance < a.y
  );
}

function mergeRegions(regions: RawRegion[], mergeDistance: number): RawRegion[] {
  const merged: RawRegion[] = [];

  for (const region of regions) {
    let combined = { ...region };
    let changed = true;

    while (changed) {
      changed = false;
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        const candidate = merged[index];
        if (!candidate || !boxesOverlapOrNear(combined, candidate, mergeDistance)) {
          continue;
        }

        const nextX = Math.min(combined.x, candidate.x);
        const nextY = Math.min(combined.y, candidate.y);
        const nextWidth = Math.max(combined.x + combined.width, candidate.x + candidate.width) - nextX;
        const nextHeight = Math.max(combined.y + combined.height, candidate.y + candidate.height) - nextY;
        combined = {
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
          diffSum: combined.diffSum + candidate.diffSum,
          diffCount: combined.diffCount + candidate.diffCount,
        };
        merged.splice(index, 1);
        changed = true;
      }
    }

    merged.push(combined);
  }

  return merged;
}

interface RegionShape {
  /** Differing pixels as a share of the whole canvas. */
  coverage: number;
  /** Differing pixels as a share of the region's own bounding box. */
  fill: number;
  /** Mean difference intensity across the differing pixels, 0-255. */
  meanDiff: number;
}

function measure(region: RawRegion, canvasWidth: number, canvasHeight: number): RegionShape {
  const boxArea = Math.max(1, region.width * region.height);
  return {
    coverage: region.diffCount / (canvasWidth * canvasHeight),
    fill: region.diffCount / boxArea,
    meanDiff: region.diffCount > 0 ? region.diffSum / region.diffCount : 0,
  };
}

function classifyRegion(
  region: RawRegion,
  shape: RegionShape,
  canvasWidth: number,
  canvasHeight: number,
): VisualRegionDifference["likelyCategory"] {
  if (shape.coverage > 0.2) {
    return "layout";
  }

  if (shape.meanDiff > 180 && shape.coverage < 0.01) {
    return "typography";
  }

  if (shape.fill > 0.75 && shape.meanDiff > 60) {
    return "color";
  }

  if (region.width > canvasWidth * 0.5 && region.height < canvasHeight * 0.08) {
    return "spacing";
  }

  if (shape.coverage > 0.05) {
    return "missing_element";
  }

  if (shape.coverage > 0.02) {
    return "alignment";
  }

  return "unknown";
}

function describeRegion(
  category: VisualRegionDifference["likelyCategory"],
  severity: VisualRegionDifference["severity"],
): string {
  const prefix = severity === "high" ? "Major" : severity === "medium" ? "Moderate" : "Minor";
  switch (category) {
    case "layout":
      return `${prefix} layout mismatch detected in this area.`;
    case "spacing":
      return `${prefix} spacing difference detected in this area.`;
    case "color":
      return `${prefix} color mismatch detected in this area.`;
    case "typography":
      return `${prefix} typography or text-content difference detected in this area.`;
    case "missing_element":
      return `${prefix} missing or incomplete visual element detected in this area.`;
    case "extra_element":
      return `${prefix} unexpected visual element detected in this area.`;
    case "alignment":
      return `${prefix} alignment difference detected in this area.`;
    case "responsive":
      return `${prefix} responsive layout difference detected in this area.`;
    default:
      return `${prefix} visual difference detected in this area.`;
  }
}

/**
 * Groups differing pixels into localized regions.
 *
 * Detection runs on a coarse grid rather than on individual pixels: a cell
 * joins a region only when enough of it actually differs, so a region's bounds
 * describe a genuinely changed area instead of the hull of a sparse web of
 * outlines. Severity likewise follows how much of the canvas really differs,
 * not how large a bounding box happens to be.
 */
export function detectDifferenceRegions(
  diffRaw: Buffer,
  width: number,
  height: number,
  options: RegionDetectionOptions,
): VisualRegionDifference[] {
  const cellSize = Math.min(32, Math.max(8, Math.round(Math.min(width, height) / 32)));
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);

  const cellPixels = new Int32Array(columns * rows);
  const cellDiffCount = new Int32Array(columns * rows);
  const cellDiffSum = new Float64Array(columns * rows);

  for (let y = 0; y < height; y += 1) {
    const cellRow = Math.floor(y / cellSize);
    for (let x = 0; x < width; x += 1) {
      const cell = cellRow * columns + Math.floor(x / cellSize);
      cellPixels[cell] = (cellPixels[cell] ?? 0) + 1;

      const offset = (y * width + x) * 4;
      if ((diffRaw[offset + 3] ?? 0) <= options.noiseThreshold) {
        continue;
      }

      // The diff mask marks changes in a single channel, so take the strongest
      // channel rather than the average of all three.
      cellDiffCount[cell] = (cellDiffCount[cell] ?? 0) + 1;
      cellDiffSum[cell] = (cellDiffSum[cell] ?? 0) + Math.max(
        diffRaw[offset] ?? 0,
        diffRaw[offset + 1] ?? 0,
        diffRaw[offset + 2] ?? 0,
      );
    }
  }

  const hot = new Uint8Array(columns * rows);
  for (let cell = 0; cell < hot.length; cell += 1) {
    const pixels = cellPixels[cell] ?? 0;
    if (pixels > 0 && (cellDiffCount[cell] ?? 0) / pixels >= CELL_DENSITY_THRESHOLD) {
      hot[cell] = 1;
    }
  }

  const visited = new Uint8Array(columns * rows);
  const rawRegions: RawRegion[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const start = row * columns + column;
      if (!hot[start] || visited[start]) {
        continue;
      }

      visited[start] = 1;
      const stack = [{ row, column }];
      let minColumn = column;
      let maxColumn = column;
      let minRow = row;
      let maxRow = row;
      let diffSum = 0;
      let diffCount = 0;

      while (stack.length > 0) {
        const cell = stack.pop()!;
        const index = cell.row * columns + cell.column;

        minColumn = Math.min(minColumn, cell.column);
        maxColumn = Math.max(maxColumn, cell.column);
        minRow = Math.min(minRow, cell.row);
        maxRow = Math.max(maxRow, cell.row);
        diffSum += cellDiffSum[index] ?? 0;
        diffCount += cellDiffCount[index] ?? 0;

        const neighbors = [
          { row: cell.row - 1, column: cell.column },
          { row: cell.row + 1, column: cell.column },
          { row: cell.row, column: cell.column - 1 },
          { row: cell.row, column: cell.column + 1 },
        ];

        for (const neighbor of neighbors) {
          if (neighbor.row < 0 || neighbor.column < 0 || neighbor.row >= rows || neighbor.column >= columns) {
            continue;
          }
          const neighborIndex = neighbor.row * columns + neighbor.column;
          if (visited[neighborIndex] || !hot[neighborIndex]) {
            continue;
          }
          visited[neighborIndex] = 1;
          stack.push(neighbor);
        }
      }

      const x = minColumn * cellSize;
      const y = minRow * cellSize;
      rawRegions.push({
        x,
        y,
        width: Math.min(width, (maxColumn + 1) * cellSize) - x,
        height: Math.min(height, (maxRow + 1) * cellSize) - y,
        diffSum,
        diffCount,
      });
    }
  }

  const scored = mergeRegions(rawRegions, options.mergeDistance)
    .filter((region) => region.diffCount >= options.minRegionSize)
    .map((region) => {
      const shape = measure(region, width, height);
      const differenceScore = Math.min(100, (shape.meanDiff / 2.55) * shape.fill);
      const severity: VisualRegionDifference["severity"] =
        differenceScore >= 70 && shape.coverage >= 0.05
          ? "high"
          : differenceScore >= 35 || shape.coverage >= 0.02
            ? "medium"
            : "low";

      const likelyCategory = classifyRegion(region, shape, width, height);
      return {
        regionId: "region",
        bounds: {
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        },
        differenceScore: Number(differenceScore.toFixed(2)),
        severity,
        likelyCategory,
        description: describeRegion(likelyCategory, severity),
      } satisfies VisualRegionDifference;
    })
    .sort((left, right) => right.differenceScore - left.differenceScore)
    .slice(0, options.maxRegions);

  return scored.map((region, index) => ({
    ...region,
    regionId: `region-${index + 1}`,
  }));
}
