export interface ComponentPreview {
  dataUrl: string;
  width: number;
  height: number;
  partial: boolean;
}
export interface HideRule {
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
}
export type Request =
  | { type: "get" | "restore"; origin: string }
  | {
      type: "add";
      origin: string;
      selector: string;
      label: string;
      preview?: ComponentPreview;
    }
  | { type: "remove"; origin: string; id: string };
export type Response =
  | { profile: SiteProfile; createdRuleId?: string; error?: never }
  | { error: string; profile?: never };
export const storageArea = () =>
  chrome.extension.inIncognitoContext ? "session" : "local";
export const storageKey = (origin: string) =>
  `${storageArea() === "session" ? "private-site" : "site"}:${origin}`;
export async function requestResult(message: Request) {
  const result: Response = await chrome.runtime.sendMessage(message);
  if (!result || result.error)
    throw new Error(
      result?.error ||
        "Taylr could not connect. Reload the page and try again.",
    );
  return result as { profile: SiteProfile; createdRuleId?: string };
}

export async function request(message: Request): Promise<SiteProfile> {
  return (await requestResult(message)).profile;
}
