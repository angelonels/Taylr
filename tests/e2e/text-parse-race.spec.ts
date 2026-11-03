import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: the content script runs at document_start, so a saved text
// edit can reach an element before the parser inserts that element's own text.
// Snapshotting then records edited plus parsed text as the original, and
// Restore doubles it ("Selected words · TaylrSelected words"). A streamed page
// holds the parser inside the element to make that interleaving deterministic.
// The last element closes without another mutation, so it needs a later pass.
for (const last of [false, true])
  test(`Text edits: Restore returns original text after a mid-parse application${last ? " to the last element" : ""}`, async () => {
    const original = "Selected words",
      edited = `${original} · Taylr`;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const finish = (response: ServerResponse) =>
      response.end(
        `${original}</h2>${last ? "" : '<aside id="kept">Independent</aside>'}`,
      );
    const server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.write(
        `<!doctype html><title>Streamed text</title><h2 id="selected">`,
      );
      if (request.url === "/streamed") void held.then(() => finish(response));
      else finish(response);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const instance = await isolatedBrowser({ url: `${origin}/` });
    const { context, extensionId } = instance;
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      const bridge = await driver(context, extensionId);
      const rpc = (message: Record<string, unknown>) =>
        bridge.evaluate(
          async (message) => {
            const result = await chrome.runtime.sendMessage(message);
            if (result?.error) throw new Error(result.error);
          },
          { origin, ...message },
        );
      await rpc({ type: "register" });
      await rpc({
        type: "edit",
        selector: "#selected",
        label: original,
        styles: {},
        text: edited,
      });
      // A fully parsed tab shares the Restore broadcast with the streamed one.
      const loaded = await context.newPage();
      await loaded.goto(`${origin}/loaded`);
      await expect(loaded.locator("#selected")).toHaveText(edited);
      const streamed = await context.newPage();
      const navigation = streamed.goto(`${origin}/streamed`);
      // render() mounts the rules sheet and applies text in the same task, so
      // the saved edit has reached the heading while the parser is inside it.
      await streamed.waitForFunction(() =>
        document.querySelector('style[data-taylr="rules"]'),
      );
      release();
      await navigation;
      await expect(streamed.locator("#selected")).toHaveText(edited);
      await rpc({ type: "restore" });
      await expect(loaded.locator("#selected")).toHaveText(original);
      await expect(streamed.locator("#selected")).toHaveText(original);
    } finally {
      release();
      await context.tracing
        .stop({
          path: evidencePath(
            `text-parse-race-${last ? "last" : "inner"}-trace.zip`,
          ),
        })
        .catch(() => {});
      await instance.close();
      server.closeAllConnections();
      server.close();
    }
  });
