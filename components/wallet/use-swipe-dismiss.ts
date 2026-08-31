"use client";

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

type SwipeDismissOptions = {
  /** Pixels the user must drag before the panel is dismissed. Default: 120 */
  threshold?: number;
  /** Called when the swipe exceeds the threshold. */
  onDismiss: () => void;
};

type SwipeDismissResult = {
  /** Current vertical offset in pixels. */
  dismissOffset: number;
  /** Whether the user is actively dragging. */
  isDragging: boolean;
  /** Style object to apply to the panel container (`transform`, `opacity`, `transition`). */
  containerStyle: CSSProperties;
  /** Props to spread on the drag-handle element. */
  handleProps: {
    onPointerDown: (event: ReactPointerEvent) => void;
    onPointerMove: (event: ReactPointerEvent) => void;
    onPointerUp: (event: ReactPointerEvent) => void;
    onPointerCancel: (event: ReactPointerEvent) => void;
    onClick: () => void;
    "aria-label": string;
    className: string;
    style: CSSProperties;
  };
};

/**
 * Hook that adds a swipe-down-to-dismiss gesture to an overlay panel.
 *
 * Usage:
 * ```tsx
 * const { containerStyle, handleProps } = useSwipeDismiss({ onDismiss: onClose });
 * return (
 *   <div style={containerStyle} className="...">
 *     <div {...handleProps}><span className="block h-1.5 w-20 rounded-full bg-[#363638]" /></div>
 *     ...content...
 *   </div>
 * );
 * ```
 */
export function useSwipeDismiss({ threshold = 120, onDismiss }: SwipeDismissOptions): SwipeDismissResult {
  const [dismissOffset, setDismissOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragMoved = useRef(false);

  const finishDrag = useCallback(
    (clientY: number) => {
      if (dragStartY.current === null) return;
      const distance = Math.max(0, clientY - dragStartY.current);
      dragStartY.current = null;
      setIsDragging(false);
      if (distance >= threshold) {
        /* Keep the offset so the panel slides off-screen with CSS transition */
        setDismissOffset(distance);
        onDismiss();
        return;
      }
      setDismissOffset(0);
    },
    [onDismiss, threshold],
  );

  const resetDrag = useCallback(() => {
    dragStartY.current = null;
    dragMoved.current = false;
    setIsDragging(false);
    setDismissOffset(0);
  }, []);

  const containerStyle: CSSProperties = {
    transform: `translateY(${dismissOffset}px)`,
    opacity: Math.max(0.72, 1 - dismissOffset / 900),
    transition: isDragging ? "none" : "transform 260ms cubic-bezier(.22,1,.36,1), opacity 260ms ease",
    willChange: isDragging ? "transform, opacity" : undefined,
  };

  const handleProps: SwipeDismissResult["handleProps"] = {
    onPointerDown: (event: ReactPointerEvent) => {
      dragStartY.current = event.clientY;
      dragMoved.current = false;
      setDismissOffset(0);
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      if (dragStartY.current === null) return;
      const distance = Math.max(0, event.clientY - dragStartY.current);
      if (distance > 8) dragMoved.current = true;
      setDismissOffset(distance);
    },
    onPointerUp: (event: ReactPointerEvent) => finishDrag(event.clientY),
    onPointerCancel: resetDrag,
    onClick: () => {
      /* If the user just tapped (didn't drag), treat as a dismiss */
      if (!dragMoved.current) onDismiss();
      dragMoved.current = false;
    },
    "aria-label": "Swipe down to close",
    className: "mx-auto flex h-9 w-28 touch-none cursor-grab items-start justify-center pt-1 active:cursor-grabbing",
    style: { touchAction: "none" },
  };

  return { dismissOffset, isDragging, containerStyle, handleProps };
}
