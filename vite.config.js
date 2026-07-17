import { defineConfig } from "vite";
import { resolve } from "node:path";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  plugins: [glsl()],
  resolve: {
    alias: {
      // vendored voroforce engine (gnovotny/nothing-to-watch) uses the '√' alias
      "√": resolve(__dirname, "./src/vendor/voroforce"),
    },
  },
  build: {
    target: "es2022",
    // Keep the JS budget honest (Awwwards-baseline: < 300KB compressed).
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"], gsap: ["gsap"] },
      },
    },
  },
});
