import {
  storageArea,
  storageKey,
  type ComponentPreview,
  type Request,
  type SiteProfile,
} from "./model";

// One writer serializes read-modify-write across tabs; storage changes update every page.
let pending = Promise.resolve();
chrome.runtime.onMessage.addListener((message: Request, sender, reply) => {
  if (!message || !["get", "add", "remove", "restore"].includes(message.type))
    return;
  pending = pending.then(async () => {
    try {
      const url = new URL(message.origin);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.origin !== message.origin
      )
        throw new Error("Open a website to use Taylr.");
      if (
        sender.tab &&
        !sender.url?.startsWith(chrome.runtime.getURL("")) &&
        new URL(sender.url!).origin !== message.origin
      )
        throw new Error("This page cannot change another site.");
      const key = storageKey(message.origin);
      const stored = (await chrome.storage[storageArea()].get(key))[key] as
        SiteProfile | undefined;
      const profile: SiteProfile = stored ?? {
        version: 1,
        origin: message.origin,
        rules: [],
      };
      let createdRuleId: string | undefined;
      if (message.type === "add") {
        if (
          typeof message.selector !== "string" ||
          message.selector.length > 4096 ||
          typeof message.label !== "string"
        )
          throw new Error(
            "This element cannot be saved. Try a surrounding element.",
          );
        if (!profile.rules.some((rule) => rule.selector === message.selector)) {
          createdRuleId = crypto.randomUUID();
          profile.rules.push({
            id: createdRuleId,
            selector: message.selector,
            label: message.label.slice(0, 120),
            createdAt: Date.now(),
            ...(validPreview(message.preview)
              ? { preview: message.preview }
              : {}),
          });
        }
      }
      if (message.type === "remove")
        profile.rules = profile.rules.filter((rule) => rule.id !== message.id);
      if (message.type === "restore") profile.rules = [];
      if (message.type !== "get") {
        try {
          await chrome.storage[storageArea()].set({ [key]: profile });
        } catch (error) {
          // A preview is optional: storage pressure must never prevent a new Hide.
          const added = profile.rules.find((rule) => rule.id === createdRuleId);
          if (!added?.preview) throw error;
          delete added.preview;
          await chrome.storage[storageArea()].set({ [key]: profile });
        }
        const tabs = await chrome.tabs.query({ url: `${message.origin}/*` });
        await Promise.allSettled(
          tabs
            .filter(
              (tab) =>
                tab.incognito === chrome.extension.inIncognitoContext && tab.id,
            )
            .map((tab) =>
              chrome.tabs.sendMessage(tab.id!, { type: "profile", profile }),
            ),
        );
      }
      reply({ profile, createdRuleId });
    } catch (error) {
      reply({
        error:
          error instanceof Error ? error.message : "Could not save. Try again.",
      });
    }
  });
  return true;
});

