import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";
import { test, expect, documentWith } from "../matrix.mjs";
import { tabForPage } from "../dock-actions.mjs";

// Failure first: the extension worker fetches CSS that a page cannot read,
// outside the browser's private-network checks, and hands it back as
// page-readable recolored styles. A public page must not reach private,
// loopback or link-local hosts through it. Local pages keep local styles.
test("Dark mode: the CSS bridge keeps public pages off private networks", async ({
  site,
}) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/css",
      "cache-control": "no-store",
    });
    response.end("#secret { color: rgb(1, 2, 3); }");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const css = (tab: Page) => async (url: string) => {
    const { id } = await tabForPage(site.bridge, tab);
    return site.bridge.evaluate(
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
  try {
    site.serve("/", documentWith(`<p>Public page</p>`));
    await site.register();
    const publicTab = await site.open();
    await site.ok({ type: "set-dark-mode", darkMode: true });
    await expect(publicTab.locator("html")).toHaveAttribute(
      "data-taylr-theme",
      "active",
    );
    const fromPublic = css(publicTab);
    for (const url of [
      `http://127.0.0.1:${port}/secret.css`,
      `http://localhost:${port}/secret.css`,
      `http://[::1]:${port}/secret.css`,
      `http://2130706433:${port}/secret.css`,
      "http://10.0.0.1/secret.css",
      "http://172.16.0.1/secret.css",
      "http://192.168.1.1/secret.css",
      "http://169.254.169.254/latest/meta-data.css",
      "http://router.local/secret.css",
    ])
      expect(await fromPublic(url), url).toHaveProperty("error");

    // A page that is itself local keeps its local stylesheets.
    const local = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><p>Local page</p>");
    });
    await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
    try {
      const rpc = (message: object) =>
        site.bridge.evaluate((message) => chrome.runtime.sendMessage(message), {
          origin,
          ...message,
        });
      await rpc({ type: "register" });
      await rpc({ type: "set-dark-mode", darkMode: true });
      const localTab = await site.context.newPage();
      await localTab.goto(`${origin}/`);
      await expect(localTab.locator("html")).toHaveAttribute(
        "data-taylr-theme",
        "active",
      );
      expect(
        await css(localTab)(`http://127.0.0.1:${port}/secret.css`),
      ).toMatchObject({ css: "#secret { color: rgb(1, 2, 3); }" });
      await rpc({ type: "set-dark-mode", darkMode: false });
      await localTab.close();
    } finally {
      local.closeAllConnections();
      local.close();
    }
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
