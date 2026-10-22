import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  animate,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(min, max), Math.max(min, value));
export function usePosition(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0),
    y = useMotionValue(0);
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0)`;
  const reduced = useReducedMotion();
  const [edge, setEdge] = useState<"top" | "bottom">("bottom");
  const edgeRef = useRef<"top" | "bottom">("bottom");
  const [dragging, setDragging] = useState(false);
  const initialized = useRef(false);
  const height = useRef(0);
  const animation = useRef<AnimationPlaybackControls[]>([]);
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);
  const bounds = () => {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0,
      top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth,
      viewHeight = viewport?.height ?? innerHeight;
    const box = ref.current?.getBoundingClientRect();
    return {
      left: left + 16,
      top: top + 16,
      right: left + width - (box?.width ?? 0) - 16,
      bottom: top + viewHeight - (box?.height ?? 0) - 16,
      width,
      height: viewHeight,
    };
  };
  const cancelAnimation = () => {
    animation.current.forEach((control) => control.stop());
    animation.current = [];
  };
  function place(
    nextX: number,
    nextY: number,
    velocityX = 0,
    velocityY = 0,
    spring = false,
  ) {
    cancelAnimation();
    const b = bounds();
    nextX = clamp(nextX, b.left, b.right);
    nextY = clamp(nextY, b.top, b.bottom);
    const nextEdge =
      nextY + (ref.current?.getBoundingClientRect().height ?? 0) / 2 >
      b.top + b.height / 2
        ? "bottom"
        : "top";
    edgeRef.current = nextEdge;
    setEdge(nextEdge);
    if (spring && !reduced) {
      animation.current = [
        animate(x, nextX, {
          type: "spring",
          bounce: 0,
          duration: 0.4,
          velocity: velocityX,
        }),
        animate(y, nextY, {
          type: "spring",
          bounce: 0,
          duration: 0.4,
          velocity: velocityY,
        }),
      ];
    } else {
      x.set(nextX);
      y.set(nextY);
    }
  }
  useEffect(() => {
    if (!open || !ref.current) return;
    const element = ref.current;
    const fit = () => {
      const viewport = window.visualViewport;
      element.style.maxWidth = `${Math.max(240, (viewport?.width ?? innerWidth) - 32)}px`;
      const box = element.getBoundingClientRect(),
        b = bounds();
      if (!initialized.current) {
        x.set((b.width - box.width) / 2 + (viewport?.offsetLeft ?? 0));
        y.set(Math.max(b.top, b.bottom));
        initialized.current = true;
      } else {
        if (edgeRef.current === "bottom" && height.current)
          y.set(y.get() - (box.height - height.current));
        cancelAnimation();
        x.set(clamp(x.get(), b.left, b.right));
        y.set(clamp(y.get(), b.top, b.bottom));
      }
      height.current = box.height;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
      cancelAnimation();
    };
  }, [open, x, y]);
  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.nativeEvent.isTrusted || event.button !== 0) return;
    event.preventDefault();
    cancelAnimation();
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: x.get(),
      y: y.get(),
      moved: false,
    };
  }
  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.startX,
      dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    current.moved = true;
    moved.current = true;
    setDragging(true);
    const b = bounds();
    x.set(clamp(current.x + dx, b.left, b.right));
    y.set(clamp(current.y + dy, b.top, b.bottom));
  }
  function pointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.moved) {
      const vx = event.type === "pointercancel" ? 0 : x.getVelocity(),
        vy = event.type === "pointercancel" ? 0 : y.getVelocity();
      // Apple's deceleration projection with the snappier .99 rate, bounded to the viewport.
      const project = (v: number) => ((v / 1000) * 0.99) / (1 - 0.99);
      place(x.get() + project(vx), y.get() + project(vy), vx, vy, true);
    }
  }
  function flip(event: ReactMouseEvent<HTMLButtonElement>) {
    if (moved.current) {
      moved.current = false;
      return;
    }
    const b = bounds();
    place(
      x.get(),
      edge === "bottom" ? b.top : b.bottom,
      0,
      0,
      event.detail !== 0,
    );
  }
  function keyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!event.nativeEvent.isTrusted) return;
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(
        event.key,
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const b = bounds();
    if (event.key === "Home")
      place((b.width - (ref.current?.offsetWidth ?? 0)) / 2, b.bottom);
    else
      place(
        x.get() +
          (event.key === "ArrowLeft"
            ? -24
            : event.key === "ArrowRight"
              ? 24
              : 0),
        y.get() +
          (event.key === "ArrowUp" ? -24 : event.key === "ArrowDown" ? 24 : 0),
      );
  }
  return {
    ref,
    transform,
    edge,
    dragging,
    grip: {
      onPointerDown: pointerDown,
      onPointerMove: pointerMove,
      onPointerUp: pointerEnd,
      onPointerCancel: pointerEnd,
      onLostPointerCapture: () => {
        gesture.current = null;
        setDragging(false);
      },
      onClick: flip,
      onKeyDown: keyDown,
    },
  };
}
