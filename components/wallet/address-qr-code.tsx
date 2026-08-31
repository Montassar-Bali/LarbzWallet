"use client";

import { create } from "qrcode";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const QUIET_ZONE = 4;
const MODULE_RADIUS = 0.39;
const BACKGROUND = "#19191b";

type AddressQrCodeProps = {
  value: string;
  className?: string;
  children?: ReactNode;
};

function isFinderModule(row: number, column: number, size: number) {
  const top = row < 7;
  const left = column < 7;
  const right = column >= size - 7;
  const bottom = row >= size - 7;

  return (top && left) || (top && right) || (bottom && left);
}

function FinderMark({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="7" height="7" rx="1.05" fill="currentColor" />
      <rect x={x + 1} y={y + 1} width="5" height="5" rx="0.7" fill={BACKGROUND} />
      <rect x={x + 2} y={y + 2} width="3" height="3" rx="0.55" fill="currentColor" />
    </g>
  );
}

export function AddressQrCode({ value, className, children }: AddressQrCodeProps) {
  const source = value.trim();
  const qrCode = source
    ? create(source, { errorCorrectionLevel: "H" })
    : null;
  const moduleCount = qrCode?.modules.size ?? 21;
  const viewBoxSize = moduleCount + QUIET_ZONE * 2;
  const dots: ReactNode[] = [];

  if (qrCode) {
    for (let row = 0; row < moduleCount; row += 1) {
      for (let column = 0; column < moduleCount; column += 1) {
        if (!qrCode.modules.get(row, column) || isFinderModule(row, column, moduleCount)) continue;

        dots.push(
          <circle
            key={`${row}-${column}`}
            cx={QUIET_ZONE + column + 0.5}
            cy={QUIET_ZONE + row + 0.5}
            r={MODULE_RADIUS}
            fill="currentColor"
          />,
        );
      }
    }
  }

  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-[1.25rem] bg-[#19191b] text-white",
        className,
      )}
    >
      <svg
        role="img"
        aria-label={source ? "Wallet address QR code" : "Wallet address QR code unavailable"}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="block h-full w-full"
        shapeRendering="geometricPrecision"
      >
        <rect width={viewBoxSize} height={viewBoxSize} rx="1.8" fill={BACKGROUND} />
        {qrCode ? (
          <>
            {dots}
            <FinderMark x={QUIET_ZONE} y={QUIET_ZONE} />
            <FinderMark x={QUIET_ZONE + moduleCount - 7} y={QUIET_ZONE} />
            <FinderMark x={QUIET_ZONE} y={QUIET_ZONE + moduleCount - 7} />
          </>
        ) : null}
      </svg>
      {children ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 grid h-[19%] w-[19%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[28%] bg-[#19191b] p-[2.5%] [&>*]:max-h-full [&>*]:max-w-full"
        >
          {children}
        </span>
      ) : null}
    </div>
  );
}
