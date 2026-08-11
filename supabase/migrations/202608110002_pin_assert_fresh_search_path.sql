-- Pin the search_path on app_private.assert_fresh.
--
-- Supabase's database linter flagged this as the only function in the schema
-- without a pinned search_path. The exposure is small: it is not SECURITY
-- DEFINER, and EXECUTE is already revoked from public, anon and authenticated,
-- so no client can call it directly. It runs only inside the controlled RPCs,
-- which pin their own search_path for the duration of the call.
--
-- It is still worth fixing. The function compares two bigints, and operator
-- resolution follows search_path like anything else; a function that resolves
-- operators from whatever path happens to be in effect is one assumption away
-- from a problem. Every other helper in app_private pins pg_catalog, and an
-- outlier in a security-sensitive schema invites the question of whether it was
-- deliberate. It was not.
--
-- Body unchanged.

create or replace function app_private.assert_fresh(
  p_expected bigint,
  p_actual bigint,
  p_entity text
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_expected is null then
    return;
  end if;

  -- 40001 is serialization_failure, distinct from the 42501/22023/P0002 set
  -- already in use, so a client maps it to "stale" without parsing the message.
  if p_expected <> p_actual then
    raise exception
      'This % changed on another device (expected version %, server has %)',
      p_entity, p_expected, p_actual
      using errcode = '40001';
  end if;
end;
$$;

revoke all on function app_private.assert_fresh(bigint, bigint, text) from public, anon, authenticated;
