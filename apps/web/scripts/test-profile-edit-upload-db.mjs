import assert from "node:assert/strict";
import { createTestDb, readRepo, reportFailure } from "./atomic-test-support.mjs";

process.on("uncaughtException", reportFailure);
const db = await createTestDb([
  "20260910220000_atomic_instrument_profile_save.sql",
  "20260910230000_atomic_instrument_create.sql"
]);
await db.exec(readRepo("supabase/migrations/20260910233000_staged_upload_registry.sql"));
const conflictMigration = readRepo("supabase/migrations/20260917174500_business_conflict_responses.sql");
const correctedProfile = conflictMigration.match(/create or replace function public\.save_instrument_profile\([\s\S]*?\$\$;/i)?.[0];
assert(correctedProfile, "Reviewed profile conflict function missing");
await db.exec(correctedProfile);
await db.exec(readRepo("supabase/migrations/20260918150000_profile_edit_staged_uploads.sql"));

const owner = "10000000-0000-4000-8000-000000000001";
await db.exec(`insert into auth.users values ('${owner}');
  insert into public.profiles(id,display_name,account_status) values('${owner}','Edit owner','active');`);
let sequence = 0;
let passed = 0;
const uuid = (prefix, value) => `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

async function fixture() {
  sequence++;
  const guitar = uuid("2", sequence);
  const mediaId = uuid("3", sequence);
  const qr = `QRG-EDIT${String(sequence).padStart(4, "0")}`;
  const serial = `EDIT${String(sequence).padStart(4, "0")}`;
  const original = `${owner}/${guitar}/original.jpg`;
  const uploadId = `profile-edit-session-${String(sequence).padStart(2, "0")}`;
  const photo = `${owner}/${guitar}/profile-uploads/${uploadId}/image-${uuid("6", sequence)}.jpg`;
  const document = `${owner}/${guitar}/profile-uploads/${uploadId}/document-${uuid("7", sequence)}.pdf`;
  await db.query(`insert into public.guitars(id,owner_id,qr_code,permanent_path,name,brand,model,serial_number,hero_image_path,created_at,updated_at)
      values($1,$2,$3,$4,'Original','Fender','Strat',$5,$6,'2026-01-01','2026-01-02')`,
    [guitar, owner, qr, `/i/${qr}`, serial, original]);
  await db.query("insert into public.guitar_media(id,guitar_id,storage_path,alt,sort_order,created_at) values($1,$2,$3,'Original',0,'2026-01-01')",
    [mediaId, guitar, original]);
  await db.query("insert into public.site_content(content_key,content_value) values($1,'{}')", [`record_trust:${qr}`]);
  await db.query(`insert into storage.objects(bucket_id,name,metadata) values
      ('instrument-media',$1,'{"size":12582912,"mimetype":"image/jpeg"}'),
      ('instrument-documents',$2,'{"size":12582912,"mimetype":"application/pdf"}')`, [photo, document]);
  const expected = (await db.query("select updated_at from public.guitars where id=$1", [guitar])).rows[0].updated_at;
  const payload = {
    guitar: { qr_code: qr, name: "Edited", brand: "Fender", model: "Strat", year: "", serial_number: serial,
      builder: "", location: "", visibility: "public", summary: "", hero_image_path: photo },
    media: [
      { id: mediaId, storage_path: original, alt: "Original", sort_order: 1 },
      { id: null, storage_path: photo, alt: "Direct upload", sort_order: 0 }
    ],
    documents: [{ id: null, storage_path: document, name: "Receipt", is_public: false, document_type: "Receipt",
      public_description: "", private_notes: "", issuer_source: "", document_date: "", description: "",
      related_timeline_event_id: "", related_service_event_id: "", mime_type: "application/pdf", file_size_bytes: 12582912 }],
    specs: [{ label: "Condition", value: "used", sort_order: 0 }],
    expected_media: [{ id: mediaId, storage_path: original, sort_order: 0 }],
    expected_documents: [], owner_name: "Edit owner", actor_email: "owner@example.test", serial_correction_approved: false
  };
  return { guitar, mediaId, qr, original, uploadId, photo, document, payload, expected };
}

async function register(f, bucket, path, actor = owner) {
  return (await db.query("select public.register_staged_instrument_edit_upload($1::uuid,$2,$3::uuid,$4,$5) r",
    [actor, f.uploadId, f.guitar, bucket, path])).rows[0].r;
}
async function registerAll(f) { await register(f, "instrument-media", f.photo); await register(f, "instrument-documents", f.document); }
async function save(f) {
  return (await db.query("select public.save_instrument_profile($1::uuid,$2::uuid,$3::timestamptz,$4::jsonb) r",
    [f.guitar, owner, f.expected, JSON.stringify(f.payload)])).rows[0].r;
}
async function cleanup(f, media = [f.photo], documents = [f.document]) {
  return (await db.query("select public.cleanup_staged_instrument_edit_uploads($1::uuid,$2,$3::uuid,$4::text[],$5::text[]) r",
    [owner, f.uploadId, f.guitar, media, documents])).rows[0].r;
}
async function state(f) {
  const rows = (await db.query("select bucket_id,storage_path,state,guitar_id from public.instrument_staged_uploads where upload_id=$1 order by bucket_id", [f.uploadId])).rows;
  const guitar = (await db.query("select to_jsonb(g) value from public.guitars g where id=$1", [f.guitar])).rows[0].value;
  const media = (await db.query("select to_jsonb(m) value from public.guitar_media m where guitar_id=$1 order by storage_path", [f.guitar])).rows.map((row) => row.value);
  const documents = (await db.query("select to_jsonb(d) value from public.guitar_documents d where guitar_id=$1 order by storage_path", [f.guitar])).rows.map((row) => row.value);
  return { rows, guitar, media, documents };
}
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

await test("edit upload RPCs are service-only and trigger helper is never directly executable", async () => {
  const rows = (await db.query(`select role,
    has_function_privilege(role,'public.register_staged_instrument_edit_upload(uuid,text,uuid,text,text)','EXECUTE') register,
    has_function_privilege(role,'public.cleanup_staged_instrument_edit_uploads(uuid,text,uuid,text[],text[])','EXECUTE') cleanup,
    has_function_privilege(role,'public.consume_staged_instrument_edit_upload()','EXECUTE') consume
    from unnest(array['anon','authenticated','service_role']) role`)).rows;
  assert.deepEqual(rows.map((row) => [row.role,row.register,row.cleanup,row.consume]), [
    ["anon",false,false,false],["authenticated",false,false,false],["service_role",true,true,false]
  ]);
});

await test("a verified 12 MiB photo and document are consumed by the atomic edit", async () => {
  const f = await fixture(); await registerAll(f);
  const result = await save(f); assert.equal(result.ok, true);
  const after = await state(f);
  assert.equal(after.guitar.hero_image_path, f.photo);
  assert.equal(after.media.some((row) => row.storage_path === f.photo), true);
  assert.equal(after.documents[0].storage_path, f.document);
  assert.equal(after.documents[0].file_size_bytes, 12582912);
  assert(after.rows.every((row) => row.state === "consumed" && row.guitar_id === f.guitar));
  const recovery = await cleanup(f);
  assert.equal(recovery.retainedCount, 2); assert.deepEqual(recovery.mediaPaths, []); assert.deepEqual(recovery.documentPaths, []);
});

await test("a later document validation failure rolls back media insertion and upload consumption", async () => {
  const f = await fixture(); await registerAll(f); const before = await state(f);
  f.payload.documents[0].related_timeline_event_id = uuid("8", 999);
  await assert.rejects(save(f), (error) => error.code === "22023");
  assert.deepEqual(await state(f), before);
});

await test("cleanup tombstones an abandoned edit path so a racing save cannot reference it", async () => {
  const f = await fixture(); await registerAll(f);
  const cleanupResult = await cleanup(f, [f.photo], []); assert.deepEqual(cleanupResult.mediaPaths, [f.photo]);
  const before = await state(f);
  await assert.rejects(save(f), (error) => error.code === "QG007");
  assert.deepEqual(await state(f), before);
});

await test("authoritative Storage metadata mismatch rejects the whole edit and leaves uploads staged", async () => {
  const f = await fixture(); await registerAll(f); const before = await state(f);
  await db.query("update storage.objects set metadata=jsonb_set(metadata,'{size}','1') where bucket_id='instrument-documents' and name=$1", [f.document]);
  await assert.rejects(save(f), (error) => error.code === "QG007");
  assert.deepEqual(await state(f), before);
});

await test("unregistered final paths and registration by a different owner fail closed", async () => {
  const f = await fixture(); const before = await state(f);
  await assert.rejects(save(f), (error) => error.code === "QG007");
  assert.deepEqual(await state(f), before);
  await assert.rejects(register(f, "instrument-media", f.photo, "10000000-0000-4000-8000-000000000002"), (error) => error.code === "42501");
});

console.log(`Completed ${passed} atomic Profile edit upload database tests.`);
await db.close();
