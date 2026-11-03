import {
  enable,
  disable,
  isEnabled,
  setFetchMethod,
} from "darkreader/darkreader.mjs";
import type { ThemeStatus } from "./inspector";

declare global {
  interface Window {
    __taylrTheme?: { setEnabled(enabled: boolean): ThemeStatus };
  }
}

// The engine's internal message bus is scoped by the build adapter. These calls
// still use Chrome's real extension API, including its Promise return value.
setFetchMethod(async (url) => {
  const result = await chrome.runtime.sendMessage({ type: "theme-css", url });
  if (!result || result.error) throw new Error("Stylesheet unavailable");
  return new Response(result.css, { headers: { "Content-Type": "text/css" } });
});
// Small, test-backed exceptions for saturated brand text/backgrounds whose
// generic role transform falls below 4.5:1. Media is never inverted here.
const siteCSS: Record<string, string> = {
  "news.ycombinator.com":
    '#hnmain td[bgcolor="#ff6600"] { background-color: #923900 !important; }',
  "twitch.tv":
    ".top-nav .navigation-link.active p { color: #c4b5fd !important; }",
  "news.google.com": "h3.aqvwYd { color: #c4b5fd !important; }",
  "geogebra.org":
    ".GeoGebraHeader .materialTextButton.signIn { color: #c4b5fd !important; }",
};
const nativeLocks: { node: HTMLMetaElement; marker: Comment }[] = [];
function restoreNativeLocks() {
  for (const { node, marker } of nativeLocks) marker.replaceWith(node);
  nativeLocks.length = 0;
}
window.__taylrTheme = {
  setEnabled(enabled) {
    if (!enabled || matchMedia("(forced-colors: active)").matches) {
      if (isEnabled()) {
        disable();
        document.documentElement.removeAttribute("data-taylr-theme");
      }
      restoreNativeLocks();
      return enabled ? "forced-colors" : "off";
    }
    // Do not take ownership of another installed Dark Reader instance.
    if (
      !isEnabled() &&
      (document.querySelector('.darkreader, meta[name="darkreader"]') ||
        (location.hostname !== "maps.apple.com" &&
          document.querySelector('meta[name="darkreader-lock"]')))
    )
      return "external";
    if (!isEnabled()) {
      // Apple Maps opts out of generic engines. The user's explicit per-site
      // request takes priority; preserve the native metadata for Off/Pause.
      if (location.hostname === "maps.apple.com") {
        for (const node of document.querySelectorAll<HTMLMetaElement>(
          'meta[name="darkreader-lock"]',
        )) {
          const marker = document.createComment("Taylr native theme lock");
          node.replaceWith(marker);
          nativeLocks.push({ node, marker });
        }
      }
      try {
        enable(
          {
            darkSchemeBackgroundColor: "#181a1b",
            darkSchemeTextColor: "#e8e6e3",
          },
          {
            invert: [],
            ignoreCSSUrl: [],
            css: siteCSS[location.hostname.replace(/^www\./, "")] ?? "",
            ignoreInlineStyle: ["taylr-tools", "taylr-highlight"],
            ignoreImageAnalysis: ["*"],
            disableStyleSheetsProxy: true,
          },
        );
      } catch (cause) {
        try {
          disable();
        } catch {
          /* Preserve the original activation error. */
        }
        restoreNativeLocks();
        throw cause;
      }
    }
    document.documentElement.setAttribute("data-taylr-theme", "active");
    return "on";
  },
};
