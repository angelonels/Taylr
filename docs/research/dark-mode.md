# Dark-mode engine decision

The supplied “Research Dark Mode Extensions” conversation informed the goals: readable foreground/background pairs, restrained dark surfaces, retained semantic hues, original media, reversibility, accessibility preferences and bounded work. Its proposed custom semantic color graph is a research direction, not a requirement to build a new browser stylesheet compiler in this feature.

Taylr embeds the MIT-licensed Dark Reader 4.9.133 dynamic engine. The UI-library skill's next-themes recommendation handles an application's own theme; it cannot recolor arbitrary websites. The dynamic engine already handles CSS variables, important declarations, DOM/style updates and open shadow roots. We disable image analysis and stylesheet proxying, keep media pixels native, and test the resulting behavior in disposable Chromium.

## Integration boundary

- `theme.js` is an independent, locally bundled isolated-world script, loaded only for an active saved request. No remote script is fetched.
- The embedded API's native Chrome wrappers do not return the native messaging Promise. The build gives the vendor module a lexical private bus so Taylr's IPC remains intact. The fixed dependency version and source guards make upgrades explicit.
- E2E uncovered two vendor lifecycle defects. Off left `.darkreader--invert` styles in open shadow roots; a delayed manager callback could recreate a `.darkreader--sync` stylesheet after destruction on Google Maps. Guarded build adaptations remove the former and prevent the latter. Production dependencies are not edited in `node_modules`.
- Cross-origin stylesheet access goes through a bounded, credential-free extension fetch. The engine still rejects private/local cross-origin destinations. Failure does not block Hide. Some authenticated CSS or unusual resource responses may remain native.
- Test-backed local CSS exceptions retain orange or purple branding while restoring text contrast. The exceptions are bundled and scoped by hostname; they are not a remote configuration service.
- An explicit request on Apple Maps temporarily suspends its native dynamic-theme opt-out, then restores the original metadata on Off. Other installed theme engines retain ownership.

## Deliberate limits

Taylr does not claim to make every pixel dark or to certify a website's accessibility. Photographs, background images, video, canvas/WebGL scenes and iframe contents can remain bright. Closed shadow roots and later CSSOM-only changes without observable DOM/style updates may keep native styling. Disabling the invasive stylesheet proxy avoids changing host JavaScript APIs. Refresh existing tabs after an explicit development extension reload.

Public-site checks use at most 40 visible text samples on uniform, opaque backgrounds. Images, gradients, opacity and blend effects are unsupported contrast samples. After a stable color window, the check rejects a sampled text pair falling below 4.45:1 when the original met 4.5:1 (a 0.05 rounding tolerance); it does not repair every existing low-contrast choice. Media-filter checks compare surviving original nodes; restoration compares surviving unchanged content and records exclusions caused by host hydration. Local fixtures provide the stronger pixel, keyboard, forced-colors, rapid-toggle, error and cross-tab contracts.

## Primary sources

- [Dark Reader repository and MIT license](https://github.com/darkreader/darkreader)
- [Embedded API entry](https://github.com/darkreader/darkreader/blob/main/src/api/index.ts)
- [Embedded Chrome message wrapper](https://github.com/darkreader/darkreader/blob/main/src/api/chrome.ts)
- [Embedded fetch hook](https://github.com/darkreader/darkreader/blob/main/src/api/fetch.ts)
- [Upstream dynamic site fixes](https://github.com/darkreader/darkreader/blob/main/src/config/dynamic-theme-fixes.config)

The repository pins the shipped package; the upstream links explain the API but can change independently. The build guards and browser evidence govern any upgrade.
