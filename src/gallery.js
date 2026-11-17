import artworks from "./gallery-entries.json";

// Load the imported archive only when the operator route loads. Existing
// curated files retain their metadata and order; mix media through the new set.
export function mountGallery(wall) {
  if (wall.dataset.galleryMounted) return;
  wall.dataset.galleryMounted = "true";
  const categories = ["Graphic", "Photography", "Print", "Garment", "Poster", "Motion"];
  const queues = categories.map((category) => artworks.filter((art) => art.category === category));
  const ordered = [];
  while (queues.some((queue) => queue.length)) {
    queues.forEach((queue) => { if (queue.length) ordered.push(queue.shift()); });
  }
  const fragment = document.createDocumentFragment();
  const offset = wall.querySelectorAll(".op-cell").length;
  ordered.forEach((art, i) => {
    const index = String(offset + i).padStart(2, "0");
    const cell = document.createElement("button");
    cell.className = "op-cell";
    cell.type = "button";
    Object.assign(cell.dataset, {
      full: art.src, index, title: art.title, meta: art.category,
      tags: art.category, blurb: art.alt,
      cap: `FILE ${index} · ${art.title.toUpperCase()}`,
      ...(art.video ? { video: art.video } : {}),
    });
    const image = document.createElement("img");
    Object.assign(image, { src: art.preview, alt: art.alt, width: 512, height: 512, loading: "lazy", decoding: "async" });
    cell.append(image);
    fragment.append(cell);
  });
  wall.append(fragment);
}
