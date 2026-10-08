alter table public.guitar_documents
add column if not exists is_public boolean not null default false;

update public.guitar_documents
set is_public = false
where is_public is distinct from false;
