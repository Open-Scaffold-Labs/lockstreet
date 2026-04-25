/**
 * Generic shimmering skeleton building blocks.
 * Use SkeletonCardGrid for the picks/scores routes' loading state.
 */

export function SkeletonBlock({ width = '100%', height = 16, radius = 6, style = {} }) {
  return <div className="skel" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonGameCard() {
  return (
    <div className="card skel-card">
      <div className="card-top">
        <SkeletonBlock width={36} height={16} radius={4} />
        <SkeletonBlock width={60} height={12} radius={4} style={{ marginLeft: 8 }} />
        <div style={{ flex: 1 }} />
        <SkeletonBlock width={70} height={12} radius={4} />
      </div>
      <div className="teams">
        <div className="team-row">
          <SkeletonBlock width={44} height={44} radius={22} />
          <div className="tcol">
            <SkeletonBlock width={80} height={16} radius={4} />
            <SkeletonBlock width={60} height={11} radius={3} style={{ marginTop: 6 }} />
          </div>
          <SkeletonBlock width={28} height={28} radius={6} />
        </div>
        <div className="team-row">
          <SkeletonBlock width={44} height={44} radius={22} />
          <div className="tcol">
            <SkeletonBlock width={80} height={16} radius={4} />
            <SkeletonBlock width={60} height={11} radius={3} style={{ marginTop: 6 }} />
          </div>
          <SkeletonBlock width={28} height={28} radius={6} />
        </div>
      </div>
      <div className="lines">
        <SkeletonBlock width={70} height={22} radius={6} />
        <SkeletonBlock width={70} height={22} radius={6} />
      </div>
      <div className="pick" style={{ minHeight: 64 }}>
        <SkeletonBlock width={90} height={10} radius={3} />
        <SkeletonBlock width={140} height={20} radius={4} style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }) {
  return (
    <div className="grid">
      {Array.from({ length: count }, (_, i) => <SkeletonGameCard key={i} />)}
    </div>
  );
}
