import type { EditState } from "./element-editor";
import type { SiteProfile } from "./model";

export type ThemeStatus =
  "off" | "on" | "applying" | "forced-colors" | "external" | "error";

export interface InspectorState {
  open: boolean;
  mode: "hide" | "edit";
  editor: EditState | null;
  editorDirty: boolean;
  picking: boolean;
  busy: boolean;
  themeStatus: ThemeStatus;
  profile: SiteProfile;
  canUndo: boolean;
  hasHidden: boolean;
  selection: { label: string; parent: boolean; child: boolean } | null;
  status: string;
  error: boolean;
  focusSerial: number;
}
export interface Inspector {
  getSnapshot(this: void): InspectorState;
  subscribe(this: void, listener: () => void): () => void;
  setHost(host: HTMLElement): void;
  toggle(): void;
  close(): void;
  start(mode?: "hide" | "edit"): Promise<void>;
  editStyle(key: string, value: string): void;
  editText(value: string): void;
  resetStyle(key: string): void;
  saveEdit(): Promise<boolean>;
  pickAgain(): void;
  stop(): void;
  hide(): Promise<void>;
  undo(): Promise<void>;
  parent(): void;
  child(): void;
  restore(id?: string): Promise<void>;
  setDarkMode(enabled: boolean): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  openAccessSettings(): Promise<void>;
}
declare global {
  interface Window {
    __taylr?: Inspector;
    __taylrDock?: boolean;
  }
}
