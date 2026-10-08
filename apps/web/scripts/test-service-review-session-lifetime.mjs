import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./test-downstream-ux-recovery.mjs";

const session = { access_token: "synthetic-token", user: { id: "actor-a" } };
const review = { id: "review-a", status: "submitted", qrCode: "QRG-FIXTURE", profileTitle: "Fixture instrument", title: "Fixture service", requestedVisibility: "private", evidenceCount: 0, provider: {} };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const response = submission => Response.json({ ok: true, submission });
const serviceFetch = run => request => request.body?.action === "mark_read" ? Response.json({ ok: true }) : request.url.startsWith("/api/service-evidence") ? Response.json({ ok: true, evidence: [] }) : run(request);
const note = h => h.elements().find(n => n.type === "textarea");
const visibility = h => h.elements().find(n => n.type === "input" && n.props.type === "checkbox");
const writeDraft = h => { note(h).props.onChange({ target: { value: "Keep this private owner note." } }); visibility(h).props.onChange({ target: { checked: true } }); };
const changedCopy = { "ui.app.service.review.id.page.5300b43afac1": "Refreshed owner review error." };

test("service review: CMS refresh preserves note, visibility and the established request scope", async () => {
  const h = fixture(); await h.settle(); writeDraft(h);
  const count = h.requests.length;
  h.content(changedCopy); await h.settle();
  assert.equal(note(h).props.value, "Keep this private owner note.");
  assert.equal(visibility(h).props.checked, true);
  assert.equal(h.requests.length, count, "wording refresh must not reload or repeat mark_read");
  h.unmount();
});

test("service review: CMS refresh preserves an unconfirmed decision and blocks duplicate dispatch", async () => {
  const h = fixture("service", { fetch: serviceFetch(r => r.method === "PATCH" ? Promise.reject(Error("lost reply")) : response(review)) });
  await h.settle(); writeDraft(h); h.button("Approve").props.onClick(); await h.settle();
  h.content(changedCopy); await h.settle();
  assert.equal(note(h).props.value, "Keep this private owner note.");
  assert.equal(h.button("Approve").props.disabled, true);
  assert.equal(h.button("Check review status").props.disabled, false);
  h.button("Approve").props.onClick(); await h.settle();
  assert.equal(h.decisions().length, 1); h.unmount();
});

test("service review: CMS refresh does not abort an in-flight decision or lose its confirmation", async () => {
  const pending = deferred();
  const h = fixture("service", { fetch: serviceFetch(r => r.method === "PATCH" ? pending.promise : response(review)) });
  await h.settle(); writeDraft(h); h.button("Approve").props.onClick(); await h.settle();
  const decision = h.decisions()[0];
  h.content(changedCopy); await h.settle();
  assert.equal(decision.signal.aborted, false);
  assert.equal(h.button("Approving...").props.disabled, true);
  pending.resolve(response({ ...review, status: "approved" })); await h.settle();
  assert.match(h.text(), /decision has been saved/);
  assert.equal(h.decisions().length, 1); h.unmount();
});

test("service review: stale INITIAL_SESSION null cannot suppress the resolved startup session", async () => {
  const pending = deferred(), h = fixture("service", { getSession: () => pending.promise });
  h.authEvent("INITIAL_SESSION", null);
  assert.match(h.text(), /Loading private submission/);
  pending.resolve({ data: { session }, error: null }); await h.settle();
  assert.equal(h.button("Approve").props.disabled, false); h.unmount();
});

test("service review: stale INITIAL_SESSION null cannot discard an established owner's draft", async () => {
  const h = fixture(); await h.settle(); writeDraft(h);
  const count = h.requests.length; h.authEvent("INITIAL_SESSION", null); await h.settle();
  assert.equal(note(h).props.value, "Keep this private owner note.");
  assert.equal(h.requests.length, count); h.unmount();
});

test("service review: startup failure uses refreshed registered CMS copy without restarting authentication", async () => {
  const pending = deferred(); let startups = 0;
  const h = fixture("service", { getSession: () => { startups++; return pending.promise; } });
  await h.settle();
  h.content(changedCopy);
  pending.resolve({ data: { session: null }, error: Error("auth unavailable") }); await h.settle();
  assert.equal(startups, 1); assert.match(h.text(), /Refreshed owner review error/); h.unmount();
});

test("service review: legitimate sign-out still clears private data and fences a late decision", async () => {
  const pending = deferred();
  const h = fixture("service", { fetch: serviceFetch(r => r.method === "PATCH" ? pending.promise : response(review)) });
  await h.settle(); writeDraft(h); h.button("Approve").props.onClick(); await h.settle();
  h.authEvent("SIGNED_OUT", null); await h.settle();
  assert.match(h.text(), /Owner sign-in required/);
  assert.doesNotMatch(h.text(), /Fixture instrument|Keep this private owner note/);
  pending.resolve(response({ ...review, status: "approved" })); await h.settle();
  assert.doesNotMatch(h.text(), /decision has been saved/); assert.equal(h.decisions().length, 1); h.unmount();
});

