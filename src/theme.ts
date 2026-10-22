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
window.__taylrTheme = {
  setEnabled(enabled) {
    if (!enabled || matchMedia("(forced-colors: active)").matches) {
      if (isEnabled()) disable();
      return enabled ? "forced-colors" : "off";
    }
    // Do not take ownership of another installed Dark Reader instance.
    if (!isEnabled() && document.querySelector(".darkreader"))
      return "external";
    if (!isEnabled())
      enable(
        {
          darkSchemeBackgroundColor: "#181a1b",
          darkSchemeTextColor: "#e8e6e3",
        },
        {
          invert: [],
          ignoreCSSUrl: [],
          css: "",
          ignoreInlineStyle: ["taylr-tools", "taylr-highlight"],
          ignoreImageAnalysis: ["*"],
          disableStyleSheetsProxy: true,
        },
      );
    return "on";
  },
};
