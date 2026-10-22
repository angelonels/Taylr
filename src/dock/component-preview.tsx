import { useId, useEffect, useRef, useState, type CSSProperties } from "react";
import type { HideRule } from "../model";

export function ComponentPreview({ rule }: { rule: HideRule }) {
  const imageId = useId();
  const [expanded, setExpanded] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [decoded, setDecoded] = useState<string>();
  const preview = rule.preview;
  const dataUrl = preview?.dataUrl;
  const ready = !!dataUrl && decoded === dataUrl;
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    if (!dataUrl) return;
    let cancelled = false;
    // Decode only when image bytes change, not on unrelated profile broadcasts.
    void Promise.resolve()
      .then(() => {
        const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) =>
          c.charCodeAt(0),
        );
        return createImageBitmap(new Blob([bytes], { type: "image/webp" }));
      })
      .then((bitmap) => {
        try {
          if (!cancelled && canvas.current) {
            const context = canvas.current.getContext("2d");
            if (!context) throw new Error("Canvas unavailable");
            context.drawImage(bitmap, 0, 0);
            setDecoded(dataUrl);
          }
        } finally {
          bitmap.close();
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(dataUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);
  const summary = rule.summary;
  return (
    <div className="component-preview min-w-0" data-ready={ready}>
      {preview && failed !== preview.dataUrl ? (
        <div className="preview-disclosure group" data-expanded={expanded}>
          <button
            type="button"
            className="preview-toggle"
            aria-label={`Inspect ${rule.label}`}
            aria-expanded={expanded}
            aria-controls={imageId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] text-[#c0c2cf]">
              <span>
                {preview.partial ? "Visible area" : "Captured before hiding"}
              </span>
              <span className="text-[#e8e6df] group-data-[expanded=true]:hidden">
                Expand ↗
              </span>
              <span className="hidden text-[#e8e6df] group-data-[expanded=true]:inline">
                Collapse ↙
              </span>
            </span>
          </button>
          <div
            id={imageId}
            className="preview-image"
            data-ready={ready}
            tabIndex={expanded ? 0 : undefined}
            role={expanded ? "region" : undefined}
            aria-label={expanded ? "Captured component" : undefined}
          >
            <canvas
              ref={canvas}
              width={preview.width}
              height={preview.height}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Canvas is intentional for host CSP isolation.
              role="img"
              aria-label={`Preview of ${rule.label}`}
              hidden={!ready}
              style={
                {
                  "--preview-width": `${preview.width / (preview.pixelRatio ?? 1)}px`,
                } as CSSProperties
              }
            />
            {!ready && (
              <output className="px-4 py-8 text-xs text-[#c0c2cf]">
                Loading preview…
              </output>
            )}
          </div>

          {expanded && (
            <p className="m-0 border-t border-white/8 px-3 py-2 text-[10px] text-[#c0c2cf]">
              Historical preview
              {summary ? ` · ${summary.width} × ${summary.height}` : ""}
              {preview.partial
                ? " · Only the visible portion was captured"
                : ""}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-[14px] border border-white/8 bg-white/4 p-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-[#c0c2cf]">
            <span>Text preview</span>
            <span>
              {summary?.kind ?? "Section"}
              {summary ? ` · ${summary.width} × ${summary.height}` : ""}
            </span>
          </div>
          <p className="m-0 line-clamp-3 text-[13px] leading-[1.6] text-[#f0efea]">
            {summary?.text || rule.label}
          </p>
        </div>
      )}
    </div>
  );
}
