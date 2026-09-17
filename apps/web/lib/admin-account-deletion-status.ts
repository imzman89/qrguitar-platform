// Shared by the operator UI and server. This is an availability guard, not a
// retention policy or an authorization to delete an account.
export const ACCOUNT_DELETION_UNAVAILABLE =
  "Permanent account deletion is disabled: the current database and Auth operations cannot atomically prevent new account records between eligibility checks and deletion. No account or data was deleted. A coordinated deletion transaction is required before this control can be enabled.";
