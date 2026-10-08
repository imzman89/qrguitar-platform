begin;

-- Use the existing reviewed account-deletion lock/freeze rules for this new actor-bearing table.
-- In particular, a requested deletion blocks creation of new slips while the profile is still active.
-- No delete trigger: the original Auth FK cascade must remain able to remove the private records.
create trigger account_deletion_fence_private_service_slips
  before insert or update on public.private_service_slips
  for each row execute function public._account_deletion_write_fence('owner_id');

commit;
