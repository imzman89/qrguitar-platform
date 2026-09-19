import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function POST() {
  return NextResponse.json({
    ok: false,
    code: "durable_messages_required",
    message: "Email inquiries have been retired. Use QRguitar Messages to contact another member."
  }, { status: 410, headers: NO_STORE_HEADERS });
}
