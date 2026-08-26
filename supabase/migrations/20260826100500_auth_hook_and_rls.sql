-- Custom access token hook: computes the employee's role and internal id for injection into
-- the Supabase-issued JWT. NOT currently required by the Nest API — every /v1 endpoint is
-- authorized against a separately-issued PIN "operator" token (see server/src/auth), so this
-- hook sits unused by the running application today.
--
-- Verified (2026-08-26, local Supabase CLI v2.108.0 / GoTrue v2.191.0): the function computes
-- the right values — confirmed by calling it directly via SQL — and the auth service logs
-- "Hook ran successfully" on every login, but the custom claims do not end up in the signed
-- JWT regardless of whether they're added as top-level claims or nested under app_metadata.
-- This matches GoTrue's documented behavior of validating the hook's returned claims against
-- a fixed required/optional allowlist (iss/aud/exp/iat/sub/role/aal/session_id/email/phone/
-- is_anonymous, plus jti/nbf/app_metadata/user_metadata/amr) — anything else appears to be
-- silently dropped at signing time in this local stack. Left wired up (harmless either way)
-- for whoever builds a Supabase-Auth-native admin surface later; re-verify this against
-- whatever GoTrue version is running before depending on it.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  employee_row record;
begin
  select id, role, active
    into employee_row
    from public.employees
   where auth_user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- Top-level custom claims, per Supabase's documented hook contract — additions nested
  -- under app_metadata/user_metadata are not guaranteed to survive into the issued JWT.
  if employee_row.id is not null then
    claims := jsonb_set(claims, '{employee_id}', to_jsonb(employee_row.id::text));
    claims := jsonb_set(claims, '{employee_role}', to_jsonb(employee_row.role::text));
    claims := jsonb_set(claims, '{employee_active}', to_jsonb(employee_row.active));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- The employees table must be readable by the hook, which runs as supabase_auth_admin.
grant select on public.employees to supabase_auth_admin;

-- ---------------------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, zero policies. Nest connects with a role that
-- bypasses RLS entirely (superuser locally; service-role equivalent in production), so this
-- isn't the authorization mechanism — Nest's guards are. It exists as a backstop: if a
-- publishable/anon key ever leaked into a client bundle, the blast radius is zero rows
-- instead of the whole ledger.
-- ---------------------------------------------------------------------------------------
alter table public.employees enable row level security;
alter table public.clients enable row level security;
alter table public.client_phones enable row level security;
alter table public.pets enable row level security;
alter table public.pet_phones enable row level security;
alter table public.pet_logs enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_orders enable row level security;
alter table public.stock_movements enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_items enable row level security;
alter table public.discounts enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_log enable row level security;
alter table public.operator_sessions enable row level security;
