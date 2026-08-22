"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type TiltCardProps = {
  children: ReactNode;
  className?: string;
  tiltDeg?: number;
  glare?: boolean;
};

export function TiltCard({ children, className, tiltDeg = 3, glare = true }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("");
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);

  const isTouchDevice = typeof window !== "undefined" && "ontouchstart" in window;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isTouchDevice || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateX = (0.5 - y) * tiltDeg * 2;
      const rotateY = (x - 0.5) * tiltDeg * 2;
      setTransform(`perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);
      setGlarePos({ x: x * 100, y: y * 100 });
    },
    [tiltDeg, isTouchDevice],
  );

  const handleMouseLeave = useCallback(() => {
    setTransform("");
    setIsHovering(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!isTouchDevice) setIsHovering(true);
  }, [isTouchDevice]);

  return (
    <div
      ref={ref}
      className={cn("relative transition-transform duration-300 ease-out", className)}
      style={{ transform: transform || "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
    >
      {children}
      {glare && isHovering && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-20 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.12), transparent 60%)`,
          }}
        />
      )}
    </div>
  );
}
