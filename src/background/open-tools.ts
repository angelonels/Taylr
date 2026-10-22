import type {} from "../inspector";

type Notice = "protected" | "changed" | "denied" | "unavailable";
const opening = new Map<number, Promise<void>>();

async function notice(tab: chrome.tabs.Tab, reason: Notice) {
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
        ? "Chrome protects this page"
        : "Click Taylr to try again",
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

function protectedPage(url: URL) {
  return (
    !["http:", "https:"].includes(url.protocol) ||
    url.hostname === "chromewebstore.google.com" ||
    (url.hostname === "chrome.google.com" &&
      url.pathname.startsWith("/webstore"))
  );
}

// Installation grants host access. Respect browser-withheld access without
// replacing the user's choice with a per-site permission request.
export function openTools(
  tab: chrome.tabs.Tab,
  register: (origin: string) => Promise<void>,
): Promise<void> {
  if (!tab.id) return Promise.resolve();
  let url: URL;
  try {
    url = new URL(tab.url ?? "");
  } catch {
    return notice(tab, "unavailable");
  }
  if (protectedPage(url)) return notice(tab, "protected");
  const access = chrome.permissions
    .contains({ origins: [`${url.origin}/*`] })
    .catch(() => false);
  const operation = (opening.get(tab.id) ?? Promise.resolve())
    .catch(() => {})
    .then(() => inject(tab, url.origin, access, register))
    .finally(() => {
      if (opening.get(tab.id!) === operation) opening.delete(tab.id!);
    });
  opening.set(tab.id, operation);
  return operation;
}

async function inject(
  tab: chrome.tabs.Tab,
  origin: string,
  access: Promise<boolean>,
  register: (origin: string) => Promise<void>,
) {
  const tabId = tab.id!;
  await chrome.action.setBadgeText({ tabId, text: "" });
  await chrome.action.setTitle({ tabId, title: "Open Taylr" });
  const granted = await access;
  let setupFailed = false;
  if (granted) {
    try {
      await register(origin);
    } catch {
      setupFailed = true;
    }
  }
  let desiredOpen: boolean | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let current: chrome.tabs.Tab;
    try {
      current = await chrome.tabs.get(tabId);
    } catch {
      return;
    } // A closed tab needs no recovery surface.
    if (!current.url || new URL(current.url).origin !== origin) {
      await notice(current, "changed");
      return;
    }
    try {
      const [identity] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          origin: location.origin,
          open: window.__taylr?.getSnapshot().open,
        }),
      });
      if (identity?.result?.origin !== origin) {
        await notice(current, "changed");
        return;
      }
      if (!identity.documentId) throw new Error("Document was removed");
      const target = { tabId, documentIds: [identity.documentId] };
      desiredOpen ??= !identity.result.open;
      await chrome.scripting.executeScript({ target, files: ["content.js"] });
      // Mounting is idempotent. Retrying after a lost acknowledgement must never
      // interpret recovery as a second user toggle and close an opened toolbar.
      await chrome.scripting.executeScript({ target, files: ["dock.js"] });
      await chrome.scripting.executeScript({
        target,
        args: [desiredOpen],
        func: (open: boolean) => {
          const inspector = window.__taylr;
          if (!inspector || !window.__taylrDock)
            throw new Error("Toolbar unavailable");
          if (inspector.getSnapshot().open !== open) inspector.toggle();
        },
      });
      if (!granted || setupFailed)
        await chrome.tabs.sendMessage(
          tabId,
          { type: granted ? "setup-failed" : "access-denied" },
          { documentId: identity.documentId },
        );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        /cannot access|permission|not allowed|extensions gallery|web store/i.test(
          message,
        )
      ) {
        await notice(current, "denied");
        return;
      }
      // Only document/context races get one bounded retry; other errors remain
      // visible rather than hiding a persistent failure behind repeated attempts.
      if (
        attempt === 1 ||
        !/frame|document|context|removed|closed|unavailable/i.test(message)
      ) {
        await notice(current, "unavailable");
        return;
      }
    }
  }
}
