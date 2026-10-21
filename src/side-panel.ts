import "./side-panel.css";
import { request, storageArea, storageKey, type SiteProfile } from "./model";
const hide = document.querySelector<HTMLButtonElement>("#hide")!;
const restore = document.querySelector<HTMLButtonElement>("#restore")!;
const status = document.querySelector<HTMLElement>("#status")!;
let tabId: number;
let origin: string;
let initialization = 0;
function update(profile: SiteProfile) {
  const count = profile.rules.length;
  document.querySelector("#count")!.textContent = count
    ? `${count} ${count === 1 ? "element" : "elements"} hidden`
    : "Nothing hidden yet";
  restore.disabled = !count;
  const list = document.querySelector("#rules")!;
  list.replaceChildren();
  for (const rule of profile.rules) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = rule.label;
    const button = document.createElement("button");
    button.textContent = "Restore";
    button.setAttribute("aria-label", `Restore ${rule.label}`);
    button.addEventListener("click", async () => {
      const targetOrigin = origin;
      const revision = initialization;
      button.disabled = true;
      try {
        const profile = await request({
          type: "remove",
          origin: targetOrigin,
          id: rule.id,
        });
        if (revision !== initialization || targetOrigin !== origin) return;
        update(profile);
        status.textContent = "Element restored.";
      } catch {
        if (revision !== initialization || targetOrigin !== origin) return;
        status.textContent = "Could not restore. Try again.";
        button.disabled = false;
      }
    });
    row.append(label, button);
    list.append(row);
  }
}
async function initialize() {
  const revision = ++initialization;
  hide.disabled = true;
  origin = "";
  restore.disabled = true;
  document.querySelector("#count")!.textContent = "Reading this site…";
  document.querySelector("#rules")!.replaceChildren();
  try {
    if (!chrome.tabs)
      throw new Error(
        "Build Taylr, then load the dist folder in Chrome to use Hide.",
      );
    const explicit = new URL(location.href).searchParams.get("tab");
    const tab = explicit
      ? await chrome.tabs.get(Number(explicit))
      : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url))
      throw new Error("Open a website, then open Taylr again.");
    if (revision !== initialization) return;
    tabId = tab.id;
    const url = new URL(tab.url);
    origin = url.origin;
    document.querySelector("#site")!.textContent = url.hostname;
    const profile = await request({ type: "get", origin });
    if (revision !== initialization) return;
    update(profile);
    hide.disabled = false;
    status.textContent = "Changes are saved for this site.";
  } catch (error) {
    if (revision !== initialization) return;
    document.querySelector("#count")!.textContent = "No site selected";
    document.querySelector("#site")!.textContent = "This page is protected";
    status.textContent =
      error instanceof Error
        ? error.message
        : "Reload this page and try again.";
  }
}
hide.addEventListener("click", async () => {
  const targetOrigin = origin;
  const targetTabId = tabId;
  const revision = initialization;
  hide.disabled = true;
  try {
    // The permission prompt belongs to the explicit user gesture, before any other await.
    const granted = await chrome.permissions.request({
      origins: [`${targetOrigin}/*`],
    });
    if (!granted)
      throw new Error("Allow access to this site to save hidden elements.");
    const registration = await chrome.runtime.sendMessage({
      type: "register",
      origin: targetOrigin,
    });
    if (registration?.error) throw new Error(registration.error);
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(targetTabId, { type: "start" });
    if (revision !== initialization || targetOrigin !== origin) return;
    if (!new URL(location.href).searchParams.has("tab"))
      status.textContent = "Click an element on the page. Escape to finish.";
  } catch (error) {
    if (revision !== initialization || targetOrigin !== origin) return;
    status.textContent =
      error instanceof Error
        ? error.message
        : "Taylr cannot edit this page. Try another website.";
  } finally {
    if (revision === initialization && targetOrigin === origin)
      hide.disabled = false;
  }
});
restore.addEventListener("click", async () => {
  const targetOrigin = origin;
  const revision = initialization;
  restore.disabled = true;
  try {
    const profile = await request({ type: "restore", origin: targetOrigin });
    if (revision !== initialization || targetOrigin !== origin) return;
    update(profile);
    status.textContent = "All elements restored on this site.";
  } catch {
    if (revision !== initialization || targetOrigin !== origin) return;
    status.textContent = "Could not restore. Try again.";
    restore.disabled = false;
  }
});
void initialize();

if (chrome.tabs) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (origin && area === storageArea() && changes[storageKey(origin)])
      update(changes[storageKey(origin)].newValue as SiteProfile);
  });
  if (!new URL(location.href).searchParams.has("tab")) {
    chrome.tabs.onActivated.addListener(() => void initialize());
    chrome.tabs.onUpdated.addListener((id, change) => {
      if (id === tabId && change.status === "complete") void initialize();
    });
  }
}
