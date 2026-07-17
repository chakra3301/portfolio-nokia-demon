/** Probes rosie.glb: bind-pose bbox vs animated bbox for each clip. */
import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:5183";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto(url, { waitUntil: "domcontentloaded" });
const out = await page.evaluate(async () => {
  const THREE = await import("/node_modules/three/build/three.module.js");
  const { GLTFLoader } = await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync("/fx/rosie.glb");
  const char = gltf.scene;
  const report = {};
  const bbox = () => {
    char.updateMatrixWorld(true);
    const b = new THREE.Box3();
    char.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.computeBoundingBox();
        const bb = o.boundingBox.clone();
        b.union(bb); // skinned bbox is in mesh space ~ bone space
      }
    });
    return b;
  };
  const skinned = [];
  char.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  report.sceneChildren = char.children.map((c) => `${c.name} scale=${c.scale.x.toFixed(5)} pos=(${c.position.x.toFixed(4)},${c.position.y.toFixed(4)},${c.position.z.toFixed(4)})`);
  const full = new THREE.Box3().setFromObject(char);
  report.bindBox = { min: full.min.toArray().map((v) => +v.toFixed(4)), max: full.max.toArray().map((v) => +v.toFixed(4)) };
  const mixer = new THREE.AnimationMixer(char);
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const a = mixer.clipAction(clip);
    a.play();
    mixer.setTime(Math.min(1.5, clip.duration / 2));
    char.updateMatrixWorld(true);
    // measure via bone positions (skinned mesh ignores its own transform)
    const b = new THREE.Box3();
    char.traverse((o) => { if (o.isBone) b.expandByPoint(o.getWorldPosition(new THREE.Vector3())); });
    report[clip.name] = { min: b.min.toArray().map((v) => +v.toFixed(4)), max: b.max.toArray().map((v) => +v.toFixed(4)) };
  }
  // bind-pose bone bbox for comparison
  mixer.stopAllAction();
  return report;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
