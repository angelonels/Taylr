// Adapted from UIArc Input/Textarea, MIT © 2026 Elia Kuratli. See THIRD_PARTY_NOTICES.md.
import { useId, type ComponentProps } from "react";

/** Keep native controls: no portal can escape the extension's isolated shadow tree. */
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`arc-input ${className}`} />;
}
export function Textarea({
  label,
  id,
  className = "",
  ...props
}: ComponentProps<"textarea"> & { label: string }) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <div className="text-field">
      <label htmlFor={controlId}>{label}</label>
      <textarea
        {...props}
        id={controlId}
        className={`arc-input ${className}`}
      />
    </div>
  );
}
