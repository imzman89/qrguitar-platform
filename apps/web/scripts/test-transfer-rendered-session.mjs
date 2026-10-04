import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./test-downstream-ux-recovery.mjs";

const actorA = { access_token: "synthetic-a-token", user: { id: "actor-a" } };
const actorB = { access_token: "synthetic-b-token", user: { id: "actor-b" } };
const transfer = { id: "transfer-a", status: "sent", guitarName: "Synthetic instrument A", guitarQrCode: "QRG-FIXTURE-A" };

for (const transition of ["A-B", "A-B-A", "sign-out", "route", "unmount"]) {
  test(`transfer rendered session: old acceptance callback cannot dispatch after ${transition}`, async () => {
    let active = actorA, accessAllowed = true;
    const h = fixture("transfer", {
      getToken: async () => active?.access_token || "",
      fetch: request => request.method === "PATCH" ? Response.json({ ok: true, transfer: { ...transfer, status: "accepted" } })
        : accessAllowed ? Response.json({ ok: true, transfer }) : Response.json({ ok: true, requiresSignIn: true })
    });
    await h.settle(); const stale = h.button("Accept Ownership").props.onClick;
    if (transition === "A-B" || transition === "A-B-A") {
      active = actorB; accessAllowed = false; h.authEvent("SIGNED_IN", actorB, false);
      if (transition === "A-B-A") { active = actorA; accessAllowed = true; h.authEvent("SIGNED_IN", actorA, false); }
    } else if (transition === "sign-out") { active = null; accessAllowed = false; h.authEvent("SIGNED_OUT", null, false); }
    else if (transition === "route") { h.route("transfer-b"); }
    else h.unmount();
    stale(); await h.settle();
    assert.equal(h.requests.filter(r => r.method === "PATCH").length, 0, "captured controls must not borrow a new account/route/session revision");
    if (transition !== "unmount") h.unmount();
  });
}

test("transfer rendered session: current account accepts exactly once with its confirmed destination", async () => {
  const h = fixture("transfer", { getToken: async () => actorA.access_token, fetch: request => Response.json({ ok: true, transfer: request.method === "PATCH" ? { ...transfer, status: "accepted" } : transfer, permanentPath: "/i/QRG-FIXTURE-A" }) });
  await h.settle(); const current = h.button("Accept Ownership").props.onClick;
  current(); current(); await h.settle();
  assert.equal(h.requests.filter(r => r.method === "PATCH").length, 1);
  assert.match(h.text(), /Ownership accepted/);
  assert.ok(h.elements().find(n => n.type === "a" && n.props.href === "/dashboard")); h.unmount();
});

test("transfer rendered session: CMS refresh preserves the current lease without an extra read", async () => {
  const h = fixture("transfer", { getToken: async () => actorA.access_token, fetch: request => Response.json({ ok: true, transfer: request.method === "PATCH" ? { ...transfer, status: "accepted" } : transfer }) });
  await h.settle(); const current = h.button("Accept Ownership").props.onClick, count = h.requests.length;
  h.content({}); await h.settle(); assert.equal(h.requests.length, count);
  current(); await h.settle(); assert.equal(h.requests.filter(r => r.method === "PATCH").length, 1); h.unmount();
});

test("transfer rendered session: stale account-switch control cannot sign out a replacement account", async () => {
  let logouts = 0;
  const h = fixture("transfer", { logout: async () => { logouts++; return true; }, fetch: () => Response.json({ ok: true, requiresSignIn: true }) });
  await h.settle(); const stale = h.button("Use another account").props.onClick;
  h.authEvent("SIGNED_IN", actorB, false); stale(); await h.settle();
  assert.equal(logouts, 0); assert.equal(h.navigations.length, 0);
  h.button("Use another account").props.onClick(); await h.settle();
  assert.equal(logouts, 1); assert.equal(h.navigations[0], "/login?next=%2Ftransfer%2Ftransfer-a"); h.unmount();
});
