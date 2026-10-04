import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./test-downstream-ux-recovery.mjs";

const review = { id: "review-a", status: "submitted", qrCode: "QRG-FIXTURE", profileTitle: "Fixture instrument", title: "Fixture service", requestedVisibility: "private", evidenceCount: 1, ownerReviewNote: "Saved owner note\nSecond line", provider: {} };
const fetchReview = submission => request => request.body?.action === "mark_read" ? Response.json({ ok: true }) : request.url.startsWith("/api/service-evidence") ? Response.json({ ok: true, evidence: [{ id: "evidence-a", fileName: "Private work receipt.pdf", type: "receipt", fileSizeBytes: 1024, previewUrl: "https://synthetic.example.invalid/private-file" }] }) : Response.json({ ok: true, submission });
const expected = {
  approved: /Approved service history is now attached to the Profile/,
  changes_requested: /provider can revise and resubmit/,
  declined: /declined.*No approval can be sent/i,
  expired: /expired.*No approval can be sent/i,
  cancelled: /cancelled.*No approval can be sent/i,
  draft: /not awaiting an owner decision/,
  unexpected_status: /not awaiting an owner decision/
};

for (const status of Object.keys(expected)) {
  test(`closed review: ${status} shows saved facts and a clear next step without decision inputs`, async () => {
    const h = fixture("service", { fetch: fetchReview({ ...review, status, requestedVisibility: "public" }) });
    await h.settle();
    assert.match(h.text(), expected[status]);
    assert.doesNotMatch(h.text(), /Choose what happens next|Required when requesting changes|Visibility after approval/);
    assert.equal(h.elements().filter(n => n.type === "textarea" || n.type === "select").length, 0);
    assert.match(h.text(), /Saved owner note\nSecond line/);
    assert.match(h.text(), /Public service history/);
    assert.ok(h.elements().find(n => n.type === "a" && n.props.className === "button" && n.props.href === "/dashboard"));
    assert.ok(h.elements().find(n => n.type === "a" && n.props.href === "https://synthetic.example.invalid/private-file"));
    assert.equal(h.decisions().length, 0); h.unmount();
  });
}

test("closed review: absent saved note is explicit and private visibility is retained", async () => {
  const h = fixture("service", { fetch: fetchReview({ ...review, status: "declined", ownerReviewNote: "" }) });
  await h.settle(); assert.match(h.text(), /No saved owner note/); assert.match(h.text(), /Private service history/); h.unmount();
});

test("closed review: submitted review retains editable actions and pending/uncertain locks", async () => {
  const h = fixture("service", { fetch: request => request.body?.action === "approve" ? Promise.reject(Error("lost response")) : fetchReview(review)(request) });
  await h.settle(); assert.match(h.text(), /Choose what happens next/);
  assert.equal(h.button("Approve").props.disabled, false);
  h.button("Approve").props.onClick(); assert.equal(h.button("Approving...").props.disabled, true);
  await h.settle(); assert.equal(h.button("Approve").props.disabled, true);
  assert.equal(h.button("Check review status").props.disabled, false);
  assert.equal(h.decisions().length, 1); h.unmount();
});

test("closed review: confirmed changes use the saved server note and stay readable after a fresh mount", async () => {
  const saved = { ...review, status: "changes_requested", ownerReviewNote: "Saved server explanation" };
  const h = fixture("service", { fetch: request => request.body?.action === "request_changes" ? Response.json({ ok: true, submission: saved }) : fetchReview(review)(request) });
  await h.settle(); h.elements().find(n => n.type === "textarea").props.onChange({ target: { value: "Unsaved local explanation" } });
  h.button("Request changes").props.onClick(); await h.settle();
  assert.match(h.text(), /Saved server explanation/); assert.doesNotMatch(h.text(), /Unsaved local explanation/);
  assert.equal(h.elements().filter(n => n.type === "textarea").length, 0); assert.equal(h.decisions().length, 1); h.unmount();
  const reloaded = fixture("service", { fetch: fetchReview(saved) }); await reloaded.settle();
  assert.match(reloaded.text(), /Saved server explanation/); assert.equal(reloaded.decisions().length, 0); reloaded.unmount();
});

test("closed review: published summary copy refresh leaves evidence and saved state untouched", async () => {
  const h = fixture("service", { fetch: fetchReview({ ...review, status: "declined" }) }); await h.settle(); const count = h.requests.length;
  h.content({ "ui.app.service.review.id.page.savedReviewHeading": "Published saved-review heading" }); await h.settle();
  assert.match(h.text(), /Published saved-review heading/); assert.match(h.text(), /Saved owner note/);
  assert.equal(h.requests.length, count); assert.equal(h.decisions().length, 0); h.unmount();
});

test("closed review: account sign-out hides saved owner note and private evidence", async () => {
  const h = fixture("service", { fetch: fetchReview({ ...review, status: "approved" }) }); await h.settle();
  h.authEvent("SIGNED_OUT", null); await h.settle();
  assert.match(h.text(), /Owner sign-in required/); assert.doesNotMatch(h.text(), /Saved owner note|Private work receipt/);
  assert.equal(h.elements().filter(n => n.type === "a" && n.props.href === "https://synthetic.example.invalid/private-file").length, 0); h.unmount();
});
