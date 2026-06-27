"use client";

import { Bot, Send, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getDemoUser, type DemoInstrument } from "../lib/local-demo";
import { buildExpertBotResponse, type BotResponse } from "../lib/expert-bot";
import { quickActions } from "../lib/bot/botRules";
import { getBotInstrumentContext } from "../lib/bot-context";

type ChatMessage = {
  role: "user" | "assistant";
  copy: string;
};

type BotLauncherDetail = {
  code?: string;
  instrument?: DemoInstrument;
};

function enrichFollowUpQuestion(question: string, previousUserQuestion?: string) {
  if (!previousUserQuestion) {
    return question;
  }

  const asksForMore = /\b(what do you need|what info|what information|what should i send|what details|what do you need from me)\b/i.test(question);
  if (asksForMore) {
    return `${previousUserQuestion}. ${question}`;
  }

  return question;
}

export function QRGuitarBotPopup() {
  const pathname = usePathname();
  const hideOnRoute = pathname?.startsWith("/login") || pathname?.startsWith("/create") || pathname?.startsWith("/bot");
  const [isOpen, setIsOpen] = useState(false);
  const [scopedInstrument, setScopedInstrument] = useState<DemoInstrument | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);
  const quickActionsForPopup = quickActions.filter((action) =>
    ["Identify", "Price Check", "Verify Record"].includes(action.label)
  );

  const instrument = useMemo(() => scopedInstrument, [scopedInstrument]);
  const quickPromptFor = (label: string, defaultPrompt: string) => {
    if (instrument) {
      return defaultPrompt;
    }

    if (label === "Identify") {
      return "Help me identify an instrument. Tell me exactly what details and photos you need.";
    }

    if (label === "Price Check") {
      return "Help me price an instrument. Tell me exactly what facts and comparable sales you need.";
    }

    if (label === "Verify Record") {
      return "Tell me what proof is needed to verify an instrument record.";
    }

    return defaultPrompt;
  };

  useEffect(() => {
    const context = getBotInstrumentContext(pathname || "", null);
    if (context.instrument) {
      setScopedInstrument(context.instrument);
      return;
    }

    if (!pathname?.startsWith("/i/") && !pathname?.startsWith("/edit/")) {
      setScopedInstrument(null);
    }
  }, [pathname]);

  useEffect(() => {
    const shouldClearScope = pathname?.startsWith("/i/") ? instrument : null;
    setMessages([
      {
        role: "assistant",
        copy: shouldClearScope
          ? `Ask about ${shouldClearScope.name || shouldClearScope.brand || "this instrument"}: proof, pricing, repairs, transfers, or listing prep.`
          : "The Guitar Expert and Assistant. Ask about a guitar, amp, pedal, price, serial, repair, listing, QRguitar record, or account issue."
      }
    ]);
  }, [instrument?.qrCode, instrument?.name]);

  useEffect(() => {
    const handleBotContext = (event: Event) => {
      const customEvent = event as CustomEvent<BotLauncherDetail>;
      setScopedInstrument(customEvent.detail?.instrument || null);
    };

    const handleOpenBot = (event: Event) => {
      const customEvent = event as CustomEvent<BotLauncherDetail>;
      if (customEvent.detail?.instrument) {
        setScopedInstrument(customEvent.detail.instrument);
      } else if (customEvent.detail?.code) {
        const context = getBotInstrumentContext(`/i/${customEvent.detail.code}`, null);
        setScopedInstrument(context.instrument);
      } else {
        setScopedInstrument(null);
      }
      setIsOpen(true);
    };

    window.addEventListener("qrguitar-bot-context", handleBotContext);
    window.addEventListener("qrguitar-open-bot", handleOpenBot);
    return () => {
      window.removeEventListener("qrguitar-bot-context", handleBotContext);
      window.removeEventListener("qrguitar-open-bot", handleOpenBot);
    };
  }, []);

  useEffect(() => {
    if (!chatWindowRef.current) {
      return;
    }

    chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
  }, [messages, isOpen]);

  async function askBot(question = input) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isThinking) {
      return;
    }

    const user = getDemoUser();
    const previousUserQuestion = [...messages].reverse().find((message) => message.role === "user")?.copy;
    const botQuestion = enrichFollowUpQuestion(cleanQuestion, previousUserQuestion);
    const fallbackResponse = buildExpertBotResponse(botQuestion, instrument, user);
    setIsThinking(true);
    setInput("");
    setMessages((current) => [...current, { role: "user", copy: cleanQuestion }]);

    try {
      const apiResponse = await fetch("/api/bot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: botQuestion, instrument, user })
      });

      const payload = (await apiResponse.json().catch(() => null)) as { ok?: boolean; response?: BotResponse } | null;
      const nextResponse = apiResponse.ok && payload?.ok && payload.response?.answer ? payload.response : fallbackResponse;
      setMessages((current) => [...current, { role: "assistant", copy: nextResponse.answer }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", copy: fallbackResponse.answer }]);
    } finally {
      setIsThinking(false);
    }
  }

  if (hideOnRoute) {
    return null;
  }

  return (
    <div className="qrguitar-bot-shell">
      <button
        type="button"
        className="bot-launcher-button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="qrguitar-bot-panel"
      >
        <Bot size={16} />
        <span>QRguitar Bot</span>
      </button>

      {isOpen ? (
        <section className="qrguitar-bot-panel" id="qrguitar-bot-panel" aria-label="QRguitar Bot panel">
          <header className="qrguitar-bot-header">
            <div>
              <span>QRguitar Bot</span>
              <strong>
                {instrument
                  ? `${instrument.name || instrument.brand || "Instrument"}`
                  : "The Guitar Expert and Assistant"}
              </strong>
            </div>
            <button type="button" className="bot-close" onClick={() => setIsOpen(false)} aria-label="Close bot">
              <X size={14} />
            </button>
          </header>

          <div className="qrguitar-bot-quick-actions" role="group" aria-label="Quick actions">
            {quickActionsForPopup.map(({ label, prompt }) => (
              <button
                type="button"
                key={label}
                disabled={isThinking}
                onClick={() => {
                  if (!isThinking) {
                    void askBot(quickPromptFor(label, prompt));
                  }
                }}
              >
                <Tag size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="qrguitar-bot-chat-window" aria-live="polite" ref={chatWindowRef}>
            {messages.map((message, index) => (
              <article className={`qrguitar-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === "assistant" ? "QRguitar Bot" : "You"}</span>
                <p>{message.copy}</p>
              </article>
            ))}
            {isThinking ? (
              <article className="qrguitar-chat-message assistant is-thinking">
                <span>QRguitar Bot</span>
                <p>Checking profile context and preparing an answer…</p>
              </article>
            ) : null}
          </div>

          <form
            className="qrguitar-bot-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              void askBot();
            }}
          >
            <label className="sr-only" htmlFor="qrguitar-bot-input">Ask QRguitar Bot</label>
            <input
              id="qrguitar-bot-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={instrument ? `Ask about ${instrument.brand || "this"} record...` : "Ask a guitar, serial, setup, price, or record question"}
              autoComplete="off"
              disabled={isThinking}
            />
              <button className="button bot-ask-button" type="submit" disabled={isThinking || !input.trim()}>
                <Send size={14} />
                <span>{isThinking ? "..." : "Ask"}</span>
              </button>
            </form>
        </section>
      ) : null}
    </div>
  );
}
