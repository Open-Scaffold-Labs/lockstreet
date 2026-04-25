import { useState } from 'react';
import { colorsFor } from '../lib/teams.js';

/**
 * Circular team identity badge.
 * Tries the ESPN logo first, falls back to an abbreviation chip with gradient + glow.
 */
export default function TeamOrb({ team }) {
  const [logoFailed, setLogoFailed] = useState(false);
  if (!team) return <div className="orb" />;

  const mapped = colorsFor(team.abbr);
  const ringColor = team.color || mapped.c1;
  const style = { '--t1': mapped.c1, '--t2': mapped.c2, '--ring': ringColor };
  const showLogo = team.logo && !logoFailed;

  return (
    <div className="orb" style={style} aria-label={team.displayName || team.abbr}>
      {showLogo ? (
        <img src={team.logo} alt="" onError={() => setLogoFailed(true)} />
      ) : (
        team.abbr
      )}
    </div>
  );
}
