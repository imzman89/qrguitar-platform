import "server-only";
import { requireAdmin } from "../../app/api/admin/_utils";
import { readAdminEmailList } from "../admin-auth";
import { createFulfillmentService } from "./fulfillment-service";
import { createFulfillmentHandlers } from "./fulfillment-http";

const service=createFulfillmentService({requireAdmin,protectedAdminEmails:readAdminEmailList});
export const fulfillmentHandlers=createFulfillmentHandlers({service:()=>service});
