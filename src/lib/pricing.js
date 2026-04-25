// Pricing tiers - the display side. Stripe Price IDs live in env.
export const TIERS = [
  {
    id: 'weekly',
    name: 'Weekly',
    price: 100,
    period: 'week',
    note: 'No commitment',
    features: [
      '4 NFL + 4 CFB picks ATS, every week',
      'Unit sizing on every play',
      'Push notifications at pick drop',
      'Locked until kickoff, private to subs',
    ],
    popular: false,
    cta: 'Start weekly',
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: 250,
    period: 'month',
    note: '~$58 / week effective - save 42%',
    features: [
      'Everything in Weekly',
      'Early-week previews',
      'Bankroll tracker',
      'Pick reasoning before each drop',
    ],
    popular: true,
    cta: 'Go monthly',
  },
  {
    id: 'season',
    name: 'Annual',
    price: 500,
    period: 'year',
    note: '~$9.60 / week effective - best value',
    features: [
      'Everything in Monthly',
      'Playoffs + bowls included',
      'Private Discord access',
      'Direct DMs for line questions',
    ],
    popular: false,
    cta: 'Lock it in',
  },
];
