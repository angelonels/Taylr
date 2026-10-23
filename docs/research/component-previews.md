# Preview capture rationale

A preview must identify the actual selected component, preserve useful detail and fail without blocking Hide.

Chrome’s `captureVisibleTab` captures browser-rendered pixels, including canvas and video, and allows at most two calls per second. It requires activeTab or the documented broad capture grant; an exact-origin test grant alone does not establish capture permission. [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)

Satori renders application-supplied trees through its own layout engine. DOM-to-image libraries clone resources and styles, adding font, cross-origin and canvas failure modes. Neither reliably reproduces arbitrary third-party pages. [Satori limitations](https://github.com/vercel/satori), [html-to-image caveats](https://github.com/bubkoo/html-to-image)

Capture requests are queued at least 550ms apart. Bounded document preparation hides the dock only around native capture, and restores it afterwards. Active tab, URL, document, target connection, geometry, viewport and scroll must remain valid. Expired or cancelled requests cannot later hide the dock or commit an abandoned selection.

Only the visible component crop is encoded. Preserve source detail up to two source pixels per CSS pixel within 1024 × 768 pixels and approximately 256KiB. Adaptive WebP encoding handles dense content; quota recovery drops the optional image. The full screenshot remains transient. Private crops use session storage.

Text fallback uses bounded rendered text and dimensions without reading input values or fetching assets. Canvas preview display avoids a site’s restrictive img-src policy. Labels distinguish historical pixels, partial crops and text; expanded image inspection supports keyboard panning.

Acceptance checks delayed and rapid captures, independent pixel samples, clipping, native resolution, high-entropy imagery, fractional density, geometry invalidation, CSP, inactive documents, storage pressure and paused frames. A visible image alone does not establish correct capture. See [testing](../testing.md).
