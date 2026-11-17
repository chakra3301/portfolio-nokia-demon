import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

// Export copies only. Original photographs and editable masters stay untouched.
const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || "/Users/lucaorion/Desktop/artworks");
const output = path.join(root, "public/artworks");
const cache = path.join(root, ".tmp/gallery-import");
const catalog = JSON.parse(await fs.readFile(path.join(root, "tools/gallery-catalog.json"), "utf8"));
await fs.mkdir(output, { recursive: true });
await fs.mkdir(cache, { recursive: true });

const fingerprint = async (file) => {
  const image = sharp(file).rotate();
  const { width, height, orientation } = await image.metadata();
  const swapped = orientation >= 5 && orientation <= 8;
  return {
    ratio: swapped ? height / width : width / height,
    pixels: await image.resize(64, 64, { fit: "fill" }).flatten({ background: "#efede5" }).removeAlpha().raw().toBuffer(),
  };
};
const sameImage = (a, b) => {
  if (Math.abs(a.ratio / b.ratio - 1) > 0.025) return false;
  let delta = 0;
  for (let i = 0; i < a.pixels.length; i++) delta += Math.abs(a.pixels[i] - b.pixels[i]);
  // Keep small print/color variants distinct within the imported folder.
  return delta / a.pixels.length < (b.file.startsWith("/about/") ? 1.8 : 0.3);
};
const seen = [];
const html = await fs.readFile(path.join(root, "index.html"), "utf8");
for (const match of html.matchAll(/data-full="(\/about\/[^\"]+)"/g)) {
  seen.push({ file: match[1], ...(await fingerprint(path.join(root, "public", match[1]))) });
}

const entries = [], skipped = [];
for (const item of catalog) {
  const original = path.join(source, item.file);
  const hash = crypto.createHash("sha256").update(await fs.readFile(original)).digest("hex").slice(0, 10);
  const slug = `${item.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${hash}`;
  const ext = path.extname(original).toLowerCase();
  let image = original, duration;
  if (ext === ".heic") {
    image = path.join(cache, `${hash}.jpg`);
    await run("sips", ["-s", "format", "jpeg", original, "--out", image]);
  } else if (ext === ".psd") {
    image = path.join(cache, `${hash}.png`);
    await run("magick", [`${original}[0]`, "-auto-orient", "-resize", "2000x2000>", image]);
  } else if (ext === ".ai") {
    image = path.join(cache, `${hash}.png`);
    await run("python3", ["-c", "import fitz,sys; d=fitz.open(sys.argv[1]); p=d[0]; s=1800/max(p.rect.width,p.rect.height); p.get_pixmap(matrix=fitz.Matrix(s,s)).save(sys.argv[2])", original, image]);
  } else if (ext === ".mov") {
    const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", original])).stdout);
    duration = Number(probe.format.duration);
    image = path.join(cache, `${hash}.jpg`);
    await run("ffmpeg", ["-v", "error", "-ss", String(Math.min(5, duration * 0.35)), "-i", original, "-frames:v", "1", "-vf", "scale=1600:1600:force_original_aspect_ratio=decrease", "-y", image]);
  }
  const print = await fingerprint(image);
  const duplicate = seen.find((other) => sameImage(print, other));
  if (duplicate && !duration) {
    skipped.push({ source: item.file, representedBy: duplicate.file });
    continue;
  }
  const full = `${slug}.webp`, preview = `${slug}-preview.webp`;
  const exists = async (name) => fs.access(path.join(output, name)).then(() => true, () => false);
  const fullInfo = await exists(full) ? await sharp(path.join(output, full)).metadata()
    : await sharp(image).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#efede5" }).webp({ quality: 83, effort: 4 }).toFile(path.join(output, full));
  if (!(await exists(preview))) await sharp(image).rotate().resize(512, 512, { fit: "cover", withoutEnlargement: true })
    .flatten({ background: "#efede5" }).webp({ quality: 76, effort: 4 }).toFile(path.join(output, preview));
  let video;
  if (duration) {
    video = `${slug}.mp4`;
    if (!(await exists(video))) await run("ffmpeg", ["-v", "error", "-i", original, "-map", "0:v:0", "-map", "0:a?", "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1", "-c:v", "libx264", "-preset", "fast", "-crf", "27", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-map_metadata", "-1", "-y", path.join(output, video)], { maxBuffer: 1024 * 1024 });
  }
  entries.push({ ...item, src: `/artworks/${full}`, preview: `/artworks/${preview}`, width: fullInfo.width, height: fullInfo.height, ...(video ? { video: `/artworks/${video}`, duration: Math.round(duration) } : {}) });
  seen.push({ file: item.file, ...print });
}
await fs.writeFile(path.join(root, "src/gallery-entries.json"), JSON.stringify(entries, null, 2) + "\n");
await fs.mkdir(path.join(root, ".previews"), { recursive: true });
const report = { sourceFiles: catalog.length, imported: entries.length, videos: entries.filter((e) => e.video).length, skipped };
await fs.writeFile(path.join(root, ".previews/gallery-import.json"), JSON.stringify(report, null, 2) + "\n");
console.log(report);
