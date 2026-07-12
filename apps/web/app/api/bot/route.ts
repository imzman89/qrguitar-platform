import { NextResponse } from "next/server";
import { botKnowledgePolicy } from "../../../lib/bot/botRules";
import { supportEmail } from "../../../lib/bot/knowledgeBase";
import { buildExpertBotResponse, type BotResponse } from "../../../lib/expert-bot";
import { type DemoInstrument, type DemoUser } from "../../../lib/local-demo";

type BotRequest = {
  message?: string;
  instrument?: DemoInstrument | null;
  user?: DemoUser | null;
};

export async function POST(request: Request) {
  if (process.env.QRGUITAR_BOT_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, message: "QRguitar Bot is not available during launch." },
      { status: 503 }
    );
  }

  let body: BotRequest;

  try {
    body = (await request.json()) as BotRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid bot request." }, { status: 400 });
  }

  const message = String(body.message || "").trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, message: "Ask a guitar, gear, record, pricing, or QRguitar question." },
      { status: 400 }
    );
  }

  const response = buildExpertBotResponse(message, body.instrument || null, body.user || null);
  const enhanced = await maybeEnhanceWithOpenAI(message, response, body.instrument || null);

  return NextResponse.json({ ok: true, response: enhanced.response, provider: enhanced.provider }, { status: 200 });
}

async function maybeEnhanceWithOpenAI(message: string, localResponse: BotResponse, instrument: DemoInstrument | null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { response: localResponse, provider: "local" as const };
  }

  try {
    const recordContext = instrument
      ? [
          `QRguitar ID: ${instrument.qrCode}`,
          `Instrument: ${instrument.brand} ${instrument.model}`,
          `Year: ${instrument.year || "unknown"}`,
          `Serial: ${instrument.serial || "unknown"}`,
          `Visibility: ${instrument.visibility || "unknown"}`,
          `Verification: ${instrument.verificationStatus || "unverified"}`
        ].join("\n")
      : "No record is attached. Answer generally and ask for missing details when needed.";

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.25,
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content: [
              "You are QRguitar Bot, a practical guitar-industry assistant.",
              "Stay within guitars, amps, pedals, builders, shops, repairs, listings, values, ownership, QRguitar support, and documentation.",
              "Never claim definitive authentication or live market value without evidence.",
              "Do not expose private user info, private records, hidden documents, owner emails, or metadata.",
              `Support email: ${supportEmail}.`,
              `Knowledge policy: ${botKnowledgePolicy.join(" ")}`
            ].join("\n")
          },
          {
            role: "user",
            content: [
              `Question: ${message}`,
              `Record context:\n${recordContext}`,
              `Local fallback answer:\n${localResponse.answer}`,
              "Rewrite/improve the answer only if you can make it more helpful. Keep it concise, plainspoken, and practical."
            ].join("\n\n")
          }
        ]
      })
    });

    if (!openAIResponse.ok) {
      return { response: localResponse, provider: "local" as const };
    }

    const payload = (await openAIResponse.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return { response: localResponse, provider: "local" as const };
    }

    return {
      response: {
        ...localResponse,
        answer,
        evidenceUsed: Array.from(new Set([...localResponse.evidenceUsed, "Optional AI wording layer"])),
        warnings: Array.from(new Set([...localResponse.warnings, "AI output is grounded by QRguitar rules and must still be checked against evidence."]))
      },
      provider: "openai" as const
    };
  } catch {
    return { response: localResponse, provider: "local" as const };
  }
}
