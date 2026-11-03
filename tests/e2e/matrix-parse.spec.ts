import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect } from "../matrix.mjs";

// Failure scenarios: saved rules reach a document while the parser is paused
// at an arbitrary byte. Any rule kind may then apply to a partial element,
// record parser-owned text as its own, or miss content parsed afterwards.
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stream</title></head><body><main><section><h2 id="t" class="title">Selected words</h2><p id="after">After</p></section></main></body></html>`;
const cuts: [string, string][] = [
  ["before main", "<main>"],
  ["inside the main tag", "ain><section>"],
  ["inside the section", "<h2 id"],
  ["inside heading attributes", ` class="title">`],
  ["after the heading tag", "Selected words</h2>"],
  ["inside the heading text", "ted words</h2>"],
  ["before the heading end tag", "</h2><p"],
  ["after the heading", `<p id="after">`],
  ["inside the following text", "ter</p>"],
  ["before the body ends", "</section></main></body>"],
];
const kinds = ["text", "style", "Hide", "text and style"] as const;
for (const [name, marker] of cuts)
  for (const kind of kinds)
    test(`Parse matrix: ${kind} rule arrives ${name}`, async ({ site }) => {
      const at = html.indexOf(marker);
      expect(at).toBeGreaterThan(0);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const server = createServer((request, response) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.write(html.slice(0, at));
        void held.then(() => response.end(html.slice(at)));
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const rpc = (message: Record<string, unknown>) =>
        site.bridge.evaluate(
          async (message) => {
            const result = await chrome.runtime.sendMessage(message);
            if (result?.error) throw new Error(result.error);
          },
          { origin, label: "Matrix", ...message },
        );
      const page = await site.context.newPage();
      try {
        await rpc({ type: "register" });
        const text = kind.includes("text")
          ? "Selected words · Taylr"
          : undefined;
        if (kind === "Hide") await rpc({ type: "add", selector: "#t" });
        else
          await rpc({
            type: "edit",
            selector: "#t",
            styles: kind.includes("style") ? { color: "rgb(0, 128, 0)" } : {},
            ...(text ? { text } : {}),
          });
        const navigation = page.goto(`${origin}/`);
        await page.waitForFunction(
          () =>
            document.readyState === "loading" &&
            document.querySelector('style[data-taylr="rules"]'),
        );
        release();
        await navigation;
        const heading = page.locator("#t");
        if (kind === "Hide") await expect(heading).toBeHidden();
        else
          await expect(heading).toHaveText(text ?? "Selected words", {
            useInnerText: false,
          });
        if (kind.includes("style"))
          await expect(heading).toHaveCSS("color", "rgb(0, 128, 0)");
        await expect(page.locator("#after")).toHaveText("After");
        await rpc({ type: "restore" });
        await expect(heading).toBeVisible();
        await expect
          .poll(() => heading.evaluate((element) => element.textContent))
          .toBe("Selected words");
        await expect(heading).toHaveCSS("color", "rgb(0, 0, 0)");
      } finally {
        release();
        await page.close();
        server.closeAllConnections();
        server.close();
      }
    });
