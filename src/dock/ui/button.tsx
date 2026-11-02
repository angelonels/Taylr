// Adapted from UIArc Button, MIT © 2026 Elia Kuratli. See THIRD_PARTY_NOTICES.md.
import type { ComponentProps, ReactNode } from "react";

/** Native semantics; the dock owns pointer-only press motion and keyboard focus. */
export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`arc-button arc-${variant} ${className}`}
    >
      {children}
    </button>
  );
}
