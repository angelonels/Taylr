import { storageArea, storageKey, type SiteProfile } from "../model";

// Pictures are disposable; a saved action has priority over every preview in
// the same storage area. The background's single writer owns this whole retry.
export async function storeProfile(
  key: string,
  profile: SiteProfile,
  createdRuleId?: string,
) {
  const area = chrome.storage[storageArea()];
  try {
    await area.set({ [key]: profile });
    return;
  } catch (initialError) {
    let error = initialError;
    const added = profile.rules.find((rule) => rule.id === createdRuleId);
    if (added?.preview) {
      delete added.preview;
      try {
        await area.set({ [key]: profile });
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    // Permission or I/O failures must not discard unrelated pictures.
    if (!/quota/i.test(error instanceof Error ? error.message : String(error)))
      throw error;
  }
  const stored = (await area.get(null)) as Record<string, SiteProfile>;
  const patch: Record<string, SiteProfile> = {};
  for (const [storedKey, value] of Object.entries(stored)) {
    if (
      storedKey === key ||
      value?.version !== 1 ||
      typeof value.origin !== "string" ||
      storageKey(value.origin) !== storedKey ||
      !Array.isArray(value.rules)
    )
      continue;
    if (!value.rules.some((rule) => rule?.preview)) continue;
    patch[storedKey] = {
      ...value,
      rules: value.rules.map(({ preview: _preview, ...rule }) => rule),
    };
  }
  for (const rule of profile.rules) delete rule.preview;
  // Commit eviction and the action together. A failed quota recovery must not
  // discard pictures belonging to an otherwise unchanged site profile.
  await area.set({ ...patch, [key]: profile });
}
