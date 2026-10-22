import type { ComponentPreview, ComponentSummary } from "./model";

type PendingCapture = { prepare: () => Promise<boolean>; finish: () => void };
const pending = new Map<string, PendingCapture>();
let listening = false;
function listen() {
  // content.js may be injected again when the Chrome action is invoked. Only
  // the controller that actually captures installs a document listener.
  if (listening) return;
  listening = true;
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    const capture = pending.get(message?.id);
    if (!capture) return;
    if (message.type === "finish-preview") capture.finish();
    if (message.type !== "prepare-preview") return;
    void capture.prepare().then((ready) => reply({ ready }));
    return true;
  });
}

export function componentText(element: Element): string {
  let graphicText = "";
  if (element instanceof SVGElement) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) && graphicText.length < 280) {
      const owner = node.parentElement;
      if (
        owner?.closest("text") &&
        !owner.closest(
          "defs,symbol,clipPath,mask,pattern,marker,script,style",
        ) &&
        owner.getClientRects().length &&
        getComputedStyle(owner).visibility === "visible"
      )
        graphicText += `${node.textContent ?? ""} `;
    }
    graphicText ||=
      element.querySelector(":scope > title, :scope > desc")?.textContent ?? "";
  }
  // Never inspect form values, HTML, or external resources for the fallback.
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("alt") ||
    (element instanceof HTMLElement
      ? element.innerText
      : element instanceof SVGElement
        ? graphicText
        : element.textContent) ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export function summarize(element: Element): ComponentSummary {
  const rect = element.getBoundingClientRect();
  const text = componentText(element);
  const kind = element.matches("img, picture")
    ? "Image"
    : element.matches("canvas, svg")
      ? "Graphic"
      : element.matches("video, audio")
        ? "Media"
        : element.matches("button, input, select, textarea")
          ? "Control"
          : "Section";
  return {
    kind,
    text,
    width: Math.min(100000, Math.round(rect.width)),
    height: Math.min(100000, Math.round(rect.height)),
  };
}

export async function capturePreview(
  element: Element,
  hosts: (HTMLElement | null)[],
) {
  listen();
  const id = crypto.randomUUID();
  const geometry = () =>
    JSON.stringify([
      element.getBoundingClientRect().toJSON(),
      innerWidth,
      innerHeight,
      scrollX,
      scrollY,
      devicePixelRatio,
      visualViewport?.offsetLeft,
      visualViewport?.offsetTop,
      visualViewport?.scale,
      visualViewport?.width,
      visualViewport?.height,
    ]);
  const initial = geometry();
  const unchanged = () => element.isConnected && geometry() === initial;
  let finished = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    for (const host of hosts) host?.style.removeProperty("visibility");
  };
  pending.set(id, {
    prepare: async () => {
      if (finished || !unchanged()) return false;
      for (const host of hosts)
        host?.style.setProperty("visibility", "hidden", "important");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return !finished && unchanged();
    },
    finish,
  });
  const rect = element.getBoundingClientRect().toJSON();
  rect.x -= visualViewport?.offsetLeft ?? 0;
  rect.y -= visualViewport?.offsetTop ?? 0;
  try {
    // A queued native capture may need one quota interval; capture failure must
    // still leave Hide usable, including documents with paused animation frames.
    const result: { preview?: ComponentPreview } = await Promise.race([
      chrome.runtime
        .sendMessage({
          type: "capture-preview",
          id,
          rect,
          viewport: {
            width: visualViewport?.width ?? innerWidth,
            height: visualViewport?.height ?? innerHeight,
          },
        })
        .catch(() => ({})),
      new Promise<{}>((resolve) => {
        deadline = setTimeout(() => resolve({}), 2000);
      }),
    ]);
    return unchanged() ? result?.preview : undefined;
  } finally {
    finished = true;
    clearTimeout(deadline);
    pending.delete(id);
    finish();
  }
}
