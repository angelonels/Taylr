import { chromium } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Each test owns a disposable browser. Never attach to a user's running browser or data directory.
export async function isolatedBrowser(
  site,
  {
    capture = false,
    actionTimeout = 15000,
    navigationTimeout = 45000,
    nativeAction = false,
    productionPermissions = false,
    deviceScaleFactor = 1,
    browserArgs = [],
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "taylr-e2e-"));
  const extension = join(root, "extension");
  let context;
  try {
    await cp("dist", extension, { recursive: true });
    const manifest = JSON.parse(
      await readFile(join(extension, "manifest.json"), "utf8"),
    );
    // Most tests narrow host access to their fixture. Permission acceptance keeps
    // the generated production manifest intact in a disposable browser.
    if (!productionPermissions)
      manifest.host_permissions = nativeAction
        ? []
        : capture
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
    if (nativeAction)
      manifest.commands = {
        _execute_action: {
          suggested_key: { default: "Ctrl+Shift+Y", mac: "Command+Shift+Y" },
        },
      };
    const manifestHash = createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex");
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
      deviceScaleFactor,
      locale: "en-US",
      timezoneId: "UTC",
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        ...browserArgs,
      ],
    });
    context.setDefaultTimeout(actionTimeout);
    context.setDefaultNavigationTimeout(navigationTimeout);
    let [worker] = context.serviceWorkers();
    if (!worker)
      worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    return {
      context,
      worker,
      root,
      environment: {
        chromium: context.browser()?.version(),
        playwright: require("@playwright/test/package.json").version,
        mode: process.env.TAYLR_HEADED === "1" ? "headed" : "headless",
        platform: process.platform,
        arch: process.arch,
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor,
        locale: "en-US",
        timezone: "UTC",
        permissionModel: productionPermissions
          ? "production-host-grants"
          : nativeAction
            ? "native-activeTab"
            : capture
              ? "test-all-origins"
              : "test-exact-origins",
        manifestHash,
        browserArgs,
        actionTimeout,
        navigationTimeout,
      },
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
