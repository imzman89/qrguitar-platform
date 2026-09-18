import { directPaymentsHandlers } from "../../../../lib/direct-payments-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = directPaymentsHandlers.queue;
export const POST = directPaymentsHandlers.decide;
