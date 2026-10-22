/// <reference types="vite/client" />

// The package's public declaration uses CommonJS export assignment, whereas the
// bundled browser entry is ESM. Keep the small embedded API boundary explicit.
declare module "darkreader/darkreader.mjs" {
  export function enable(
    theme: { darkSchemeBackgroundColor: string; darkSchemeTextColor: string },
    fixes: {
      invert: string[];
      css: string;
      ignoreInlineStyle: string[];
      ignoreImageAnalysis: string[];
      disableStyleSheetsProxy: boolean;
      ignoreCSSUrl: string[];
    },
  ): void;
  export function disable(): void;
  export function isEnabled(): boolean;
  export function setFetchMethod(
    fetch: (url: string) => Promise<Response>,
  ): void;
}
