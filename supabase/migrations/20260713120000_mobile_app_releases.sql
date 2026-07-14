create table if not exists public.mobile_app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('android', 'ios')),
  version_name text not null,
  version_code integer not null,
  channel text not null default 'stable',
  release_notes text,
  download_url text not null,
  checksum_sha256 text,
  mandatory boolean not null default false,
  min_supported_version_code integer not null default 1,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists mobile_app_releases_lookup_idx
  on public.mobile_app_releases (platform, channel, published, version_code desc);

alter table public.mobile_app_releases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mobile_app_releases'
      and policyname = 'Published mobile releases are readable'
  ) then
    create policy "Published mobile releases are readable"
      on public.mobile_app_releases for select
      using (published = true);
  end if;
end $$;
