/** Pack the Epic PFP trait artwork into one lazy-loaded Forge sprite sheet. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const source = process.argv[2] || "/Users/lucaorion/Documents/epic pfp gen";
const root = fileURLToPath(new URL("../", import.meta.url));
const tile = 256;
const gutter = 2;
const cell = tile + gutter * 2;
const columns = 8;
const categories = {
  background: ["Backgrounds", ["windows-low-qualy", "rainbow-checker", "epic-space", "neon-tokyo", "blue-core", "candy-space", "pink-domo", "gameboy-pokemon-japanese", "VaporwaveIcon", "webamp", "glorp", "scene-green"]],
  base: ["base", ["OG", "rainbow", "pink-cheetah", "galaxy", "clown", "light-blue", "green", "pink", "dark-blue", "star", "stoned", "love"]],
  face: ["Special face", ["zombie-cat", "demon", "Cybernetic_Epic_Face", "cool-face", "Unicorn", "Nightmare_Epic_Face"]],
  hat: ["hat", ["Obey", "crown", "emo-hair-pink", "emo-hair-green", "domo-hat", "galaxy-obey", "partyy", "Angel_Epic_Face"]],
  accessory: ["Accessories", ["3D-Glasses", "Pit-vipers", "usa-party-glasses", "Love-eye-patch", "Mustach"]],
  frame: ["Frame", ["sticker-pack", "sticker-pack-2", "sticker-pack-3"]],
  left: ["sticker left", ["Bonkler", "diamond-sword", "bulbasor", "hello-kitty", "Glorp", "white-puffle"]],
  right: ["sticker right", ["Kirby-Headphones", "8bit-cat", "KUROMI", "ipod", "Maple-story-mushroom", "digi-cam"]],
  topLeft: ["sticker top left", ["zombie-nyan-cat", "GORILLAZ", "MLP", "EPIC-FACE", "pink-swag", "Winamp"]],
  topRight: ["stick top right", ["monster", "sonic", "doritos", "jet-set-radio", "beyblade", "Fairy-Odd-Parents"]],
  overlay: ["overlays", ["AND-BE-EPIC", "Internet-party", "HAIIIIII", "pokemon-vmax"]],
};

const groups = {};
const sprites = [];
const inputs = [];
for (const [group, [folder, names]] of Object.entries(categories)) {
  groups[group] = [];
  for (const name of names) {
    const index = sprites.length;
    const x = (index % columns) * cell + gutter;
    const y = Math.floor(index / columns) * cell + gutter;
    const file = `${folder}/${name}.png`;
    const input = await sharp(path.join(source, file)).resize(tile, tile).png().toBuffer();
    sprites.push({ file, x, y });
    groups[group].push(index);
    inputs.push({ input, left: x, top: y });
  }
}

await mkdir(path.join(root, "public/fx"), { recursive: true });
const info = await sharp({
  create: { width: columns * cell, height: Math.ceil(sprites.length / columns) * cell, channels: 4, background: "#00000000" },
}).composite(inputs).webp({ quality: 84, alphaQuality: 100, effort: 6 }).toFile(path.join(root, "public/fx/forge-traits.webp"));
await writeFile(path.join(root, "src/forge-assets.json"), `${JSON.stringify({ tile, groups, sprites }, null, 2)}\n`);
console.log(`Packed ${sprites.length} original traits into forge-traits.webp (${Math.round(info.size / 1024)} KB).`);
