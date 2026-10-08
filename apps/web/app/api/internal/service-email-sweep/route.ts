import { serviceEmailSweep } from "../../../../lib/service-email-outbox-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = serviceEmailSweep;
