import type { VisualRegionDifference } from "@reactify/generation-contracts";

export interface RegionDetectionOptions {
  noiseThreshold: number;
  mergeDistance: number;
  maxRegions: number;
  minRegionSize: number;
}

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

function classifyRegion(region: RawRegion, canvasWidth: number, canvasHeight: number): VisualRegionDifference["likelyCategory"] {
  const areaRatio = (region.width * region.height) / (canvasWidth * canvasHeight);
  const meanDiff = region.diffCount > 0 ? region.diffSum / region.diffCount : 0;

  if (areaRatio > 0.35) {
    return "layout";
  }

  if (meanDiff > 180 && areaRatio < 0.02) {
    return "typography";
  }

  if (meanDiff > 140 && areaRatio < 0.08) {
    return "color";
  }

  if (region.width > canvasWidth * 0.5 && region.height < canvasHeight * 0.08) {
    return "spacing";
  }

  if (areaRatio > 0.12) {
    return "missing_element";
  }

  if (areaRatio > 0.05) {
    return "alignment";
  }

  return "unknown";
}

function describeRegion(category: VisualRegionDifference["likelyCategory"], severity: VisualRegionDifference["severity"]): string {
  const prefix =
    severity === "high" ? "Major" : severity === "medium" ? "Moderate" : "Minor";
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

export function detectDifferenceRegions(
  diffRaw: Buffer,
  width: number,
  height: number,
  options: RegionDetectionOptions,
): VisualRegionDifference[] {
  const visited = new Uint8Array(width * height);
  const rawRegions: RawRegion[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (visited[index]) {
        continue;
      }

      const offset = index * 4;
      const alpha = diffRaw[offset + 3] ?? 0;
      if (alpha <= options.noiseThreshold) {
        continue;
      }

      const stack = [{ x, y }];
      visited[index] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let diffSum = 0;
      let diffCount = 0;

      while (stack.length > 0) {
        const point = stack.pop();
        if (!point) {
          continue;
        }

        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);

        const pointOffset = (point.y * width + point.x) * 4;
        diffSum +=
          (diffRaw[pointOffset] ?? 0) +
          (diffRaw[pointOffset + 1] ?? 0) +
          (diffRaw[pointOffset + 2] ?? 0);
        diffCount += 1;

        const neighbors = [
          { x: point.x - 1, y: point.y },
          { x: point.x + 1, y: point.y },
          { x: point.x, y: point.y - 1 },
          { x: point.x, y: point.y + 1 },
        ];

        for (const neighbor of neighbors) {
          if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= width || neighbor.y >= height) {
            continue;
          }
          const neighborIndex = neighbor.y * width + neighbor.x;
          if (visited[neighborIndex]) {
            continue;
          }
          const neighborOffset = neighborIndex * 4;
          const neighborAlpha = diffRaw[neighborOffset + 3] ?? 0;
          if (neighborAlpha <= options.noiseThreshold) {
            continue;
          }
          visited[neighborIndex] = 1;
          stack.push(neighbor);
        }
      }

      const regionWidth = maxX - minX + 1;
      const regionHeight = maxY - minY + 1;
      if (regionWidth * regionHeight < options.minRegionSize) {
        continue;
      }

      rawRegions.push({
        x: minX,
        y: minY,
        width: regionWidth,
        height: regionHeight,
        diffSum,
        diffCount,
      });
    }
  }

  const merged = mergeRegions(rawRegions, options.mergeDistance);
  const scored = merged
    .map((region, index) => {
      const meanDiff = region.diffCount > 0 ? region.diffSum / region.diffCount / 3 : 0;
      const areaRatio = (region.width * region.height) / (width * height);
      const differenceScore = Math.min(100, meanDiff / 2.55 + areaRatio * 100);
      const severity: VisualRegionDifference["severity"] =
        differenceScore >= 70 || areaRatio > 0.2
          ? "high"
          : differenceScore >= 35 || areaRatio > 0.08
            ? "medium"
            : "low";
      const likelyCategory = classifyRegion(region, width, height);
      return {
        regionId: `region-${index + 1}`,
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
