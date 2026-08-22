import { cn } from "@/lib/utils";

type IPhoneFrameProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Realistic iPhone 17 Pro Max frame using pure CSS.
 * Titanium-finish bezels, Dynamic Island, status bar, and home indicator.
 */
export function IPhoneFrame({ children, className }: IPhoneFrameProps) {
  return (
    <div className={cn("relative inline-block", className)}>
      {/* Outer titanium body */}
      <div
        className="relative overflow-hidden rounded-[3.2rem] p-[3px]"
        style={{
          background:
            "linear-gradient(145deg, #3a3a3e 0%, #2a2a2e 30%, #1a1a1e 60%, #2e2e32 100%)",
          boxShadow:
            "0 40px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Inner bezel + screen area */}
        <div className="relative overflow-hidden rounded-[2.95rem] bg-black">
          {/* Side button accents — left (silent/action + volume) */}
          <div
            className="absolute -left-[2px] top-[80px] z-20 h-[28px] w-[3px] rounded-l-sm"
            style={{ background: "linear-gradient(180deg, #3a3a3e, #2a2a2e)" }}
          />
          <div
            className="absolute -left-[2px] top-[124px] z-20 h-[44px] w-[3px] rounded-l-sm"
            style={{ background: "linear-gradient(180deg, #3a3a3e, #2a2a2e)" }}
          />
          <div
            className="absolute -left-[2px] top-[178px] z-20 h-[44px] w-[3px] rounded-l-sm"
            style={{ background: "linear-gradient(180deg, #3a3a3e, #2a2a2e)" }}
          />

          {/* Side button — right (power) */}
          <div
            className="absolute -right-[2px] top-[140px] z-20 h-[60px] w-[3px] rounded-r-sm"
            style={{ background: "linear-gradient(180deg, #3a3a3e, #2a2a2e)" }}
          />

          {/* Screen */}
          <div className="relative">
            {/* Status bar area */}
            <div className="relative flex h-[52px] items-start justify-center bg-black px-6 pt-[14px]">
              {/* Dynamic Island */}
              <div className="relative z-10 flex h-[30px] w-[120px] items-center justify-center rounded-full bg-black">
                {/* Camera lens */}
                <div className="absolute left-[30px] h-[10px] w-[10px] rounded-full bg-[#0a0a10]"
                  style={{
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8), 0 0 2px rgba(40,40,60,0.3)",
                  }}
                >
                  <div className="absolute left-[2.5px] top-[2.5px] h-[5px] w-[5px] rounded-full bg-[#111118]"
                    style={{ boxShadow: "inset 0 0 1px rgba(60,60,100,0.5)" }}
                  />
                </div>
              </div>

              {/* Status bar content — left (time) */}
              <div className="absolute left-7 top-[16px] text-[11px] font-semibold text-white/90">
                9:41
              </div>

              {/* Status bar content — right (icons) */}
              <div className="absolute right-7 top-[16px] flex items-center gap-1">
                {/* Signal bars */}
                <svg className="h-[11px] w-[15px] text-white/90" viewBox="0 0 17 11" fill="currentColor">
                  <rect x="0" y="8" width="3" height="3" rx="0.5" />
                  <rect x="4.5" y="5.5" width="3" height="5.5" rx="0.5" />
                  <rect x="9" y="3" width="3" height="8" rx="0.5" />
                  <rect x="13.5" y="0" width="3" height="11" rx="0.5" />
                </svg>
                {/* WiFi */}
                <svg className="h-[11px] w-[13px] text-white/90" viewBox="0 0 16 12" fill="currentColor">
                  <path d="M8 11.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                  <path d="M4.35 8.15a5.16 5.16 0 017.3 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M1.7 5.5a9.13 9.13 0 0112.6 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {/* Battery */}
                <div className="flex items-center gap-[2px]">
                  <div className="relative h-[11px] w-[22px] rounded-[3px] border border-white/40 p-[1.5px]">
                    <div className="h-full w-[75%] rounded-[1.5px] bg-white/90" />
                  </div>
                  <div className="h-[4px] w-[1.5px] rounded-r-sm bg-white/40" />
                </div>
              </div>
            </div>

            {/* Screen content */}
            <div className="relative bg-black">
              {children}
            </div>

            {/* Home indicator */}
            <div className="flex h-[28px] items-center justify-center bg-black">
              <div className="h-[4px] w-[120px] rounded-full bg-white/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
