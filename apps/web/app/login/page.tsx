"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getDemoUser, saveDemoUser, type DemoUser } from "../../lib/local-demo";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState<DemoUser>({
    name: "Gary",
    email: "gary@example.com",
    role: "owner",
    plan: "free",
    verificationStatus: "unverified"
  });

  useEffect(() => {
    const user = getDemoUser();
    if (user) {
      setForm(user);
      setMode("login");
    }
  }, []);

  function submit() {
    saveDemoUser(form);
    router.push("/dashboard");
  }

  return (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section>
            <div className="eyebrow">Customer account</div>
            <h1>{mode === "register" ? "Create your QRguitar account." : "Log back into QRguitar."}</h1>
            <p>
              This local account lets you test the customer flow now. When we go live, these same screens will connect
              to Supabase Auth so customers can securely sign in from any device.
            </p>
            <div className="auth-tabs" role="tablist" aria-label="Account mode">
              <button className={mode === "register" ? "active" : ""} type="button" onClick={() => setMode("register")}>
                Register
              </button>
              <button className={mode === "login" ? "active" : ""} type="button" onClick={() => setMode("login")}>
                Login
              </button>
            </div>
          </section>

          <section className="card form auth-card">
            <div className="field">
              <label htmlFor="name">Display name</label>
              <input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="role">Account type</label>
              <select
                id="role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as DemoUser["role"] })}
              >
                <option value="owner">Owner / player</option>
                <option value="builder">Builder</option>
                <option value="shop">Shop / retailer</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="plan">Plan</label>
              <select
                id="plan"
                value={form.plan || "free"}
                onChange={(event) =>
                  setForm({
                    ...form,
                    plan: event.target.value as DemoUser["plan"],
                    verificationStatus: event.target.value === "free" ? "unverified" : "verified"
                  })
                }
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="brand">Brand</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <button className="button" type="button" onClick={submit}>
              {mode === "register" ? "Create Account" : "Login"}
            </button>
            <p className="fine-print">
              Local demo only: no password yet, no real account saved online. Supabase adds secure password and magic-link
              login later.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
