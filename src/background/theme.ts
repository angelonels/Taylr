import { storageArea, storageKey, type SiteProfile } from "../model";
import type { ThemeStatus } from "../inspector";

// Pin each operation to its original document and serialize rapid toggles. Read
// the saved flag inside the queue, so an older request cannot resurrect a theme.
const pending = new Map<string, Promise<unknown>>();
export function registerTheme() {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!["theme-sync", "theme-css"].includes(message?.type)) return;
    void (async () => {
      try {
        if (
          !sender.tab?.id ||
          sender.frameId !== 0 ||
          !sender.documentId ||
          !sender.url
        )
          throw new Error("No website document");
        const origin = new URL(sender.url).origin;
        const tabId = sender.tab.id;
        const target = { tabId, documentIds: [sender.documentId] };
        const readProfile = async () => {
          const key = storageKey(origin);
          return (await chrome.storage[storageArea()].get(key))[key] as
            SiteProfile | undefined;
        };
        if (message.type === "theme-css") {
          const profile = await readProfile();
          if (!profile?.darkMode || profile.paused)
            throw new Error("Site inactive");
          const url = new URL(message.url);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            !(await chrome.permissions.contains({
              origins: [`${url.origin}/*`],
            }))
          )
            throw new Error("Stylesheet access unavailable");
          const response = await fetch(url.href, {
            credentials: "omit",
            // Validate before following any hop; final-URL checks are too late
            // to prevent public CSS from reaching private/local destinations.
            redirect: "error",
            cache: "force-cache",
            signal: AbortSignal.timeout(8000),
          });
          if (
            !response.ok ||
            !response.headers
              .get("content-type")
              ?.toLowerCase()
              .includes("text/css")
          )
            throw new Error("Invalid stylesheet response");
          const finalURL = new URL(response.url);
          if (
            !["http:", "https:"].includes(finalURL.protocol) ||
            !(await chrome.permissions.contains({
              origins: [`${finalURL.origin}/*`],
            }))
          )
            throw new Error("Stylesheet redirect access unavailable");
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Empty stylesheet response");
          let size = 0;
          const decoder = new TextDecoder();
          const chunks: string[] = [];
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 2 * 1024 * 1024)
                throw new Error("Stylesheet too large");
              chunks.push(decoder.decode(value, { stream: true }));
            }
          } catch (cause) {
            await reader.cancel().catch(() => {});
            throw cause;
          } finally {
            reader.releaseLock();
          }
          reply({ css: chunks.join("") + decoder.decode() });
          return;
        }
        const key = sender.documentId;
        const operation = (pending.get(key) ?? Promise.resolve())
          .catch(() => {})
          .then(async () => {
            const profile = await readProfile();
            const enabled = !!profile?.darkMode && !profile.paused;
            const [probe] = await chrome.scripting.executeScript({
              target,
              func: () => ({
                loaded: !!window.__taylrTheme,
                stale:
                  !window.__taylrTheme &&
                  document.documentElement?.hasAttribute("data-taylr-theme"),
              }),
            });
            if (probe.result?.stale)
              throw new Error("Previous extension context. Reload this page.");
            if (!probe.result?.loaded && !enabled) return "off" as ThemeStatus;
            if (!probe.result?.loaded)
              await chrome.scripting.executeScript({
                target,
                files: ["theme.js"],
              });
            const [result] = await chrome.scripting.executeScript({
              target,
              func: (active) => window.__taylrTheme?.setEnabled(active),
              args: [enabled],
            });
            if (!result.result) throw new Error("Theme unavailable");
            return result.result;
          });
        pending.set(key, operation);
        try {
          reply({ status: await operation });
        } finally {
          if (pending.get(key) === operation) pending.delete(key);
        }
      } catch {
        reply({ error: "Could not update dark mode. Reload to try again." });
      }
    })();
    return true;
  });
}
