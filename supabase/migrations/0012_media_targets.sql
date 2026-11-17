-- ============================================================================
-- Migration 0012: Media placement targets
--
-- Tags every uploaded image/video as desktop, mobile, or shared so the media
-- library can show the right assets in the right admin slot and the storefront
-- can keep separate crops for each surface.
-- ============================================================================

-- Add the column without a hard failure on older rows.
alter table public.media_assets add column if not exists "target" text;

update public.media_assets
set "target" = 'both'
where "target" is null;

alter table public.media_assets alter column "target" set default 'both';
alter table public.media_assets alter column "target" set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_target_check'
      and conrelid = 'public.media_assets'::regclass
  ) then
    alter table public.media_assets
      add constraint media_assets_target_check
      check ("target" in ('desktop', 'mobile', 'both'));
  end if;
end $$;

create index if not exists idx_media_assets_target on public.media_assets ("target");

comment on column public.media_assets."target" is
  'Viewport surface this asset is authored for: desktop, mobile, or both.';
