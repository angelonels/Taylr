export interface ComponentPreview {
  dataUrl: string;
  width: number;
  height: number;
  partial: boolean;
  pixelRatio?: number;
}
export interface ComponentSummary {
  kind: string;
  text: string;
  width: number;
  height: number;
}
export interface HideRule {
  summary?: ComponentSummary;
  preview?: ComponentPreview;
  id: string;
  selector: string;
  label: string;
  createdAt: number;
}
export interface SiteProfile {
  version: 1;
  origin: string;
  rules: HideRule[];
  paused?: boolean;
  darkMode?: boolean;
}
export type Request =
  | { type: "get" | "restore"; origin: string }
  | { type: "set-dark-mode"; origin: string; darkMode: boolean }
  | { type: "set-paused"; origin: string; paused: boolean }
  | {
      type: "add";
      origin: string;
      selector: string;
      label: string;
      preview?: ComponentPreview;
      summary?: ComponentSummary;
    }
  | { type: "remove"; origin: string; id: string };
export type Response =
  | { profile: SiteProfile; createdRuleId?: string; error?: never }
  | { error: string; profile?: never };
export const storageArea = () =>
  chrome.extension.inIncognitoContext ? "session" : "local";
export const storageKey = (origin: string) =>
  `${storageArea() === "session" ? "private-site" : "site"}:${origin}`;
// A loaded unpacked worker can predate the files now injected into a page.
// Refreshing the page cannot teach that worker the new message vocabulary.
export const extensionReloadMessage =
  "Reload Taylr in Chrome’s extension settings, then reload this page.";
export async function requestResult(message: Request) {
  const result: Response = await chrome.runtime.sendMessage(message);
  if (!result || result.error)
    throw new Error(result?.error || extensionReloadMessage);
  return result as { profile: SiteProfile; createdRuleId?: string };
}

export async function request(message: Request): Promise<SiteProfile> {
  return (await requestResult(message)).profile;
}
