import Link from "next/link";

export function FinalCtaSection() {
  return (
    <section className="already-have">
      <div className="already-have-pill">
        <span>Already have a license key?</span>
        <Link href="/activate" className="btn btn-primary" style={{ padding: "9px 20px", fontSize: "14px", borderRadius: "100px" }}>
          Log In
        </Link>
      </div>
    </section>
  );
}
