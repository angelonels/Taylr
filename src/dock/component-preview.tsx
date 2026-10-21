import { useEffect, useRef, useState } from "react";
import type { HideRule } from "../model";

export function ComponentPreview({ rule }: { rule: HideRule }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!rule.preview) return;
    const bytes = Uint8Array.from(
      atob(rule.preview.dataUrl.split(",")[1]),
      (c) => c.charCodeAt(0),
    );
    // Canvas avoids third-party img-src policies blocking this local preview.
    void createImageBitmap(new Blob([bytes], { type: "image/webp" }))
      .then((bitmap) => {
        if (!cancelled && canvas.current) {
          canvas.current.getContext("2d")?.drawImage(bitmap, 0, 0);
          setReady(true);
        }
        bitmap.close();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rule.preview]);
  return (
    <div className="component-preview" data-ready={ready}>
      {rule.preview && (
        <canvas
          ref={canvas}
          width={rule.preview.width}
          height={rule.preview.height}
          role="img"
          aria-label={`Preview of ${rule.label}`}
          hidden={!ready}
        />
      )}
      {!ready && <span>Preview unavailable</span>}
      {ready && rule.preview?.partial && <small>Visible area</small>}
    </div>
  );
}
