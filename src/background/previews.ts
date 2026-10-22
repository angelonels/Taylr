import type { ComponentPreview, ComponentSummary } from "../model";

export function validPreview(value: unknown): value is ComponentPreview {
  const p = value as ComponentPreview | undefined;
  return (
    !!p &&
    typeof p.dataUrl === "string" &&
    p.dataUrl.length < 350000 &&
    /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(p.dataUrl) &&
    Number.isInteger(p.width) &&
    p.width > 0 &&
    p.width <= 1024 &&
    Number.isInteger(p.height) &&
    p.height > 0 &&
    p.height <= 768 &&
    typeof p.partial === "boolean" &&
    (p.pixelRatio === undefined ||
      (Number.isFinite(p.pixelRatio) && p.pixelRatio > 0 && p.pixelRatio <= 2))
  );
}
export function validSummary(value: unknown): value is ComponentSummary {
  const s = value as ComponentSummary | undefined;
  return (
    !!s &&
    typeof s.kind === "string" &&
    s.kind.length <= 24 &&
    typeof s.text === "string" &&
    s.text.length <= 280 &&
    Number.isFinite(s.width) &&
    s.width >= 0 &&
    s.width <= 100000 &&
    Number.isFinite(s.height) &&
    s.height >= 0 &&
    s.height <= 100000
  );
}
let lastCapture = 0;
let captures = Promise.resolve();
async function bounded<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Capture timed out")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function registerPreviewCapture() {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (
      message?.type !== "capture-preview" ||
      !sender.tab?.id ||
      sender.frameId !== 0
    )
      return;
    const tabId = sender.tab.id,
      windowId = sender.tab.windowId;
    const operation = captures.then(async () => {
      const target = sender.documentId
        ? { documentId: sender.documentId }
        : { frameId: 0 };
      try {
        const { rect, viewport } = message;
        const values = [
          rect?.x,
          rect?.y,
          rect?.width,
          rect?.height,
          viewport?.width,
          viewport?.height,
        ];
        if (
          !values.every((v) => typeof v === "number" && Number.isFinite(v)) ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          viewport.width <= 0 ||
          viewport.height <= 0
        )
          throw new Error("Invalid capture area");
        const active = async () => {
          const [tab] = await chrome.tabs.query({ active: true, windowId });
          if (tab?.id !== tabId || tab.url !== sender.url)
            throw new Error("Page changed");
        };
        await active();
        const delay = Math.max(0, 550 - (Date.now() - lastCapture));
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        await active();
        const prepared = await bounded(
          chrome.tabs.sendMessage(
            tabId,
            {
              type: "prepare-preview",
              id: message.id,
            },
            target,
          ),
          1000,
        );
        if (!prepared?.ready) throw new Error("Page changed");
        await active();
        lastCapture = Date.now();
        const data = await bounded(
          chrome.tabs.captureVisibleTab(windowId, {
            format: "png",
          }),
          1500,
        );
        // A frozen renderer must not hold the worker's capture queue open.
        void chrome.tabs
          .sendMessage(
            tabId,
            { type: "finish-preview", id: message.id },
            target,
          )
          .catch(() => {});
        await active();
        if (sender.documentId)
          await bounded(
            chrome.scripting.executeScript({
              target: { tabId, documentIds: [sender.documentId] },
              func: () => true,
            }),
            500,
          );
        const x = Math.max(0, rect.x),
          y = Math.max(0, rect.y);
        const width = Math.min(viewport.width, rect.x + rect.width) - x;
        const height = Math.min(viewport.height, rect.y + rect.height) - y;
        if (width < 1 || height < 1) throw new Error("Outside viewport");
        const bytes = Uint8Array.from(atob(data.split(",")[1]), (c) =>
          c.charCodeAt(0),
        );
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        try {
          const scale = Math.min(
            2,
            bitmap.width / viewport.width,
            bitmap.height / viewport.height,
            1024 / width,
            768 / height,
          );
          let canvas = new OffscreenCanvas(
            Math.max(1, Math.round(width * scale)),
            Math.max(1, Math.round(height * scale)),
          );
          const sx = bitmap.width / viewport.width,
            sy = bitmap.height / viewport.height;
          canvas
            .getContext("2d")!
            .drawImage(
              bitmap,
              x * sx,
              y * sy,
              width * sx,
              height * sy,
              0,
              0,
              canvas.width,
              canvas.height,
            );
          // Detailed photos/canvas content need a bounded encoding strategy, not
          // an empty card merely because the first high-quality encode is large.
          let blob = await canvas.convertToBlob({
            type: "image/webp",
            quality: 0.9,
          });
          if (blob.size > 260000 && blob.size <= 360000)
            blob = await canvas.convertToBlob({
              type: "image/webp",
              quality: 0.75,
            });
          if (blob.size > 260000) {
            const reduction = Math.min(0.9, Math.sqrt(260000 / blob.size));
            const reduced = new OffscreenCanvas(
              Math.max(1, Math.round(canvas.width * reduction)),
              Math.max(1, Math.round(canvas.height * reduction)),
            );
            reduced
              .getContext("2d")!
              .drawImage(canvas, 0, 0, reduced.width, reduced.height);
            blob = await reduced.convertToBlob({
              type: "image/webp",
              quality: 0.85,
            });
            if (blob.size > 260000)
              blob = await reduced.convertToBlob({
                type: "image/webp",
                quality: 0.65,
              });
            canvas = reduced;
          }
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          const encoded = btoa(binary);
          const preview = {
            dataUrl: "data:image/webp;base64," + encoded,
            width: canvas.width,
            height: canvas.height,
            partial: width < rect.width || height < rect.height,
            // Rounding a fractional CSS width may add half a backing pixel.
            pixelRatio: Math.min(2, canvas.width / width),
          };
          reply(validPreview(preview) ? { preview } : {});
        } finally {
          bitmap.close();
        }
      } catch {
        reply({});
      } finally {
        void chrome.tabs
          .sendMessage(
            tabId,
            { type: "finish-preview", id: message.id },
            target,
          )
          .catch(() => {});
      }
    });
    captures = operation.catch(() => {});
    return true;
  });
}
