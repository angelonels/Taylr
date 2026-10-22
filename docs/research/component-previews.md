# Component recognition after Hide

Research and probes: 2026-10-22.

The job is to recognize a previously hidden component and restore the right rule. Pixel presence alone does not establish that a preview is correct. It must depict the selected component at the selected geometry, remain useful on dense displays, and fail without blocking Hide.

## Capture choice

Chrome's native `captureVisibleTab` captures browser-rendered pixels, including canvas and video. It requires `activeTab` or `<all_urls>`; a persistent grant for one origin alone does not authorize capture. Its documented limit is two calls per second. The production extension uses the user's toolbar invocation for activeTab; only isolated pixel tests use broad temporary grants. [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)

Satori renders an application-supplied tree through its own supported CSS/layout subset. It cannot take an arbitrary website DOM and preserve all browser rendering behavior. It is appropriate for designed export cards, not a replacement for this capture pipeline. [Satori limitations](https://github.com/vercel/satori/blob/main/README.md)

DOM-to-image libraries clone nodes, embed resources and styles, and render a foreignObject SVG through canvas. External assets, tainted canvases, fonts and large data URIs introduce additional failure modes on third-party sites. Adding one would not establish universal screenshots. [html-to-image implementation and caveats](https://github.com/bubkoo/html-to-image)

Debugger screenshots and continuous tab recording would add intrusive permissions or a continuing capture lifecycle for a small historical thumbnail. Neither is necessary here.

## Confirmed failures and decisions

Failure-first E2E probes confirmed the former 350ms deadline discarded a successful 500ms capture, a rejecting quota throttle lost rapid Hide/Undo/Hide captures, and the 320px cap discarded useful source pixels. Further probes found high-entropy canvas imagery could exceed the image budget despite a successful native capture.

Queue captures at least 550ms apart. Keep the dock visible while waiting; a document-scoped prepare/finish handshake removes Taylr's chrome only around native capture. Bound both the optional request and worker preparation so paused animation frames cannot stall the queue. Keep the target's connection, bounds, viewport, scroll and zoom unchanged before accepting pixels. Check the active tab, URL and originating document around capture. A queued request that expires cannot later hide the interface. Cancelling while capture is pending also abandons the Hide before its storage mutation; this was reproduced as a late hide after Escape before the cancellation guard was added.

Preserve source detail up to 2 source pixels per CSS pixel and 1024 × 768 encoded pixels, without inventing pixels through upscaling. Encode WebP at high quality first, then reduce quality and, for unusually detailed content, dimensions within a bounded approximately 256KiB image budget. The full viewport screenshot stays transient; only the selected visible crop is stored. Quota recovery drops only the new optional image.

A crisp text preview is an honest fallback, not a simulated screenshot. It retains bounded context and component dimensions with the rule. It never reads input values or fetches assets. Legacy rules still render from their label. The UI distinguishes a historical image, a partial visible-area image, and a text preview; decoding is a loading state, not a failure flash. An explicit disclosure button expands image inspection without a modal or another toolbar mode; the expanded image region supports keyboard panning.

The regression suite checks delayed captures, rapid actions, independent red/blue pixel samples, clipping, source resolution, high-entropy imagery, geometry invalidation, hostile img-src CSP, inactive documents, storage pressure and paused frames. Permission automation remains a separate explicitly unresolved slice; test-only host grants do not prove a real activeTab gesture.

Final review probes additionally reproduced a frozen document-liveness request holding the shared queue, a fractional Retina crop rounding its stored density above the accepted maximum, and nonrendered HTML/SVG prefixes polluting recognition text. The liveness check now has its own 500ms deadline and stored density respects the supported bound. Text recognition uses rendered HTML text; SVG recognition excludes definitions and stylesheet text and prefers visible text or its accessible title. Independent browser regressions retain the failed and corrected evidence.
