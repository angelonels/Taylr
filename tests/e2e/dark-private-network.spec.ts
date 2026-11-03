import { test, expect, type Page } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, tabForPage } from "../dock-actions.mjs";

// Failure first: the extension worker fetches CSS that a page cannot read,
// outside the browser's private-network checks, and hands it back as
// page-readable recolored styles. A public page must not reach private,
// loopback, link-local or intranet hosts through it, while public hosts that
// merely look like IPv6 prefixes keep working and local pages keep local CSS.
const blocked = [
  "http://127.0.0.1:8080/secret.css",
  "http://2130706433/secret.css",
  "http://localhost:8080/secret.css",
  "http://localhost.:8080/secret.css",
  "http://[::1]:8080/secret.css",
  "http://[fd00::1]/secret.css",
  "http://10.0.0.1/secret.css",
  "http://172.16.0.1/secret.css",
  "http://192.168.1.1/secret.css",
  "http://169.254.169.254/secret.css",
  "http://router.local/secret.css",
  "http://printer.local./secret.css",
  "http://intranet/secret.css",
  "http://nas.lan/secret.css",
  "http://box.home.arpa/secret.css",
];
const allowed = [
  "https://cdn.example.com/public.css",
  "https://fcdn.example.com/public.css",
  "https://fd.example.com/public.css",
  "https://feedly.example.com/public.css",
];
const css = "#secret { color: rgb(1, 2, 3); }";
test("Dark mode: the CSS bridge keeps public pages off private networks", async () => {
  // Production grants every HTTP/HTTPS origin, so only Taylr's own check can
  // refuse these hosts. Every route answers, including the worker's fetches.
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
  const { context, extensionId } = instance;
  await context.route(/\.css$/, (route) =>
    route.fulfill({ contentType: "text/css", body: css }),
  );
  await context.route("http://public.example.com/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><p>Public page</p>",
    }),
  );
  await context.tracing.start({ snapshots: true });
  try {
    const bridge = await driver(context, extensionId);
    const fetchFrom = (page: Page) => async (url: string) => {
      const { id } = await tabForPage(bridge, page);
      return bridge.evaluate(
        async ({ tabId, url }) => {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (url) =>
              chrome.runtime.sendMessage({ type: "theme-css", url }),
            args: [url],
          });
          return result.result;
        },
        { tabId: id, url },
      );
    };
    const enable = async (page: Page, url: string) => {
      const origin = new URL(url).origin;
      for (const message of [
        { type: "register" },
        { type: "set-dark-mode", darkMode: true },
      ]) {
        const result = await bridge.evaluate(
          (message) => chrome.runtime.sendMessage(message),
          { origin, ...message },
        );
        expect(result?.error, message.type).toBeUndefined();
      }
      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute(
        "data-taylr-theme",
        "active",
      );
      return fetchFrom(page);
    };
    const fromPublic = await enable(
      await context.newPage(),
      "http://public.example.com/",
    );
    for (const url of blocked)
      expect(await fromPublic(url), url).toHaveProperty("error");
    for (const url of allowed)
      expect(await fromPublic(url), url).toEqual({ css });
    // A page that is itself local keeps its local stylesheets.
    const fromLocal = await enable(
      await context.newPage(),
      "http://127.0.0.1:5173/tests/fixture.html",
    );
    expect(await fromLocal("http://127.0.0.1:8080/secret.css")).toEqual({
      css,
    });
  } finally {
    await context.tracing.stop({
      path: test.info().outputPath("trace.zip"),
    });
    await instance.close();
  }
});
