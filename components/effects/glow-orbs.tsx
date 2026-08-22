"use client";

export function GlowOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        className="orb orb-primary absolute -left-[10%] top-[15%] h-[500px] w-[500px] opacity-40"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="orb orb-accent absolute -right-[8%] top-[40%] h-[400px] w-[400px] opacity-30"
        style={{ animationDelay: "-10s" }}
      />
      <div
        className="orb orb-primary absolute bottom-[10%] left-[30%] h-[350px] w-[350px] opacity-25"
        style={{ animationDelay: "-15s" }}
      />
    </div>
  );
}
