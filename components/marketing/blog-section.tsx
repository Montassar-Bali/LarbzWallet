import Link from "next/link";

import { blogPosts } from "@/config/blog";

export function BlogSection() {
  return (
    <section className="blog-section" id="blog">
      <div className="blog-inner">
        <span className="section-label">Blog</span>
        <h2 className="section-title" style={{ marginBottom: "24px" }}>
          From the Blog
        </h2>

        <div className="blog-grid">
          {blogPosts.map((post) => (
            <Link key={post.id} href={post.href} className="feature-card blog-card">
              <span className="section-label" style={{ marginBottom: "4px" }}>
                {post.category}
              </span>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <span className="blog-read">Read more →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