test("service review: same-actor token refresh preserves a draft and its decision payload", async () => {
  const h = fixture(); await h.settle(); writeDraft(h);
  h.auth({ ...session, access_token: "synthetic-fresh-token" }); await h.settle();
  assert.equal(note(h).props.value, "Keep this private owner note.");
  h.button("Request changes").props.onClick(); await h.settle();
  assert.equal(h.decisions()[0].body.note, "Keep this private owner note.");
  assert.equal(h.decisions()[0].body.requestedVisibility, "public"); h.unmount();
});

test("service review: account replacement clears the previous owner's draft", async () => {
  const h = fixture(); await h.settle(); writeDraft(h);
  h.auth({ access_token: "synthetic-other-token", user: { id: "actor-b" } }); await h.settle();
  assert.equal(note(h).props.value, ""); assert.equal(visibility(h).props.checked, false); h.unmount();
});

test("service review: route replacement still hides previous private data during slow startup", async () => {
  let slow = false; const never = new Promise(() => {});
  const h = fixture("service", { getSession: () => slow ? never : Promise.resolve({ data: { session }, error: null }) });
  await h.settle(); writeDraft(h); slow = true; h.route("review-b"); await h.settle();
  assert.match(h.text(), /Loading private submission/);
  assert.doesNotMatch(h.text(), /Fixture instrument|Keep this private owner note/); h.unmount();
});

test("service review: stale initial event cannot unlock an uncertain decision", async () => {
  const h = fixture("service", { fetch: serviceFetch(r => r.method === "PATCH" ? Promise.reject(Error("lost reply")) : response(review)) });
  await h.settle(); h.button("Approve").props.onClick(); await h.settle();
  h.authEvent("INITIAL_SESSION", null); await h.settle();
  assert.equal(h.button("Approve").props.disabled, true);
  assert.equal(h.button("Check review status").props.disabled, false);
  h.button("Approve").props.onClick(); await h.settle();
  assert.equal(h.decisions().length, 1); h.unmount();
});

test("service review: authoritative sign-out during startup wins over a late valid session", async () => {
  const pending = deferred(), h = fixture("service", { getSession: () => pending.promise });
  await h.settle(); h.authEvent("SIGNED_OUT", null);
  pending.resolve({ data: { session }, error: null }); await h.settle();
  assert.match(h.text(), /Owner sign-in required/);
  assert.equal(h.requests.length, 0); h.unmount();
});

const switchWithoutRender = (h, mode) => {
  h.authEvent(mode === "sign-out" ? "SIGNED_OUT" : "SIGNED_IN", mode === "sign-out" ? null : { access_token: "synthetic-b-token", user: { id: "actor-b" } }, false);
  if (mode === "A-B-A") h.authEvent("SIGNED_IN", session, false);
};
for (const mode of ["A-B", "A-B-A", "sign-out"]) {
  test(`service review: captured decision cannot borrow a replacement session before render (${mode})`, async () => {
    const h = fixture(); await h.settle(); writeDraft(h);
    const stale = h.button("Approve").props.onClick;
    switchWithoutRender(h, mode); const count = h.requests.length;
    stale(); await h.settle();
    assert.equal(h.decisions().length, 0);
    assert.equal(h.requests.slice(count).filter(r => r.method === "PATCH" && r.body?.action !== "mark_read").length, 0);
    h.unmount();
  });
  test(`service review: captured fields and private reads cannot borrow a replacement session (${mode})`, async () => {
    const h = fixture("service", { fetch: serviceFetch(r => r.method === "PATCH" ? Promise.reject(Error("lost reply")) : response(review)) });
    await h.settle(); h.button("Approve").props.onClick(); await h.settle();
    const staleNote = note(h).props.onChange, staleVisibility = visibility(h).props.onChange;
    const staleCheck = h.button("Check review status").props.onClick;
    const staleEvidence = h.button("Refresh evidence links").props.onClick;
    switchWithoutRender(h, mode); const count = h.requests.length;
    staleNote({ target: { value: "STALE OWNER NOTE" } }); staleVisibility({ target: { checked: true } });
    staleCheck(); staleEvidence(); await h.settle();
    assert.equal(h.requests.slice(count).filter(r => r.url.startsWith("/api/service-evidence")).length, mode === "sign-out" ? 0 : 1, "only the new scope's initial evidence read is allowed");
    assert.equal(h.requests.slice(count).filter(r => r.url.startsWith("/api/service-submissions?id=")).length, mode === "sign-out" ? 0 : 1, "only the final account's initial read is allowed; the intermediate account's scheduled read is aborted");
    assert.doesNotMatch(h.text(), /STALE OWNER NOTE/);
    if (mode !== "sign-out") { assert.equal(note(h).props.value, ""); assert.equal(visibility(h).props.checked, false); }
    h.unmount();
  });
}
