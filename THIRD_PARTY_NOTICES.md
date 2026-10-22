# Third-party notices

Dark mode embeds [Dark Reader](https://github.com/darkreader/darkreader), version 4.9.133, under the MIT license. The extension package includes its complete license at `licenses/darkreader.txt`.

The build scopes the embedded API's Chrome message bus to the vendor module, completes its shadow-root inversion-style cleanup on disable, and prevents destroyed stylesheet managers from rendering through delayed callbacks. These adaptations are guarded against upstream source changes. The engine is bundled locally; Taylr does not download theme code or site fixes at runtime.
