import { writeFile } from "node:fs/promises";
import { VerificationError } from "./run-evidence.mjs";
import { within } from "./deadline.mjs";

// Bound capture and detach separately. A busy renderer must not strand a test
// before its original failure can be recorded, or leave its CDP session live.
export async function captureEvidence(
  page,
  path,
  { locator, timeout = 5000 } = {},
) {
  let abandoned = false;
  let session;
  const detach = (attached) =>
    within(() => attached.detach(), 500, "Evidence detach").catch(() => {});
  try {
    await within(
      async () => {
        if (page.isClosed()) throw new Error("Evidence page is closed");
        const attached = await page.context().newCDPSession(page);
        if (abandoned) {
          await detach(attached);
          return;
        }
        session = attached;
        if (page.isClosed()) throw new Error("Evidence page is closed");
        const clip = locator
          ? await locator.boundingBox({ timeout })
          : undefined;
        if (locator && !clip)
          throw new Error("Evidence component has no visible bounds");
        if (clip) {
          const offset = await page.evaluate(() => ({
            x: scrollX,
            y: scrollY,
          }));
          clip.x += offset.x;
          clip.y += offset.y;
        }
        if (abandoned) return;
        if (page.isClosed()) throw new Error("Evidence page is closed");
        const image = await attached.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
          ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
        });
        if (!abandoned)
          await writeFile(path, Buffer.from(image.data, "base64"));
      },
      timeout,
      "Evidence capture",
    );
  } catch (error) {
    throw new VerificationError(error.message, {
      outcome: "harness-error",
      phase: "artifacts",
      cause: error,
    });
  } finally {
    abandoned = true;
    if (session) await detach(session);
  }
}
