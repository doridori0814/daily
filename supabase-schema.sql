create table if not exists public.reports (
  id text primary key,
  date date not null,
  type text not null check (type in ('morning', 'close')),
  title text not null,
  main_comment text default '',
  domestic_stocks text default '',
  overseas_stocks text default '',
  major_news text default '',
  stocks jsonb not null default '[]'::jsonb,
  pdf_url text not null,
  original_filename text,
  updated_at timestamptz not null default now()
);

create index if not exists reports_date_idx on public.reports (date desc);

alter table public.reports enable row level security;

drop policy if exists "Reports are readable by everyone" on public.reports;
create policy "Reports are readable by everyone"
on public.reports
for select
to anon
using (true);

-- Create a public Storage bucket named `reports` in Supabase Dashboard.
-- The Vercel API uses SUPABASE_SERVICE_ROLE_KEY for uploads, so insert/update
-- policies are not required for browser users.
