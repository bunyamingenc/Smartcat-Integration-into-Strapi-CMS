// src/components/Skeleton.jsx
// Ghost placeholders shown while data loads — replaces plain spinners

export function ArticleCardSkeleton() {
  return (
    <div className="article-card skeleton-card">
      <div className="article-card-top">
        <div className="skel skel-badge" />
        <div className="skel skel-tag" />
      </div>
      <div className="skel skel-title" />
      <div className="skel skel-desc" />
      <div className="skel skel-desc" style={{ width: "70%" }} />
      <div className="locale-mini-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="locale-mini-item">
            <div className="skel skel-code" />
            <div className="skel skel-bar" />
            <div className="skel skel-pct" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArticleGridSkeleton({ count = 3 }) {
  return (
    <div className="article-grid">
      {Array.from({ length: count }).map((_, i) => (
        <ArticleCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ActivityRowSkeleton() {
  return (
    <div className="activity-entry">
      <div className="activity-left">
        <div className="skel skel-dot" />
        <div className="activity-line" />
      </div>
      <div className="activity-body">
        <div className="skel skel-label" />
        <div className="skel skel-article-title" />
        <div className="skel skel-desc" style={{ width: "85%" }} />
      </div>
    </div>
  );
}

export function ActivityListSkeleton({ count = 4 }) {
  return (
    <div className="activity-timeline">
      {Array.from({ length: count }).map((_, i) => (
        <ActivityRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function MatrixSkeleton() {
  return (
    <div className="matrix-wrap">
      <div style={{ padding: "1.5rem" }}>
        {[1, 2, 3].map((row) => (
          <div key={row} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div className="skel" style={{ width: "160px", height: "20px" }} />
            {[1, 2, 3, 4, 5].map((col) => (
              <div key={col} className="skel" style={{ width: "40px", height: "20px" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
