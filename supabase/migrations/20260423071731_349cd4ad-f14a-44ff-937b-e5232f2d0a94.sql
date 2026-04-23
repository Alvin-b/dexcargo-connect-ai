-- Employee API keys for the mobile management app
create table if not exists public.employee_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  label text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists employee_api_keys_user_idx on public.employee_api_keys(user_id);
create index if not exists employee_api_keys_hash_idx on public.employee_api_keys(key_hash);

alter table public.employee_api_keys enable row level security;

create policy "admins manage api keys"
  on public.employee_api_keys
  for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- Issue a new API key. Returns the raw key ONCE; only the hash is stored.
create or replace function public.issue_api_key(_user_id uuid, _label text)
returns table(id uuid, raw_key text, key_prefix text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw text;
  v_hash text;
  v_prefix text;
  v_id uuid;
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'only admins can issue api keys';
  end if;

  -- 32-byte random key, base64url-ish
  v_raw := 'dx_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');
  v_prefix := substr(v_raw, 1, 12);

  insert into public.employee_api_keys(user_id, label, key_prefix, key_hash, created_by)
  values (_user_id, _label, v_prefix, v_hash, auth.uid())
  returning employee_api_keys.id into v_id;

  return query select v_id, v_raw, v_prefix;
end $$;

-- Verify a raw key. Returns user_id if valid + not revoked, else null.
create or replace function public.verify_api_key(_raw_key text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_user uuid;
  v_id uuid;
begin
  if _raw_key is null or length(_raw_key) < 16 then
    return null;
  end if;
  v_hash := encode(extensions.digest(_raw_key, 'sha256'), 'hex');
  select id, user_id into v_id, v_user
    from public.employee_api_keys
    where key_hash = v_hash and revoked_at is null
    limit 1;
  if v_user is not null then
    update public.employee_api_keys set last_used_at = now() where id = v_id;
  end if;
  return v_user;
end $$;

create extension if not exists pgcrypto;