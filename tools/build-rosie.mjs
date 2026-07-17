/**
 * Build public/fx/rosie.glb from the Orion Terminal companion model.
 * - keeps only the clips the portfolio uses (spawn / bow / idle)
 * - welds + simplifies the mesh, quantizes attributes (no decoder needed)
 * - recompresses the 2048px PNG texture to 1024px WebP
 * Run: node tools/build-rosie.mjs
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, weld, simplify, quantize, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const SRC = "/Users/lucaorion/Orion_Terminal/public/companion/companion.glb";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../public/fx/rosie.glb", import.meta.url));
const KEEP = new Set(["Fall4", "Formal_Bow", "Idle_15"]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);

// drop unused animation clips
for (const anim of doc.getRoot().listAnimations()) {
  if (!KEEP.has(anim.getName())) anim.dispose();
}

await doc.transform(
  dedup(),
  prune(),
  resample(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.45, error: 0.001 }),
  quantize(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] }),
);

await io.write(OUT, doc);
console.log("wrote", OUT);
