/**
 * Copy Orion Studio's current Rosie without changing her mesh or materials.
 * The app asset already uses Meshopt geometry and WebP textures (~3 MB).
 * Run: node tools/build-rosie.mjs [path/to/characters/rosie.glb]
 */
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = process.argv[2] || "/Users/lucaorion/Orion_Terminal/public/characters/rosie.glb";
const output = fileURLToPath(new URL("../public/fx/rosie.glb", import.meta.url));
await copyFile(source, output);
console.log("Copied current Rosie to", output);
