import { createContactSupportHandler } from "../../../lib/contact-support-http";
import { deliverBrevoEmail } from "../../../lib/transactional-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
const handler = createContactSupportHandler({ deliver: deliverBrevoEmail });
export const POST = handler;
