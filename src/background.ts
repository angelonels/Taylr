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
          });
        }
      }
      if (message.type === "remove")
        profile.rules = profile.rules.filter((rule) => rule.id !== message.id);
      if (message.type === "restore") profile.rules = [];
      if (message.type !== "get") {
        await chrome.storage[storageArea()].set({ [key]: profile });
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

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    message?.type !== "register" ||
    !sender.url?.startsWith(chrome.runtime.getURL(""))
  )
    return;
  void (async () => {
    try {
      const url = new URL(message.origin);
      if (!["https:", "http:"].includes(url.protocol))
        throw new Error("Unsupported site");
      const match = `${url.origin}/*`;
      if (!(await chrome.permissions.contains({ origins: [match] })))
        throw new Error("Site access is required");
      const id = `site-${encodeURIComponent(url.origin).replace(/%/g, "_")}`;
      if (
        !(await chrome.scripting.getRegisteredContentScripts({ ids: [id] }))
          .length
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
      reply({ ok: true });
    } catch (error) {
      reply({ error: String(error) });
    }
  })();
  return true;
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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
