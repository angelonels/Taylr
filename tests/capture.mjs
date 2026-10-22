import { writeFile } from "node:fs/promises";
import { VerificationError } from "./run-evidence.mjs";

// Capture the rendered Chromium surface without Playwright's document.fonts.ready gate.
// A stalled third-party font must not prevent unrelated behavior verification.
export async function captureEvidence(
  page,
  path,
  { locator, timeout = 5000 } = {},
) {
  const session = await page.context().newCDPSession(page);
  let timer;
  try {
    const clip = locator ? await locator.boundingBox() : undefined;
    if (locator && !clip)
      throw new Error("Evidence component has no visible bounds");
    if (clip) {
      // Locator bounds are viewport-relative; CDP clips use document coordinates.
      const offset = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      clip.x += offset.x;
      clip.y += offset.y;
    }
    const image = await Promise.race([
      session.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Evidence capture exceeded ${timeout}ms`)),
          timeout,
        );
      }),
    ]);
    await writeFile(path, Buffer.from(image.data, "base64"));
  } catch (error) {
    throw new VerificationError(error.message, {
      outcome: "harness-error",
      phase: "artifacts",
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    await session.detach().catch(() => {});
  }
}
