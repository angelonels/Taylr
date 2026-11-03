import { storageArea, storageKey, type SiteProfile } from "../model";
import type { ThemeStatus } from "../inspector";

// Pin each operation to its original document and serialize rapid toggles. Read
// the saved flag inside the queue, so an older request cannot resurrect a theme.
const pending = new Map<string, Promise<unknown>>();
// The worker's fetch skips the browser's private-network checks, and the
// recolored result is readable by the page. A public page must not reach
// literal private, loopback or link-local hosts through it; a page that is
// itself local keeps its local stylesheets. Names resolving to private
// addresses (DNS rebinding) are outside what a hostname check can see.
function privateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (/(^|\.)(localhost|local|internal)$/.test(host)) return true;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return (
    host === "::" ||
    host === "::1" ||
    host.startsWith("::ffff:") ||
    /^f[cd]/.test(host) ||
    /^fe[89ab]/.test(host)
  );
}
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
            (privateHost(url.hostname) &&
              !privateHost(new URL(origin).hostname)) ||
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
