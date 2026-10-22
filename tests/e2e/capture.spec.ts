import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { captureEvidence } from "../capture.mjs";

// Failure first: viewport-relative locator bounds must not crop unrelated page pixels
// after scrolling. Cover the fixed dock and ordinary document content independently.
// Playwright requires destructuring; this scenario owns its disposable browser.
// oxlint-disable-next-line no-empty-pattern
test("Evidence capture preserves actual component pixels after scrolling", async ({}, testInfo) => {
  const instance = await isolatedBrowser();
  await instance.context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const page = await instance.context.newPage();
    await page.setContent(
      `<style>body{width:4000px;height:5000px;margin:0;background:rgb(0,0,255)}div{width:200px;height:100px}#fixed{position:fixed;left:30px;top:40px;background:rgb(255,0,0)}#flow{position:absolute;left:700px;top:2400px;background:rgb(0,255,0)}</style><div id="fixed"></div><div id="flow"></div>`,
    );
    await page.evaluate(() => scrollTo(500, 2000));
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({
      x: 500,
      y: 2000,
    });
    for (const [id, expected] of [
      ["fixed", [255, 0, 0, 255]],
      ["flow", [0, 255, 0, 255]],
    ] as const) {
      const path = testInfo.outputPath(`${id}.png`);
      await captureEvidence(page, path, { locator: page.locator(`#${id}`) });
      await testInfo.attach(id, { path, contentType: "image/png" });
      const pixels = await page.evaluate(
        async (data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          if (!context)
            throw new Error("Canvas decoding context is unavailable");
          context.drawImage(image, 0, 0);
          return {
            width: image.width,
            height: image.height,
            center: [...context.getImageData(100, 50, 1, 1).data],
          };
        },
        (await readFile(path)).toString("base64"),
      );
      expect(pixels).toEqual({ width: 200, height: 100, center: expected });
    }
  } finally {
    try {
      await instance.context.tracing.stop({
        path: testInfo.outputPath("trace.zip"),
      });
    } finally {
      await instance.close();
    }
  }
});
