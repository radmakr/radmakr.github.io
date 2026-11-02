// Regenerates the site's raster images from their sources:
//
//   og.png               ← tools/og.html                (WebKit, 1200×630)
//   apple-touch-icon.png ← tools/apple-touch-icon.svg   (AppKit, 180×180)
//   favicon.ico          ← favicon.svg                  (AppKit, 32×32)
//
// The renderer is tools/snapshot.swift, compiled on first use, so this needs
// macOS with Xcode or its command line tools.
//
//   bun run images

import { $ } from "bun";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const tool = join(root, "tools/snapshot.swift");
const binary = join(root, ".build/snapshot");

const images = [
  { source: "tools/og.html", output: "og.png", size: "1200x630" },
  { source: "tools/apple-touch-icon.svg", output: "apple-touch-icon.png", size: "180x180" },
  { source: "favicon.svg", output: "favicon.ico", size: "32x32" },
];

if (process.platform !== "darwin") {
  console.error("bun run images needs macOS: the renderer is a Swift tool built on WebKit and AppKit.");
  process.exit(1);
}

async function modified(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

$.cwd(root);

if ((await modified(binary)) < (await modified(tool))) {
  console.log("Building tools/snapshot.swift…");
  await $`mkdir -p .build`;
  await $`swiftc -O -swift-version 6 -parse-as-library ${tool} -o ${binary}`;
}

for (const { source, output, size } of images) {
  await $`${binary} ${source} ${output} --size ${size}`;
}
