# Content Studio owner guide

Content Studio is the administrator-only control plane for QRguitar presentation settings. Open it at `/admin/site-editor` (or `/site-editor` directly). It edits shared site wording, email-template copy, SEO fields, theme values, and editorial composition. It does not edit member accounts, Profiles, ownership, service records, messages, payments, or other saved customer data.

The complete machine-readable inventory is [content-studio-map.json](./content-studio-map.json). It contains every registered key with its editor location, audience, publication behavior, preview mode, and best-known runtime binding.

## Everyday editing

1. Choose an area, page, and section in the content tree.
2. Edit an ordinary field. Valid changes autosave to one shared server draft.
3. Check the save state before leaving the page. Another administrator can update the same shared draft.
4. Use **Review changes** to compare the complete draft with the published settings.
5. Use **Preview** to switch between the shared draft and published content.
6. Choose **Publish**, review the global change count, add an optional release note, and confirm.

Publishing is atomic and global: it publishes the complete validated draft, not only the visible field or section. Coordinate with other administrators before publishing.

## Preview truth

A preview route is a safe representative route, not a promise that every conditional field is currently visible. The selected section controls the route; the editor no longer silently substitutes a parent page that does not render the selected state.

- Static pages such as Homepage, Catalog, Contact, Dashboard, and specific admin workspaces can open a representative route.
- Public Profile, Profile Editor, Print Workspace, Service Review, transfer, and other record-dependent surfaces require a real permitted record. Content Studio reports that limitation instead of inventing an ID.
- Capture, payment-return, and other session-dependent pages are not opened as generic previews.
- Message preview is limited to the safe new-message surface; Content Studio never opens an arbitrary conversation thread.
- Content Studio does not iframe itself. Editor-only controls report preview unavailable.
- The full-preview control remains disabled until the requested draft or published preview URL is ready. Draft links use the administrator-scoped signed preview session.
- Email templates use the inline desktop/mobile/plain-text preview with sample variables, not a site route.

Always verify conditional or record-specific wording with a real authorized record after integration.

## Drafts, conflicts, and recovery

The editor uses versioned, idempotent mutations. If another administrator changes the draft first, the editor stops and presents conflict recovery rather than overwriting silently.

- **Discard draft** removes the shared draft and returns the editor to the published version.
- **Export local changes** downloads the current local settings before recovery.
- **Retry the same save** replays an uncertain request with the same operation identity.
- **Export and reload latest** preserves a local backup and reloads server state.
- Revision history copies an earlier published version into a new draft. It does not go live until a separate publish.
- Advanced JSON is read-only by default. Download a backup, unlock deliberately, validate, then load it as a draft.

If save recovery storage is unavailable, export local changes before reloading.

## Locked and advanced fields

`security-locked` fields remain visible for audit but cannot be changed through normal draft or publish operations. They protect security, privacy, ownership, payment, and recovery wording.

`editable-advanced` fields require deliberate review, especially indexing values and machine-sensitive labels. Ordinary copy is `editable-standard`.

Variables such as `{{profile_title}}` are application values. Keep every registered variable exactly; validation blocks a draft that drops required variables.

## Email boundary

Only the `email.service.submitted.*` family is bound to application delivery. It can send a safe test only to the authenticated administrator when Brevo is configured.

Supabase Auth owns password-recovery and transfer sign-in delivery. Their related Content Studio families are review references, not synchronized provider configuration; use the reviewed artifacts in `docs/provider-email-templates/` through the controlled provider change process. The other sixteen registered families are design previews with no production trigger. Content Studio offers a setup export for these non-application families and does not claim to send them.

## Reading the content map

Useful fields in each `surfaces[]` entry:

- `editorLocation`: where the owner finds the field.
- `audience`: who can encounter the copy.
- `publishBehavior`: shared draft/global publish or locked.
- `preview.mode`: `representative-route`, `record-required`, `inline-template-preview`, or `unavailable`.
- `binding.status`: the strongest source-level evidence found for the field.

Binding statuses are intentionally conservative:

- `connected-interface-call`: a typed `ui()` call uses the registered key.
- `application-renderer-bound`: an application email renderer uses the family.
- `literal-runtime-reference`: a non-editor runtime source contains the exact key.
- `registry-family-binding`: a typed family resolver supplies the value.
- `registered-awaiting-source-integration`: a coordinated key is reserved but its route change is on another integration branch.
- `registry-only-review-required`: no exact non-editor literal was found. Verify dynamic binding or retire the control before claiming it renders.
- `provider-owned-export-artifact`: Supabase Auth owns delivery and a reviewed install artifact exists; Content Studio remains a review reference.
- `editor-preview-only`: the template has no production delivery trigger.

Regenerate the map after registry or UI-copy changes:

```powershell
cd apps/web
node scripts/export-content-studio-map.mjs
```

Commit the regenerated JSON with the source change. A changed count or binding status should be reviewed, not accepted as harmless generated-file churn.

