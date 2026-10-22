import { openTools } from "./background/open-tools";
import {
  validPreview,
  validSummary,
  registerPreviewCapture,
} from "./background/previews";
import {
  storageArea,
  storageKey,
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
            ...(validSummary(message.summary)
              ? { summary: message.summary }
              : {}),
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
// Chrome does not await action listeners. The opening module preserves the
// original permission gesture and serializes explicit toggles for each tab.
// oxlint-disable-next-line typescript/no-misused-promises
chrome.action.onClicked.addListener((tab) =>
  openTools(tab, registerOrigin).catch(() => {}),
);
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

registerPreviewCapture();
