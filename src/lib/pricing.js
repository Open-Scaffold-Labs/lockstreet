// Pricing tiers — the display side. Stripe Price IDs live in env.
export const TIERS = [
  {
    id: 'weekly',
    name: 'Weekly',
    price: 19,
    period: 'week',
    note: 'Try it, no commitment',
    features: ['All NFL + CFB picks', 'Unit sizing on every pick', 'Push notifications at drop'],
    popular: false,
    cta: 'Subscribe',
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: 59,
    period: 'month',
    note: 'Save 22% vs weekly',
    features: ['Everything in Weekly', 'Early-week previews', 'Bankroll tracker'],
    popular: true,
    cta: 'Subscribe',
  },
  {
    id: 'season',
    name: 'Season Pass',
    price: 199,
    period: 'season',
    note: 'Best value',
    features: ['Everything in Monthly', 'Playoffs + bowls included', 'Private Discord access'],
    popular: false,
    cta: 'Lock it in',
  },
];
