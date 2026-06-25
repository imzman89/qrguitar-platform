"use client";

import { AlertTriangle, Bot, CheckCircle2, DollarSign, FileSearch, Send, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  demoInstrument,
  getDemoInstruments,
  getDemoUser,
  instrumentDisplayName,
  type DemoInstrument,
  type DemoUser
} from "../../lib/local-demo";
import {
  buildExpertBotResponse,
  expertBotKnowledgePolicy,
  expertStarterQuestions,
  type BotResponse
} from "../../lib/expert-bot";
import { formatMoney } from "../../lib/pricing-intelligence";

type ChatMessage = {
  role: "user" | "assistant";
  copy: string;
};

export default function QRguitarBotPage() {
  const [records, setRecords] = useState<DemoInstrument[]>([demoInstrument]);
  const [selectedCode, setSelectedCode] = useState(demoInstrument.qrCode);
  const [user, setUser] = useState<DemoUser | null>(null);
  const [input, setInput] = useState("Check this record for missing proof");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      copy:
                "Ask about a record, serial clue, missing proof, sale prep, repair documentation, transfer, or price check. I will separate evidence from assumptions."
    }
  ]);
  const [response, setResponse] = useState<BotResponse>(() => buildExpertBotResponse("Check this record for missing proof", demoInstrument, null));

  useEffect(() => {
    const stored = getDemoInstruments();
    setRecords(stored.length ? stored : [demoInstrument]);
    setUser(getDemoUser());
  }, []);

  useEffect(() => {
    const desiredCode = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("code")?.toUpperCase();
    if (!desiredCode) {
      return;
    }

    const matchedRecord = records.find((record) => record.qrCode.toUpperCase() === desiredCode);
    if (matchedRecord) {
      setSelectedCode(matchedRecord.qrCode);
    }
  }, [records]);

  const selectedInstrument = useMemo(() => {
    return records.find((record) => record.qrCode === selectedCode) || demoInstrument;
  }, [records, selectedCode]);

  function askBot(question = input) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      return;
    }

    const nextResponse = buildExpertBotResponse(cleanQuestion, selectedInstrument, user);
    setResponse(nextResponse);
    setMessages((current) => [
      ...current,
      { role: "user", copy: cleanQuestion },
      { role: "assistant", copy: nextResponse.answer }
    ]);
    setInput("");
  }

  return (
    <>
      <Nav />
      <main className="section expert-bot-page">
        <div className="shell">
          <section className="dashboard-hero expert-bot-hero">
            <div>
              <div className="eyebrow">QRguitar Bot</div>
              <h2>Instrument guidance based on the record, not guesswork.</h2>
              <p>
                Use the bot to review serial clues, specs, proof gaps, repairs, transfers, sale prep, and market value.
                It reads the QRguitar record first, then shows what proof is present and what still needs documentation.
              </p>
            </div>
            <div className="expert-disclaimer">
              <ShieldCheck size={20} />
              <span>Guidance only. Not an authentication certificate or official appraisal.</span>
            </div>
          </section>

          <section className="expert-bot-layout">
            <div className="expert-chat-card">
              <div className="expert-chat-toolbar">
                <label>
                  Record
                  <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
                    {records.map((record) => (
                      <option value={record.qrCode} key={record.qrCode}>
                        {record.qrCode} - {instrumentDisplayName(record)}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{selectedInstrument.brand} / {selectedInstrument.serial || "No serial"}</span>
              </div>

              <div className="starter-grid" aria-label="Suggested questions">
                {expertStarterQuestions.map((question) => (
                  <button type="button" onClick={() => askBot(question)} key={question}>
                    {question}
                  </button>
                ))}
              </div>

              <div className="chat-window" aria-live="polite">
                {messages.map((message, index) => (
                  <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === "assistant" ? "QRguitar Bot" : "You"}</span>
                    <p>{message.copy}</p>
                  </article>
                ))}
              </div>

              <form
                className="chat-input-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  askBot();
                }}
              >
                <label className="sr-only" htmlFor="expert-question">Ask the QRguitar Bot</label>
                <textarea
                  id="expert-question"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Example: Check this record for missing proof before I list it for sale."
                  rows={3}
                />
                <button className="button" type="submit">
                  <Send size={16} />
                  Ask
                </button>
              </form>
            </div>

            <aside className="expert-response-card" aria-label="Expert response detail">
              <div className="response-card-header">
                <Bot size={22} />
                <div>
                  <span>{response.intent.replace("-", " ")}</span>
                  <h3>{response.title}</h3>
                </div>
              </div>

              <div className="confidence-meter">
                <strong>Confidence</strong>
                <span>{response.confidence}</span>
              </div>

              {response.marketEstimate ? (
                <MarketPanel response={response} />
              ) : null}

              <EvidenceList icon={<CheckCircle2 size={16} />} title="Evidence found" items={response.evidenceFound} />
              <EvidenceList icon={<AlertTriangle size={16} />} title="Missing evidence" items={response.missingEvidence} />
              <EvidenceList icon={<FileSearch size={16} />} title="Recommended next steps" items={response.nextSteps} />

              <div className="bot-policy-card">
                <strong>Bot rules</strong>
                {expertBotKnowledgePolicy.slice(0, 4).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </aside>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function MarketPanel({ response }: { response: BotResponse }) {
  const estimate = response.marketEstimate;
  if (!estimate) {
    return null;
  }

  return (
    <section className="market-panel">
      <div className="market-range">
        <span><DollarSign size={15} /> Estimated Market Range</span>
        <strong>{formatMoney(estimate.low)} - {formatMoney(estimate.high)}</strong>
        <em>Fair center: {formatMoney(estimate.fair)}</em>
      </div>
      <div className="market-mini-grid">
        <span><strong>{estimate.compCount}</strong> sold/manual comps</span>
        <span><strong>{estimate.activeListingCount}</strong> active listings</span>
        <span><strong>{formatMoney(estimate.median)}</strong> median</span>
      </div>
      <p>{response.paidContext}</p>
      <div className="comp-list">
        {estimate.soldComps.slice(0, 4).map((comp) => (
          <article key={comp.id}>
            <strong>{formatMoney(comp.price)}</strong>
            <span>{comp.title}</span>
            <em>{comp.sourceLabel}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvidenceList({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <section className="evidence-list">
      <h4>{icon}{title}</h4>
      {items.length ? (
        items.map((item) => <p key={item}>{item}</p>)
      ) : (
        <p>No items yet.</p>
      )}
    </section>
  );
}
