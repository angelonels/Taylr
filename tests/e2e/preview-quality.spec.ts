import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { evidencePath } from "../run-evidence.mjs";
import { driver, openDock } from "../dock-actions.mjs";

// Failure contracts written before the capture redesign: slow native capture
// still produces a preview; rapid consecutive hides respect Chrome's quota;
// a crop retains useful resolution and the chosen component's actual pixels.
for (const scenario of [
  "slow",
  "cancel",
  "rapid",
  "stalled-finish",
  "stalled-document",
  "text",
  "svg-text",
  "sharp",
  "wide",
  "retina",
  "retina-fractional",
  "zoom",
  "partial",
  "entropy",
]) {
  test(`Preview quality: ${scenario}`, async () => {
    const instance = await isolatedBrowser(undefined, {
      capture: true,
      deviceScaleFactor: scenario.startsWith("retina") ? 2 : 1,
      browserArgs: scenario.startsWith("retina")
        ? ["--force-device-scale-factor=2"]
        : [],
    });
    const { context, extensionId, worker } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      if (scenario === "text" || scenario === "svg-text")
        await worker.evaluate(() => {
          chrome.tabs.captureVisibleTab = () =>
            Promise.reject(new Error("Capture denied"));
        });
      if (scenario === "stalled-finish")
        await worker.evaluate(() => {
          const send = chrome.tabs.sendMessage.bind(chrome.tabs);
          chrome.tabs.sendMessage = (...args) =>
            args[1]?.type === "finish-preview"
              ? new Promise(() => {})
              : send(...args);
        });
      if (scenario === "slow" || scenario === "cancel")
        await worker.evaluate(() => {
          const capture = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
          chrome.tabs.captureVisibleTab = async (...args) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return capture(...args);
          };
        });
      if (scenario === "entropy")
        await worker.evaluate(() => {
          const root = globalThis as typeof globalThis & {
            previewMetrics: object[];
          };
          root.previewMetrics = [];
          // oxlint-disable-next-line typescript/unbound-method -- Deliberately call prototype implementation with each canvas as receiver.
          const encode = OffscreenCanvas.prototype.convertToBlob;
          OffscreenCanvas.prototype.convertToBlob = async function (options) {
            const start = performance.now();
            const blob = await encode.call(this, options);
            root.previewMetrics.push({
              width: this.width,
              height: this.height,
              bytes: blob.size,
              quality: options?.quality,
              elapsedMs: performance.now() - start,
            });
            return blob;
          };
        });
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/tests/fixture.html");
      if (scenario === "text")
        await page.evaluate(() => {
          const target = document.querySelector("#distraction");
          target.innerHTML = `<script type="application/ld+json">${"invisible metadata ".repeat(40)}</script><span hidden>${"hidden copy ".repeat(40)}</span>Visible component context`;
        });
      if (scenario === "svg-text")
        await page.evaluate(() => {
          const graphic = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          graphic.id = "distraction";
          graphic.setAttribute("width", "400");
          graphic.setAttribute("height", "180");
          graphic.innerHTML =
            '<style>.label{fill:blue}</style><defs><text id="definition">Hidden definition</text></defs><g visibility="hidden"><text>Hidden series</text></g><text x="20" y="60" class="label">Visible component context</text>';
          document.querySelector("#distraction").replaceWith(graphic);
        });
      if (scenario === "sharp")
        await page.evaluate(() => {
          const target = document.querySelector<HTMLElement>("#distraction");
          target.textContent = "";
          target.style.cssText =
            "display:block!important;width:640px;height:240px;padding:0;border:0;border-radius:0;background:linear-gradient(90deg,rgb(230,30,45) 50%,rgb(20,80,225) 50%)";
        });
      if (
        scenario.startsWith("retina") ||
        scenario === "partial" ||
        scenario === "zoom"
      )
        await page.evaluate(
          ({ partial, fractional }) => {
            const target = document.querySelector<HTMLElement>("#distraction");
            target.style.cssText = `position:fixed;top:100px;left:${partial ? -100 : 100}px;width:${fractional ? 400.25 : 400}px;height:180px;padding:0;border:0;border-radius:0;background:rgb(230,30,45);display:block!important`;
          },
          {
            partial: scenario === "partial",
            fractional: scenario === "retina-fractional",
          },
        );
      if (scenario === "entropy")
        await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 1024;
          canvas.height = 768;
          const ctx = canvas.getContext("2d");
          const data = ctx.createImageData(1024, 768);
          let seed = 67;
          for (let i = 0; i < data.data.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            data.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
          }
          ctx.putImageData(data, 0, 0);
          const target = document.querySelector<HTMLElement>("#distraction");
          target.textContent = "";
          target.setAttribute("aria-label", "Detailed graphic");
          target.style.cssText = `position:fixed;top:0;left:0;width:1024px;height:768px;padding:0;border:0;border-radius:0;background-image:url(${canvas.toDataURL()});display:block!important`;
        });
      if (scenario === "zoom") {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
      }
      const dock = await openDock(context, bridge, page);
      // Arm after startup: only the preview document-liveness request may stall.
      if (scenario === "stalled-document")
        await worker.evaluate(() => {
          const execute = chrome.scripting.executeScript.bind(chrome.scripting);
          let stalled = false;
          chrome.scripting.executeScript = (options) => {
            if (options.target.documentIds && !stalled) {
              stalled = true;
              return new Promise(() => {});
            }
            return execute(options);
          };
        });
      await dock.locator("#hide").click();
      // Registration is asynchronous; target input belongs to the picker only
      // after its pressed state confirms the real handlers are installed.
      await expect(dock.locator("#hide")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const storedRule = () =>
        bridge.evaluate(async () => {
          const key = "site:http://127.0.0.1:5173";
          return (await chrome.storage.local.get(key))[key]?.rules[0];
        });
      await page.locator("#distraction").click();
      if (scenario === "cancel") {
        await expect(dock.locator("#hide")).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(dock.locator("#hide")).toBeEnabled();
        await expect(page.locator("#distraction")).toBeVisible();
        expect(await storedRule()).toBeUndefined();
        await expect(dock.locator(".dock")).toBeVisible();
        return;
      }
      await expect(page.locator("#distraction")).toBeHidden();
      if (scenario === "text" || scenario === "svg-text") {
        const rule = await storedRule();
        expect(rule.preview).toBeUndefined();
        expect(rule.summary.text).toBe("Visible component context");
        expect(rule.label).toBe("Visible component context");
        await dock.locator("#rules-toggle").click();
        await expect(
          dock.getByText("Text preview", { exact: true }),
        ).toBeVisible();
        await expect(dock.locator(".component-preview")).toContainText(
          "Visible component context",
        );
        return;
      }
      if (
        scenario === "rapid" ||
        scenario === "stalled-finish" ||
        scenario === "stalled-document"
      ) {
        await dock.locator("#undo").click();
        await expect(page.locator("#distraction")).toBeVisible();
        await page.locator("#distraction").click();
        await expect(page.locator("#distraction")).toBeHidden();
      }
      await expect.poll(async () => !!(await storedRule())?.preview).toBe(true);
      const rule = await storedRule();
      if (scenario === "sharp" || scenario === "wide") {
        await dock.locator("#rules-toggle").click();
        const image = dock.getByRole("img", { name: /Preview of/ });
        await expect(image).toBeVisible();
        const fits = await image.evaluate(
          (element) =>
            element.getBoundingClientRect().width <=
            element.closest(".component-preview").clientWidth,
        );
        expect(fits).toBe(true);
        const inspect = dock.getByRole("button", { name: /^Inspect / });
        await inspect.click();
        await expect(inspect).toHaveAttribute("aria-expanded", "true");
        if (scenario === "wide") {
          const region = dock.getByRole("region", {
            name: "Captured component",
          });
          await region.focus();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => region.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
        }
        await dock
          .locator(".dock")
          .screenshot({ path: evidencePath("preview-expanded.png") });
      }
      if (scenario.startsWith("retina") || scenario === "zoom") {
        expect(rule.preview.width).toBe(
          scenario === "retina-fractional" ? 801 : 800,
        );
        expect(rule.preview.height).toBe(360);
        expect(rule.preview.pixelRatio).toBe(2);
      }
      if (scenario === "partial") {
        expect(rule.preview.partial).toBe(true);
        expect(rule.preview.width).toBe(300);
      }
      if (scenario === "entropy") {
        expect(rule.preview.width).toBeGreaterThanOrEqual(640);
        expect(rule.preview.dataUrl.length).toBeLessThan(350000);
      }
      if (scenario === "sharp") {
        expect(rule.preview.width).toBeGreaterThanOrEqual(640);
        expect(rule.preview.height).toBe(240);
        const pixels = await page.evaluate(async (dataUrl) => {
          const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) =>
            c.charCodeAt(0),
          );
          const bitmap = await createImageBitmap(
            new Blob([bytes], { type: "image/webp" }),
          );
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return [
            Array.from(ctx.getImageData(80, 100, 1, 1).data),
            Array.from(ctx.getImageData(560, 100, 1, 1).data),
          ];
        }, rule.preview.dataUrl);
        expect(pixels[0][0]).toBeGreaterThan(200);
        expect(pixels[0][2]).toBeLessThan(70);
        expect(pixels[1][0]).toBeLessThan(50);
        expect(pixels[1][2]).toBeGreaterThan(190);
      }
    } finally {
      try {
        if (scenario === "entropy")
          await writeFile(
            evidencePath("preview-encoding.json"),
            JSON.stringify(
              await worker.evaluate(
                () =>
                  (
                    globalThis as typeof globalThis & {
                      previewMetrics: object[];
                    }
                  ).previewMetrics,
              ),
              null,
              2,
            ),
          );
        await context.tracing.stop({
          path: evidencePath(`preview-quality-${scenario}-trace.zip`),
        });
      } finally {
        await instance.close();
      }
    }
  });
}
