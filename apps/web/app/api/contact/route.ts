import { createContactSupportHandler } from "../../../lib/contact-support-http";
import { deliverApplicationEmail } from "../../../lib/transactional-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
const handler = createContactSupportHandler({ deliver: deliverApplicationEmail });
export const POST = handler;
