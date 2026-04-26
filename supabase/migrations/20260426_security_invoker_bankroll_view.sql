-- Fix: public.bankroll_summary was created with the default SECURITY DEFINER
-- mode, which means it runs as the view's creator (postgres role) and
-- bypasses RLS on public.bets. Querying the view would expose aggregates
-- across every user's bets.
--
-- Switch to SECURITY INVOKER so the view runs as the querying user and
-- respects "Users manage own bets" RLS on the underlying table.
-- (Requires Postgres 15+, which Supabase uses.)

alter view public.bankroll_summary set (security_invoker = true);
