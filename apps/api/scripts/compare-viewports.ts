import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { runVisualComparison } from "../src/lib/visual-comparison/comparisonEngine.js";
import { testEnv } from "../src/test/helpers.js";

async function main() {
  const source = await readFile("storage/images/04d38b90-4f2e-47c2-b5a3-37979305773e");
  const preview1440 = await readFile(
    "storage/recovery/8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8/standalone-1440x810.png",
  );
  const preview512 = await sharp(preview1440).resize(512, 288, { fit: "fill" }).png().toBuffer();

  for (const [label, w, h, buf] of [
    ["1440x810", 1440, 810, preview1440] as const,
    ["512x288 downscaled", 512, 288, preview512] as const,
  ]) {
    const result = await runVisualComparison(source, buf, { width: w, height: h }, testEnv);
    console.log(
      JSON.stringify({
        label,
        overallSimilarityScore: result.overallSimilarityScore,
        pixelDifferencePercentage: result.pixelDifferencePercentage,
        layoutRegions: result.regions.filter((region) => region.category === "layout").length,
        regionCount: result.regions.length,
      }),
    );
  }
}

main();
