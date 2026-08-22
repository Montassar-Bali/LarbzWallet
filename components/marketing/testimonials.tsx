import { reviewItems } from "@/config/reviews";

export function Testimonials() {
  const loopingReviews = [...reviewItems, ...reviewItems];

  return (
    <section className="reviews" id="reviews">
      <div className="reviews-inner">
        <span className="section-label">Reviews</span>
        <h2 className="section-title" style={{ marginBottom: "16px" }}>
          What Our Telegram Community Is Saying
        </h2>
        <p className="reviews-subtitle">
          Every review below comes straight from real users in our official{" "}
          <a href="https://t.me/larpzwalletcom" target="_blank" rel="noopener noreferrer">
            Telegram group
          </a>{" "}
          — unedited, unpaid, and 100% five stars. Join the group to read more or leave your own.
        </p>
      </div>

      <div className="reviews-marquee">
        <div className="reviews-carousel-track">
          {loopingReviews.map((review, index) => (
            <div key={`${review.name}-${index}`} className="review-card" aria-hidden={index >= reviewItems.length ? true : undefined}>
              <div className="review-stars" aria-label="Rated 5 out of 5 stars">★★★★★</div>
              <p className="review-text">&quot;{review.quote}&quot;</p>
              <div className="review-author">
                <span className="review-name">{review.name}</span>
                <span className="review-source">via {review.platform}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
