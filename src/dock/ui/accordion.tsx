// Adapted from UIArc Accordion, MIT © 2026 Elia Kuratli. See THIRD_PARTY_NOTICES.md.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { motion, useReducedMotion } from "motion/react";

export function AccordionSection({
  name,
  title,
  children,
  instant,
  defaultOpen = true,
  openRequest = 0,
  focusId,
}: {
  name: string;
  title: ReactNode;
  children: ReactNode;
  instant: boolean;
  defaultOpen?: boolean;
  openRequest?: number;
  focusId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [seenRequest, setSeenRequest] = useState(openRequest);
  if (seenRequest !== openRequest) {
    setSeenRequest(openRequest);
    if (openRequest) setOpen(true);
  }
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (!openRequest) return;
    const frame = requestAnimationFrame(() => {
      const input = focusId
        ? root.current?.querySelector<HTMLElement>(`#${focusId}`)
        : null;
      input?.focus();
      (input?.closest(".property") ?? input)?.scrollIntoView({
        block: "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest, focusId]);
  return (
    <AccordionPrimitive.Root
      ref={root}
      type="single"
      collapsible
      value={open ? "open" : ""}
      onValueChange={(value) => setOpen(!!value)}
      className="edit-group"
      data-group={name}
    >
      <AccordionPrimitive.Item value="open">
        <AccordionPrimitive.Header className="m-0">
          <AccordionPrimitive.Trigger
            className="edit-group-trigger"
            aria-label={name}
          >
            {title}
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content forceMount asChild>
          <motion.div
            className="arc-accordion-content"
            inert={!open}
            initial={false}
            animate={{
              opacity: open ? 1 : 0,
            }}
            style={{
              height: open ? "auto" : 0,
              visibility: open ? "visible" : "hidden",
              overflow: open ? "visible" : "hidden",
            }}
            transition={{
              duration: !open || reduced || instant ? 0 : 0.16,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <div>{children}</div>
          </motion.div>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
}
