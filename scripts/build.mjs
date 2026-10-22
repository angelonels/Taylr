import { build } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await build({
  build: { outDir: "dist", rollupOptions: { input: "notice.html" } },
});
for (const [entry, extension] of [
  ["background", "ts"],
  ["content", "ts"],
  ["dock", "tsx"],
])
  await build({
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: `src/${entry}.${extension}`,
        formats: ["iife"],
        name: `Taylr${entry}`,
        fileName: () => `${entry}.js`,
      },
    },
  });
await mkdir("dist/icons", { recursive: true });
const mark = await readFile("assets/mark.svg", "utf8");
for (const size of [16, 32, 48, 128]) {
  await writeFile(
    `dist/icons/icon-${size}.png`,
    new Resvg(mark, { fitTo: { mode: "width", value: size } }).render().asPng(),
  );
  const active = mark
    .replaceAll("#e3dcff", "#ffdfeb")
    .replaceAll("#9475f0", "#ed688c")
    .replaceAll("#7c5bd1", "#af3c67")
    .replaceAll("#c2b1ff", "#ff9db8");
  await writeFile(
    `dist/icons/active-${size}.png`,
    new Resvg(active, { fitTo: { mode: "width", value: size } })
      .render()
      .asPng(),
  );
}
await writeFile(
  "dist/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Taylr",
      version,
      description: "Hide page elements and restore them later.",
      permissions: ["activeTab", "scripting", "storage"],
      optional_host_permissions: ["https://*/*", "http://*/*"],
      background: { service_worker: "background.js" },
      action: {
        default_title: "Open Taylr",
        default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" },
      },
      icons: {
        16: "icons/icon-16.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png",
      },
      incognito: "split",
    },
    null,
    2,
  ),
);
