import { test as base, expect } from "@playwright/test";
import { isolatedBrowser } from "./isolated-browser.mjs";
import { driver, openDock, startHide, startEdit } from "./dock-actions.mjs";

// Matrix cases share one disposable browser per worker for speed. Each case
// receives a fresh routed origin, so profiles, registrations and tabs never
// leak between cases. Every case keeps its own trace chunk as evidence.
const pages = new Map();
let serial = 0;
export const matrixOrigins = "http://*.taylr.test";
export const test = base.extend({
  instance: [
    // oxlint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const instance = await isolatedBrowser({
        url: "http://matrix.taylr.test/",
        // Streaming cases need real local servers on any port.
        origins: [matrixOrigins, "http://127.0.0.1"],
      });
      await instance.context.route(
        /^http:\/\/[^/]+\.taylr\.test\//,
        (route) => {
          const url = new URL(route.request().url());
          const body = pages.get(url.origin)?.get(url.pathname);
          return body === undefined
            ? route.fulfill({ status: 404, body: "" })
            : route.fulfill({ contentType: "text/html; charset=utf-8", body });
        },
      );
      await instance.context.tracing.start({ snapshots: true });
      try {
        await provide(instance);
      } finally {
        await instance.close();
      }
    },
    { scope: "worker" },
  ],
  bridge: [
    async ({ instance }, provide) => {
      await provide(await driver(instance.context, instance.extensionId));
    },
    { scope: "worker" },
  ],
  site: async ({ instance, bridge }, provide, testInfo) => {
    const { context } = instance;
    const origin = `http://w${testInfo.workerIndex}-${++serial}.taylr.test`;
    const routes = new Map();
    pages.set(origin, routes);
    const opened = [];
    const rpc = (message) =>
      bridge.evaluate((message) => chrome.runtime.sendMessage(message), {
        origin,
        ...message,
      });
    // JSON keeps keys such as __proto__ that object serialization drops.
    const rpcJson = (json) =>
      bridge.evaluate(
        ({ origin, json }) =>
          chrome.runtime.sendMessage({ origin, ...JSON.parse(json) }),
        { origin, json },
      );
    const ok = async (message) => {
      const result = await rpc(message);
      if (!result || result.error)
        throw new Error(`${message.type}: ${result?.error ?? "no reply"}`);
      return result;
    };
    const site = {
      origin,
      context,
      bridge,
      rpc,
      rpcJson,
      ok,
      serve(path, html) {
        routes.set(path, html);
        return `${origin}${path}`;
      },
      async open(path = "/") {
        const page = await context.newPage();
        opened.push(page);
        await page.goto(`${origin}${path}`);
        return page;
      },
      // A routed document needs a registered controller before it loads.
      register: () => ok({ type: "register" }),
      profile: async () => (await ok({ type: "get" })).profile,
      stored: () =>
        bridge.evaluate(
          async (key) => (await chrome.storage.local.get(key))[key],
          `site:${origin}`,
        ),
      edit: (selector, styles = {}, text) =>
        ok({
          type: "edit",
          selector,
          label: "Matrix",
          styles,
          ...(text !== undefined ? { text } : {}),
        }),
      hide: (selector) => ok({ type: "add", selector, label: "Matrix" }),
      dock: (page) => openDock(context, bridge, page),
      startHide,
      startEdit,
    };
    await context.tracing.startChunk({ title: testInfo.title });
    try {
      await provide(site);
    } finally {
      await context.tracing
        .stopChunk({ path: testInfo.outputPath("trace.zip") })
        .catch(() => {});
      for (const page of opened) await page.close().catch(() => {});
      pages.delete(origin);
    }
  },
});
export { expect };

// A small, realistic document: retained content proves every rule is scoped.
export const documentWith = (body, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Matrix</title>${head}</head><body>${body}<p id="bystander">Bystander text</p></body></html>`;
