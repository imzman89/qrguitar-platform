import "server-only";
import { createServerSupabaseClient } from "../supabase-server";
import { readAdminEmailList } from "../admin-auth";
import { requireAdmin } from "../../app/api/admin/_utils";
import { createIntakeService } from "./intake-service";
import { createIntakeHandlers } from "./intake-http";

// Release readiness verifies the private intake schema before deployment.
// This runtime never erases data or invokes the disabled admin delete action.
const service = createIntakeService({
  client: createServerSupabaseClient,
  requireAdmin,
  readAdminEmails: readAdminEmailList,
});
export const intakeHandlers = createIntakeHandlers({ service: () => service });
