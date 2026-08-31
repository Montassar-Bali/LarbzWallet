"use client";

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

export type SwipeDismissOptions = {
  /** Pixels the user must drag before the panel is dismissed. Default: 120 */
  threshold?: number;
  /** Called when the swipe meets the threshold. */
  onDismiss: () => void;
};

export type SwipeDismissHandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** The handle is gesture-only; every panel must retain an accessible close/back control. */
  "aria-hidden": true;
  "data-swipe-dismiss-handle": "true";
  className: string;
  style: CSSProperties;
};

export type SwipeDismissResult = {
  /** Current vertical offset in pixels. */
  dismissOffset: number;
  /** Whether the user is actively dragging. */
  isDragging: boolean;
  /** Style object to apply to the panel container (`transform`, `opacity`, `transition`). */
  containerStyle: CSSProperties;
  /** Props to spread on the drag-handle element. */
  handleProps: SwipeDismissHandleProps;
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
  const dismissThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 120;
  const [dismissOffset, setDismissOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const activePointerId = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const currentOffset = useRef(0);

  const resetDrag = useCallback(() => {
    activePointerId.current = null;
    dragStartY.current = null;
    currentOffset.current = 0;
    setIsDragging(false);
    setDismissOffset(0);
  }, []);

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || activePointerId.current !== event.pointerId || dragStartY.current === null) return;

      const distance = Math.max(0, event.clientY - dragStartY.current);
      activePointerId.current = null;
      dragStartY.current = null;
      currentOffset.current = distance;
      setIsDragging(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (distance >= dismissThreshold) {
        setDismissOffset(distance);
        onDismiss();
        return;
      }

      currentOffset.current = 0;
      setDismissOffset(0);
    },
    [dismissThreshold, onDismiss],
  );

  const containerStyle: CSSProperties = {
    transform: `translateY(${dismissOffset}px)`,
    opacity: Math.max(0.72, 1 - dismissOffset / 900),
    transition: isDragging ? "none" : "transform 260ms cubic-bezier(.22,1,.36,1), opacity 260ms ease",
    willChange: isDragging ? "transform, opacity" : undefined,
  };

  const handleProps: SwipeDismissResult["handleProps"] = {
    onPointerDown: (event) => {
      if (!event.isPrimary || event.button !== 0 || activePointerId.current !== null) return;

      activePointerId.current = event.pointerId;
      dragStartY.current = event.clientY;
      currentOffset.current = 0;
      setDismissOffset(0);
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      if (!event.isPrimary || activePointerId.current !== event.pointerId || dragStartY.current === null) return;

      const distance = Math.max(0, event.clientY - dragStartY.current);
      if (distance === currentOffset.current) return;

      currentOffset.current = distance;
      setDismissOffset(distance);
    },
    onPointerUp: finishDrag,
    onPointerCancel: (event) => {
      if (activePointerId.current !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      resetDrag();
    },
    onLostPointerCapture: (event) => {
      if (activePointerId.current !== event.pointerId) return;
      resetDrag();
    },
    "aria-hidden": true,
    "data-swipe-dismiss-handle": "true",
    className: "mx-auto flex h-9 w-28 touch-none cursor-grab items-start justify-center pt-1 active:cursor-grabbing",
    style: { touchAction: "none" },
  };

  return { dismissOffset, isDragging, containerStyle, handleProps };
}
