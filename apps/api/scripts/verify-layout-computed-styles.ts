import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(join(dirname(fileURLToPath(import.meta.url)), "../../web/node_modules/playwright"));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:5199/", { waitUntil: "networkidle" });

  const layout = await page.evaluate(() => {
    const main = document.querySelector("main");
    const topSection = document.querySelector("main section");
    const bottomSection = document.querySelector("main section + section");
    const cs = (el) => (el ? getComputedStyle(el) : null);

    return {
      mainPadding: cs(main)?.padding,
      mainDisplay: cs(main)?.display,
      topGridCols: cs(topSection)?.gridTemplateColumns,
      bottomGridCols: cs(bottomSection)?.gridTemplateColumns,
      topChildren: topSection?.children.length,
      bottomChildren: bottomSection?.children.length,
    };
  });

  console.log(JSON.stringify(layout, null, 2));
  await browser.close();
}

main();
