import sharp from "sharp";

async function main() {
  const src = "storage/images/04d38b90-4f2e-47c2-b5a3-37979305773e";
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const samples: Array<[number, number, string]> = [
    [8, 8, "bg-top-left"],
    [256, 144, "center"],
    [500, 20, "top"],
    [50, 80, "panel-top-left"],
    [200, 200, "bottom-left-chart"],
  ];

  for (const [x, y, label] of samples) {
    const i = (y * info.width + x) * info.channels;
    const hex = `#${[data[i], data[i + 1], data[i + 2]].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    console.log(label, hex);
  }
}

main();
