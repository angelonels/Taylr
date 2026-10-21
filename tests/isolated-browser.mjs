import { chromium } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test owns a disposable browser. Never attach to a user's running browser or data directory.
export async function isolatedBrowser(site, { capture = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "taylr-e2e-"));
  const extension = join(root, "extension");
  let context;
  try {
    await cp("dist", extension, { recursive: true });
    const manifest = JSON.parse(
      await readFile(join(extension, "manifest.json"), "utf8"),
    );
    // Test-only install grants exact test origins without native permission UI. Production stays optional.
    manifest.host_permissions = capture
      ? ["<all_urls>"]
      : [
          ...new Set([
            "http://127.0.0.1:5173/*",
            ...(site
              ? [new URL(site.url).origin, ...(site.origins ?? [])].map(
                  (origin) => origin + "/*",
                )
              : []),
          ]),
        ];
    await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
    await writeFile(
      join(extension, "test-driver.html"),
      "<!doctype html><title>Taylr isolated test driver</title>",
    );
    // Test-only bridge invokes the real registered action handler. Native prompts are not bypassed in production.
    const backgroundPath = join(extension, "background.js");
    const background = await readFile(backgroundPath, "utf8");
    await writeFile(
      backgroundPath,
      `
const listen = chrome.action.onClicked.addListener.bind(chrome.action.onClicked);
chrome.action.onClicked.addListener = handler => { globalThis.__invokeTaylrAction = handler; listen(handler); };
const requestNative = chrome.permissions.request.bind(chrome.permissions);
chrome.permissions.request = async permissions => (await chrome.permissions.contains(permissions)) || requestNative(permissions);
` + background,
    );
    context = await chromium.launchPersistentContext(join(root, "data"), {
      channel: "chromium",
      headless: process.env.TAYLR_HEADED !== "1",
      viewport: { width: 1440, height: 1000 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    return {
      context,
      worker,
      extensionId: worker.url().split("/")[2],
      close: async () => {
        try {
          await context.close();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await context?.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
