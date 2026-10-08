-- Private Document Vault / Proof Vault metadata.
-- Additive only: keeps existing guitar_documents rows and storage objects intact.

alter table public.guitar_documents
  add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists document_type text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists public_description text,
  add column if not exists private_notes text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists guitar_documents_guitar_public_created_idx
on public.guitar_documents(guitar_id, is_public, created_at desc);

create index if not exists guitar_documents_uploaded_by_idx
on public.guitar_documents(uploaded_by_user_id);
