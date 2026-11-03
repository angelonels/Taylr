import { build } from "vite";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
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
          const update =
            "function update() {\n        const details = manager.details({secondRound: true});";
          code = code.replaceAll("\r\n", "\n");
          if (!code.includes(update))
            throw new Error(
              "Review Dark Reader manager lifecycle before upgrading.",
            );
          // A delayed DOM-ready callback can run after destroy and recreate a
          // sync stylesheet (observed on Google Maps). Only the current owner
          // may render; an old manager must not resurrect a disabled theme.
          code = code.replace(
            update,
            "function update() {\n        if (styleManagers.get(element) !== manager) return;\n        const details = manager.details({secondRound: true});",
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
// Include runtime dependency notices even when minification drops comments.
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
let notices = await readFile("THIRD_PARTY_NOTICES.md", "utf8");
for (const [path, dependency] of Object.entries(lock.packages)) {
  // Optional platform binaries (Rollup natives listed by Dark Reader) are build
  // tools that never reach the bundle, and need not be installed at all.
  if (
    !path.startsWith("node_modules/") ||
    dependency.dev ||
    dependency.optional
  )
    continue;
  const metadata = JSON.parse(await readFile(`${path}/package.json`, "utf8"));
  const files = (await readdir(path)).filter((file) =>
    /^licen[cs]e(?:\..*)?$/i.test(file),
  );
  const license = files.length
    ? `${path}/${files.sort()[0]}`
    : `assets/licenses/${metadata.name.replaceAll("/", "-")}.txt`;
  notices += `\n\n---\n\n## ${metadata.name} ${metadata.version}\n\n${await readFile(license, "utf8")}`;
}
await writeFile("dist/THIRD_PARTY_NOTICES.md", notices);
await mkdir("dist/icons", { recursive: true });
const markImage = await readFile("assets/taylr-mark.png");
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><image width="160" height="160" href="data:image/png;base64,${markImage.toString("base64")}"/></svg>`;
for (const size of [16, 32, 48, 128]) {
  await writeFile(
    `dist/icons/icon-${size}.png`,
    new Resvg(mark, { fitTo: { mode: "width", value: size } }).render().asPng(),
  );
  const active = mark.replace(
    "</svg>",
    '<circle cx="133" cy="133" r="21" fill="#0a64da" stroke="#fff" stroke-width="7"/></svg>',
  );
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
      description: "Edit or hide page elements and restore them later.",
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
