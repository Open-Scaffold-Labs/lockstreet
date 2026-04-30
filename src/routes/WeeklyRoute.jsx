import { Link } from 'react-router-dom';

/**
 * Weekly preview / newsletter scaffold.
 * For now this renders a hardcoded placeholder post structure.
 * Eventually: pull from a `posts` table in Supabase or a markdown file system.
 */

const POSTS = [
  {
    id: 'sample-week',
    title: 'NFL Week 1 — what we\'re watching',
    eyebrow: 'Sample preview',
    // Parsed as local noon to dodge UTC off-by-one when the renderer's
    // timezone is west of UTC.
    date: '2026-09-08',
    league: 'nfl',
    paragraphs: [
      'This is a sample weekly preview. Once the season starts, every Wednesday we\'ll drop a free preview here covering the major matchups, line moves we\'re tracking, and one free pick of the week. Subscribers get the full slate game-day; everyone gets the preview + the free pick here.',
    ],
    bulletsHeading: 'What we\'re watching this week',
    bullets: [
      'Public is heavy on the road favorite, sharp money has come back the other way mid-week.',
      'Weather in two outdoor venues is shifting totals down 3-4 points.',
      'Two starting QBs questionable; the backup QB market move on one of them is sharper than usual.',
    ],
    closer: 'Free pick of the week drops Wednesday at 7pm ET.',
  },
];

function formatDate(yyyyMmDd) {
  // Force local-noon parse to avoid UTC midnight rolling back a day.
  return new Date(`${yyyyMmDd}T12:00:00`).toLocaleDateString();
}

export default function WeeklyRoute() {
  return (
    <section>
      <div className="sub-hero">
        <h2>Weekly <span className="accent">preview</span>.</h2>
        <p>
          Free weekly preview every Wednesday — the matchups we're watching, line moves,
          and one free pick. Paid subscribers get the full board game-day.
        </p>
      </div>

      <div className="weekly-list">
        {POSTS.map((p) => (
          <article key={p.id} className="about-block weekly-post">
            <div className="trc-eyebrow">{p.eyebrow} · {formatDate(p.date)}</div>
            <h3 style={{ fontSize: 22, marginTop: 6 }}>{p.title}</h3>
            <div className="weekly-body">
              {p.paragraphs?.map((para, i) => <p key={i}>{para}</p>)}
              {p.bullets?.length > 0 && (
                <>
                  {p.bulletsHeading && <p><strong>{p.bulletsHeading}:</strong></p>}
                  <ul style={{ paddingLeft: 20, marginTop: 6 }}>
                    {p.bullets.map((b, i) => <li key={i} style={{ marginBottom: 6 }}>{b}</li>)}
                  </ul>
                </>
              )}
              {p.closer && <p>{p.closer}</p>}
            </div>
          </article>
        ))}
      </div>

      <div className="about-block about-block-cta" style={{ marginTop: 22 }}>
        <h3>Want the picks too?</h3>
        <p>Annual subscribers get every paid pick all season for $9.60/week effective.</p>
        <Link to="/subscribe" className="btn-gold" style={{ display: 'inline-block', padding: '12px 24px', textDecoration: 'none' }}>
          See pricing
        </Link>
      </div>
    </section>
  );
}
