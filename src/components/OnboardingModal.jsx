import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * First-visit onboarding modal. 3 cards. Sticky-dismissed.
 * Skips entirely if the user has visited before (localStorage flag).
 */
const SEEN_KEY = 'ls_onboarding_seen_v1';

const CARDS = [
  {
    eyebrow: 'Welcome',
    title: 'Two generations. One system.',
    body: 'Lock Street is a father/son betting picks operation. We share 4 NFL + 4 college picks against the spread every week — locked until kickoff, never made public.',
    cta: 'How it works',
  },
  {
    eyebrow: 'How picks drop',
    title: 'Game-day. Locked. Reasoned.',
    body: 'Picks land on game day with full reasoning and unit sizing (1u / 2u / 3u). Push notifications hit the moment a pick goes live so you can bet before the line moves.',
    cta: 'Why subscribe',
  },
  {
    eyebrow: 'Why $100 / week (or less)',
    title: 'Annual pays for itself in two weeks.',
    body: '$500/year works out to about $9.60 a week. The same handicap won three pools across three formats — receipts on the Track Record page. Try it before you commit.',
    cta: 'See pricing',
  },
];

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        // delay slightly so it doesn't fight with paint
        const t = setTimeout(() => setOpen(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    setOpen(false);
  }

  if (!open) return null;
  const card = CARDS[step];
  const last = step === CARDS.length - 1;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Lock Street">
      <div className="onboarding-card">
        <button className="ob-skip" onClick={dismiss} aria-label="Skip">Skip</button>
        <div className="ob-eyebrow">{card.eyebrow}</div>
        <h2 className="ob-title">{card.title}</h2>
        <p className="ob-body">{card.body}</p>

        <div className="ob-dots">
          {CARDS.map((_, i) => (
            <span key={i} className={'ob-dot' + (i === step ? ' active' : '')} />
          ))}
        </div>

        <div className="ob-actions">
          {step > 0 && (
            <button className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>
          )}
          {!last ? (
            <button className="btn-gold" onClick={() => setStep(step + 1)}>{card.cta}</button>
          ) : (
            <Link className="btn-gold ob-cta-link" to="/subscribe" onClick={dismiss}>{card.cta}</Link>
          )}
        </div>
      </div>
    </div>
  );
}
