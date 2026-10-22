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
  ["theme", "ts"],
])
  await build({
    plugins: [
      {
        name: "darkreader-private-message-bus",
        transform(code, id) {
          if (!id.endsWith("/darkreader/darkreader.mjs")) return;
          if (
            !code.includes(
              "const nativeSendMessage = chrome.runtime.sendMessage;",
            )
          )
            throw new Error(
              "Review the Dark Reader message adapter before upgrading.",
            );
          // The embedded API otherwise replaces native Chrome methods and loses
          // Promise return values. Give this vendor module its own lexical bus.
          const cleanup =
            'removeNode(root.querySelector(".darkreader--override"));';
          if (!code.includes(cleanup))
            throw new Error(
              "Review Dark Reader shadow cleanup before upgrading.",
            );
          // 4.9.133 leaves its inversion stylesheet in open shadow roots after
          // disable. Complete the same cleanup while the engine owns the roots.
          code = code.replace(
            cleanup,
            cleanup +
              '\nremoveNode(root.querySelector(".darkreader--invert"));',
          );
          return {
            code: "const chrome = { runtime: {} };\n" + code,
            map: null,
          };
        },
      },
    ],
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
    .replaceAll("#f4f2ec", "#ffdfeb")
    .replaceAll("#b5b4aa", "#ed688c")
    .replaceAll("#77796f", "#af3c67")
    .replaceAll("#d4d3c9", "#ff9db8");
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
      host_permissions: ["https://*/*", "http://*/*"],
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

await mkdir("dist/licenses", { recursive: true });
await writeFile(
  "dist/licenses/darkreader.txt",
  await readFile("node_modules/darkreader/LICENSE"),
);
