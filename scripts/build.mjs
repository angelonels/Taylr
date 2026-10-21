import { build } from "vite";
import { writeFile, mkdir } from "node:fs/promises";
await build({
  build: { outDir: "dist", rollupOptions: { input: "panel.html" } },
});
for (const entry of ["background", "content"])
  await build({
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: `src/${entry}.ts`,
        formats: ["iife"],
        name: `Taylr${entry}`,
        fileName: () => `${entry}.js`,
      },
    },
  });
await mkdir("dist", { recursive: true });
await writeFile(
  "dist/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Taylr",
      version: "0.1.0",
      description:
        "Hide what gets in the way. Keep the web that works for you.",
      permissions: ["activeTab", "scripting", "storage", "sidePanel"],
      optional_host_permissions: ["https://*/*", "http://*/*"],
      background: { service_worker: "background.js" },
      side_panel: { default_path: "panel.html" },
      action: { default_title: "Open Taylr" },
      incognito: "split",
    },
    null,
    2,
  ),
);
