import type { SiteProfile } from "./model";

export interface InspectorState {
  open: boolean;
  picking: boolean;
  busy: boolean;
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
  start(): Promise<void>;
  stop(): void;
  hide(): Promise<void>;
  undo(): Promise<void>;
  parent(): void;
  child(): void;
  restore(id?: string): Promise<void>;
}
declare global {
  interface Window {
    __taylr?: Inspector;
    __taylrDock?: boolean;
  }
}
