import { storeProfile } from "./background/store-profile";
import { validStyles } from "./edit-properties";
import { openTools } from "./background/open-tools";
import {
  validPreview,
  validSummary,
  registerPreviewCapture,
} from "./background/previews";
import {
  storageArea,
  storageKey,
  RequestError,
  type Request,
  type SiteProfile,
  type Rule,
} from "./model";

// One writer serializes profile changes across tabs; broadcasts update each controller.
let pending = Promise.resolve();
chrome.runtime.onMessage.addListener((message: Request, sender, reply) => {
  if (
    !message ||
    ![
      "get",
      "add",
      "edit",
      "undo-edit",
      "remove",
      "restore",
      "set-paused",
    ].includes(message.type)
  )
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
      let savedRule: Rule | undefined, previousRule: Rule | undefined;
      if (message.type === "edit") {
        if (profile.paused) throw new Error("Resume this site before editing.");
        if (
          !validStyles(message.styles) ||
          typeof message.selector !== "string" ||
          message.selector.length > 4096 ||
          /[{}]/.test(message.selector) ||
          typeof message.label !== "string" ||
          (message.text !== undefined &&
            (typeof message.text !== "string" || message.text.length > 5000))
        )
          throw new Error("Invalid element changes.");
        const existing = profile.rules.find(
          (rule) => rule.kind === "edit" && rule.selector === message.selector,
        );
        previousRule = existing ? structuredClone(existing) : undefined;
        savedRule = {
          id: existing?.id ?? crypto.randomUUID(),
          kind: "edit",
          selector: message.selector,
          label: message.label.slice(0, 120),
          styles: { ...existing?.styles, ...message.styles },
          ...(existing?.text !== undefined ? { text: existing.text } : {}),
          ...(message.text !== undefined ? { text: message.text } : {}),
          revision: crypto.randomUUID(),
          createdAt: existing?.createdAt ?? Date.now(),
        };
        profile.rules = [
          ...profile.rules.filter((rule) => rule.id !== existing?.id),
          savedRule,
        ];
      }
      if (message.type === "undo-edit") {
        const current = profile.rules.find((rule) => rule.id === message.id);
        if (
          !current ||
          current.kind !== "edit" ||
          current.revision !== message.revision
        )
          throw new RequestError(
            "This rule changed in another tab. Use Edits to restore it.",
            "revision-conflict",
          );
        if (
          message.before &&
          (message.before.id !== current.id ||
            message.before.kind !== "edit" ||
            message.before.selector !== current.selector ||
            !validStyles(message.before.styles) ||
            (message.before.text !== undefined &&
              (typeof message.before.text !== "string" ||
                message.before.text.length > 5000)))
        )
          throw new Error("Invalid rule history.");
        profile.rules = profile.rules.filter((rule) => rule.id !== message.id);
        if (message.before) profile.rules.push(message.before);
      }
      if (message.type === "set-paused") {
        if (typeof message.paused !== "boolean")
          throw new Error("Invalid site setting.");
        profile.paused = message.paused;
      }
      if (message.type === "add") {
        if (profile.paused)
          throw new Error("Resume this site before hiding elements.");
        if (
          typeof message.selector !== "string" ||
          message.selector.length > 4096 ||
          typeof message.label !== "string"
        )
          throw new Error(
            "This element cannot be saved. Try a surrounding element.",
          );
        if (
          !profile.rules.some(
            (rule) =>
              rule.kind !== "edit" && rule.selector === message.selector,
          )
        ) {
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
        // Permission/setup failure must leave the persisted pause state intact.
        if (message.type === "set-paused" && !message.paused)
          await registerOrigin(message.origin);
        await storeProfile(key, profile, createdRuleId);
        const tabs = await chrome.tabs.query({ url: `${message.origin}/*` });
        await Promise.allSettled(
          tabs
            .filter(
              (tab) =>
                tab.incognito === chrome.extension.inIncognitoContext && tab.id,
            )
            .map(async (tab) => {
              // Ensure a controller exists even if earlier setup failed, then
              // resume saved rules in this tab as well as mounted panels.
              if (message.type === "set-paused" && !message.paused)
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id! },
                  files: ["content.js"],
                });
              await chrome.tabs.sendMessage(tab.id!, {
                type: "profile",
                profile,
              });
            }),
        );
      }
      reply({ profile, createdRuleId, savedRule, previousRule });
    } catch (error) {
      reply({
        error:
          error instanceof Error ? error.message : "Could not save. Try again.",
        ...(error instanceof RequestError ? { code: error.code } : {}),
      });
    }
  });
  return true;
});

const registering = new Map<string, Promise<void>>();
const scriptId = (origin: string) =>
  `site-${encodeURIComponent(origin).replace(/%/g, "_")}`;
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
    throw new Error(
      "Use Chrome’s extension settings to allow access to this site.",
    );
  const id = scriptId(origin);
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
  if (!["register", "chrome-access"].includes(message?.type)) return;
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
      if (message.type === "chrome-access")
        await chrome.tabs.create({
          url: `chrome://extensions/?id=${chrome.runtime.id}`,
        });
      else await registerOrigin(message.origin);
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
// Chrome does not await action listeners. Opening checks installation grants
// and serializes explicit toggles for each tab.
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
        typeof message.css !== "string" ||
        (message.pending !== undefined &&
          (!Array.isArray(message.pending) ||
            message.pending.some((css: unknown) => typeof css !== "string")))
      )
        throw new Error("Invalid stylesheet");
      const target = sender.documentId
        ? { tabId, documentIds: [sender.documentId] }
        : { tabId };
      const obsolete = new Set<string>([
        message.previous,
        ...(message.pending ?? []),
      ]);
      obsolete.delete("");
      obsolete.delete(message.css);
      if (message.css === message.previous && !obsolete.size) {
        reply({ ok: true });
        return;
      }
      // Chrome stacks identical insertions and removes only one copy. A failed
      // render can leave this desired text inserted, or already removed during
      // partial cleanup. Normalize that uncertain copy before inserting once.
      if (
        message.css &&
        (message.css === message.previous ||
          message.pending?.includes(message.css))
      )
        await chrome.scripting.removeCSS({
          target,
          css: message.css,
          origin: "USER",
        });
      // Normal replacements install first, avoiding a flash of site styles.
      if (message.css)
        await chrome.scripting.insertCSS({
          target,
          css: message.css,
          origin: "USER",
        });
      for (const css of obsolete)
        await chrome.scripting.removeCSS({
          target,
          css,
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
