// Adapted from UIArc ActionButton, MIT © 2026 Elia Kuratli. See THIRD_PARTY_NOTICES.md.
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "./button";

/** Fixed-width commit area avoids label-width reflow. Pending retains keyboard focus. */
export function ActionButton({
  label,
  onAction,
  disabled,
  dirty,
  instant,
  ...props
}: Omit<ComponentProps<"button">, "onClick" | "children"> & {
  label: string;
  dirty: boolean;
  instant: boolean;
  onAction: () => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<"idle" | "pending" | "success">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const reduced = useReducedMotion() || instant;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function run() {
    if (running.current || disabled) return;
    running.current = true;
    if (timer.current) clearTimeout(timer.current);
    setPhase("pending");
    try {
      const saved = await onAction();
      setPhase(saved ? "success" : "idle");
      if (saved) timer.current = setTimeout(() => setPhase("idle"), 2400);
    } finally {
      running.current = false;
    }
  }
  if (phase === "success" && dirty) setPhase("idle");
  const pending = phase === "pending";
  const text = pending ? "Saving" : phase === "success" ? "Saved" : label;
  return (
    <Button
      {...props}
      variant="primary"
      aria-disabled={pending || disabled}
      aria-busy={pending}
      data-state={phase}
      onClick={() => void run()}
    >
      <span className="arc-action-content" aria-hidden="true">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={text}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.12 }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
        <span className="arc-action-icon">
          {pending ? (
            <span className="arc-spinner" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d={
                  phase === "success"
                    ? "m5 12 4 4L19 6"
                    : "M5 12h14m-5-5 5 5-5 5"
                }
              />
            </svg>
          )}
        </span>
      </span>
      <span className="sr-only">{text}</span>
      <output className="sr-only">{phase === "idle" ? "" : text}</output>
    </Button>
  );
}
