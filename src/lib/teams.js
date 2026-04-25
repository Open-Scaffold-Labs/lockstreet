// Primary + secondary colors for the team orb gradient & ring glow.
// Keyed by ESPN team abbreviation (works for both NFL and CFB, mostly disjoint).
// When an abbreviation isn't in the map we fall back to the default pair.

export const TEAM_COLORS = {
  // ---- NFL ----
  ARI:{c1:'#97233F',c2:'#4a1018'}, ATL:{c1:'#A71930',c2:'#4f0d17'},
  BAL:{c1:'#241773',c2:'#0f0a33'}, BUF:{c1:'#00338D',c2:'#0b1d4f'},
  CAR:{c1:'#0085CA',c2:'#003a5a'}, CHI:{c1:'#0B162A',c2:'#000'},
  CIN:{c1:'#FB4F14',c2:'#8d2c08'}, CLE:{c1:'#311D00',c2:'#120a00'},
  DAL:{c1:'#003594',c2:'#001c4e'}, DEN:{c1:'#FB4F14',c2:'#7a2808'},
  DET:{c1:'#0076B6',c2:'#003450'}, GB:{c1:'#203731',c2:'#0a1411'},
  HOU:{c1:'#03202F',c2:'#000'}, IND:{c1:'#002C5F',c2:'#00142b'},
  JAX:{c1:'#101820',c2:'#000'}, KC:{c1:'#E31837',c2:'#7a0c1f'},
  LAC:{c1:'#0080C6',c2:'#003a5a'}, LAR:{c1:'#003594',c2:'#001f58'},
  LV:{c1:'#000',c2:'#000'}, MIA:{c1:'#008E97',c2:'#024247'},
  MIN:{c1:'#4F2683',c2:'#2b1348'}, NE:{c1:'#002244',c2:'#000f1f'},
  NO:{c1:'#D3BC8D',c2:'#7a6b4b'}, NYG:{c1:'#0B2265',c2:'#050f32'},
  NYJ:{c1:'#125740',c2:'#06261c'}, PHI:{c1:'#004C54',c2:'#022a30'},
  PIT:{c1:'#FFB612',c2:'#8a6500'}, SEA:{c1:'#002244',c2:'#000f1f'},
  SF:{c1:'#AA0000',c2:'#560000'}, TB:{c1:'#D50A0A',c2:'#7a0606'},
  TEN:{c1:'#0C2340',c2:'#061220'}, WSH:{c1:'#5A1414',c2:'#2a0808'},
  // ---- CFB (a sampling — any unknown falls back cleanly) ----
  OSU:{c1:'#BB0000',c2:'#600000'}, MICH:{c1:'#00274C',c2:'#001028'},
  UGA:{c1:'#BA0C2F',c2:'#660819'}, ALA:{c1:'#9E1B32',c2:'#520a1a'},
  TEX:{c1:'#BF5700',c2:'#5a2500'}, ND:{c1:'#0C2340',c2:'#061220'},
  LSU:{c1:'#461D7C',c2:'#23093e'}, OKL:{c1:'#841617',c2:'#3f0a0a'},
  FLA:{c1:'#0021A5',c2:'#000f4d'}, PSU:{c1:'#041E42',c2:'#000f21'},
  USC:{c1:'#990000',c2:'#4c0000'}, ORE:{c1:'#154733',c2:'#082218'},
  CLEM:{c1:'#F56600',c2:'#7a3000'}, WASH:{c1:'#4B2E83',c2:'#25164c'},
  TENN:{c1:'#FF8200',c2:'#7a3f00'}, MISS:{c1:'#14213D',c2:'#08111f'},
  AUB:{c1:'#0C2340',c2:'#061220'}, KU:{c1:'#0051BA',c2:'#002858'},
  OKST:{c1:'#FF7300',c2:'#7a3700'}, TCU:{c1:'#4D1979',c2:'#240b3a'},
  NEB:{c1:'#E41C38',c2:'#7a0c1a'}, UCLA:{c1:'#2D68C4',c2:'#143263'},
};

export const DEFAULT_COLORS = { c1: '#2a3042', c2: '#12151f' };

export function colorsFor(abbr) {
  return TEAM_COLORS[abbr?.toUpperCase()] || DEFAULT_COLORS;
}
