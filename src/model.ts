import type { StylePatch } from "./edit-properties";
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
export interface Rule {
  kind?: "edit";
  styles?: StylePatch;
  text?: string;
  revision?: string;
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
  rules: Rule[];
  paused?: boolean;
  darkMode?: boolean;
}
export type Request =
  | {
      type: "edit";
      origin: string;
      selector: string;
      label: string;
      styles: StylePatch;
      text?: string;
    }
  | {
      type: "undo-edit";
      origin: string;
      id: string;
      revision: string;
      before?: Rule;
    }
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
  | {
      profile: SiteProfile;
      createdRuleId?: string;
      savedRule?: Rule;
      previousRule?: Rule;
      error?: never;
    }
  | { error: string; code?: "revision-conflict"; profile?: never };
export class RequestError extends Error {
  constructor(
    message: string,
    readonly code?: "revision-conflict",
  ) {
    super(message);
  }
}
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
    throw new RequestError(
      result?.error || extensionReloadMessage,
      result?.error ? result.code : undefined,
    );
  return result as {
    profile: SiteProfile;
    createdRuleId?: string;
    savedRule?: Rule;
    previousRule?: Rule;
  };
}

export async function request(message: Request): Promise<SiteProfile> {
  return (await requestResult(message)).profile;
}