const registering = new Map<string, Promise<void>>();
function registerOrigin(origin: string) {
  let operation = registering.get(origin);
  if (!operation) {
    operation = registerScript(origin).finally(() =>
      registering.delete(origin),
    );
    registering.set(origin, operation);
  }
  return operation;
}
async function registerScript(origin: string) {
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol) || url.origin !== origin)
    throw new Error("Open a website to use Taylr.");
  const match = `${origin}/*`;
  if (!(await chrome.permissions.contains({ origins: [match] })))
    throw new Error("Click Taylr’s icon and allow access to this site.");
  const id = `site-${encodeURIComponent(origin).replace(/%/g, "_")}`;
  if (
    !(await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length
  )
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [match],
        js: ["content.js"],
        runAt: "document_start",
        persistAcrossSessions: true,
      },
    ]);
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "register") return;
  void (async () => {
    try {
      const trustedPage = sender.url?.startsWith(chrome.runtime.getURL(""));
      const ownSite =
        sender.tab &&
        sender.frameId === 0 &&
        sender.url &&
        new URL(sender.url).origin === message.origin;
      if (!trustedPage && !ownSite)
        throw new Error("This page cannot change another site.");
      await registerOrigin(message.origin);
      reply({ ok: true });
    } catch (error) {
      reply({
        error:
          error instanceof Error
            ? error.message
            : "Could not enable this site.",
      });
    }
  })();
  return true;
});
async function notice(tab: chrome.tabs.Tab, reason: string) {
  if (!tab.id) return;
  await chrome.action.setBadgeBackgroundColor({
    tabId: tab.id,
    color: "#c56b88",
  });
  await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
  await chrome.action.setTitle({
    tabId: tab.id,
    title:
      reason === "protected"
        ? "Chrome does not allow extensions on this page"
        : "Reload this page and try Taylr again",
  });
  try {
    await chrome.action.setPopup({
      tabId: tab.id,
      popup: `notice.html?reason=${reason}`,
    });
    await chrome.action.openPopup({ windowId: tab.windowId });
  } finally {
    await chrome.action.setPopup({ tabId: tab.id, popup: "" });
  }
}
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  let url: URL;
  try {
    url = new URL(tab.url ?? "");
  } catch {
    await notice(tab, "unavailable");
    return;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.hostname === "chromewebstore.google.com" ||
    (url.hostname === "chrome.google.com" &&
      url.pathname.startsWith("/webstore"))
  ) {
    await notice(tab, "protected");
    return;
  }
  // Keep the optional permission request inside Chrome's original toolbar gesture.
  const access = chrome.permissions
    .request({ origins: [`${url.origin}/*`] })
    .catch(() => false);
  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.action.setTitle({ tabId: tab.id, title: "Open Taylr" });
  try {
    const granted = await access;
    if (granted) await registerOrigin(url.origin);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["dock.js"],
    });
    if (!granted)
      await chrome.tabs.sendMessage(tab.id, { type: "access-denied" });
  } catch {
    await notice(tab, "unavailable");
  }
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "picker-state" && sender.tab?.id)
    void chrome.action.setIcon({
      tabId: sender.tab.id,
      path: {
        16: `icons/${message.active ? "active" : "icon"}-16.png`,
        32: `icons/${message.active ? "active" : "icon"}-32.png`,
      },
    });
});

// User-origin CSS outranks site styles, including inline !important declarations.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "render" || !sender.tab?.id) return;
  const tabId = sender.tab.id;
  void (async () => {
    try {
      if (
        typeof message.previous !== "string" ||
        typeof message.css !== "string"
      )
        throw new Error("Invalid stylesheet");
      const target = sender.documentId
        ? { tabId, documentIds: [sender.documentId] }
        : { tabId };
      if (message.previous)
        await chrome.scripting.removeCSS({
          target,
          css: message.previous,
          origin: "USER",
        });
      if (message.css)
        await chrome.scripting.insertCSS({
          target,
          css: message.css,
          origin: "USER",
        });
      reply({ ok: true });
    } catch {
      reply({
        error: "Saved, but could not update this page. Reload to try again.",
      });
    }
  })();
  return true;
});

function validPreview(value: unknown): value is ComponentPreview {
  const p = value as ComponentPreview | undefined;
  return (
    !!p &&
    typeof p.dataUrl === "string" &&
    p.dataUrl.length < 40000 &&
    /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(p.dataUrl) &&
    Number.isInteger(p.width) &&
    p.width > 0 &&
    p.width <= 320 &&
    Number.isInteger(p.height) &&
    p.height > 0 &&
    p.height <= 200 &&
    typeof p.partial === "boolean"
  );
}
let lastCapture = 0;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    message?.type !== "capture-preview" ||
    !sender.tab?.id ||
    sender.frameId !== 0
  )
    return;
  const tabId = sender.tab.id,
    windowId = sender.tab.windowId;
  void (async () => {
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
      if (Date.now() - lastCapture < 550) throw new Error("Capture busy");
      lastCapture = Date.now();
      const data = await chrome.tabs.captureVisibleTab(windowId, {
        format: "png",
      });
      await active();
      if (sender.documentId)
        await chrome.scripting.executeScript({
          target: { tabId, documentIds: [sender.documentId] },
          func: () => true,
        });
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
        const scale = Math.min(1, 320 / width, 200 / height);
        const canvas = new OffscreenCanvas(
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
        const blob = await canvas.convertToBlob({
          type: "image/webp",
          quality: 0.72,
        });
        const encoded = btoa(
          String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())),
        );
        const preview = {
          dataUrl: "data:image/webp;base64," + encoded,
          width: canvas.width,
          height: canvas.height,
          partial: width < rect.width || height < rect.height,
        };
        reply(validPreview(preview) ? { preview } : {});
      } finally {
        bitmap.close();
      }
    } catch {
      reply({});
    }
  })();
  return true;
});
