"use client";

import { useState } from "react";

import { faqItems } from "@/config/faq";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="faq" id="faq">
      <span className="section-label">FAQ</span>
      <h2 className="section-title">Frequently Asked Questions</h2>
      <div className="faq-list">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.question} className={`faq-item ${isOpen ? "open" : ""}`.trim()}>
              <button
                className="faq-q"
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : index)}
              >
                {item.question}
              </button>
              <div className="faq-a">
                <p>{item.answer}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
