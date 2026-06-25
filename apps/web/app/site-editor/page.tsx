"use client";

import { Clipboard, Eye, LockKeyhole, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  applyThemeSettings,
  defaultSiteSettings,
  readSiteSettings,
  resetSiteSettings,
  saveSiteSettings,
  siteSettingsKey,
  type EditableSiteSettings
} from "../../lib/site-settings";

const editorGateKey = "qrguitar.siteEditorUnlocked";
const ownerPasscodeKey = "qrguitar.ownerPasscode";
const ownerPasscode = "qrguitar-owner";
type EditorTab = "brand" | "hero" | "sections" | "colors" | "seo" | "preview";

const tabs: Array<{ id: EditorTab; label: string }> = [
  { id: "brand", label: "Brand" },
  { id: "hero", label: "Hero" },
  { id: "sections", label: "Homepage Sections" },
  { id: "colors", label: "Theme Colors" },
  { id: "seo", label: "SEO" },
  { id: "preview", label: "Preview" }
];

export default function SiteEditorPage() {
  const [settings, setSettings] = useState<EditableSiteSettings>(defaultSiteSettings);
  const [message, setMessage] = useState("Ready to edit.");
  const [activeTab, setActiveTab] = useState<EditorTab>("hero");
  const [passcode, setPasscode] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isOwnerPasscodeSet, setIsOwnerPasscodeSet] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const activePasscodeHint = isOwnerPasscodeSet ? "custom owner passcode configured" : `default (${ownerPasscode})`;

  const expectedPasscode = isOwnerPasscodeSet
    ? (typeof window !== "undefined" ? window.localStorage.getItem(ownerPasscodeKey) || ownerPasscode : ownerPasscode)
    : ownerPasscode;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("owner") === "true") {
      setIsUnlocked(true);
      window.localStorage.setItem(editorGateKey, "true");
    } else {
      setIsUnlocked(window.localStorage.getItem(editorGateKey) === "true");
    }

    setIsOwnerPasscodeSet(Boolean(window.localStorage.getItem(ownerPasscodeKey)));
    const stored = readSiteSettings();
    setSettings(stored);
    applyThemeSettings(stored);
  }, []);

  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);

  function unlockEditor(event: FormEvent) {
    event.preventDefault();

    if (passcode.trim() !== expectedPasscode) {
      setMessage("Wrong owner passcode.");
      return;
    }

    window.localStorage.setItem(editorGateKey, "true");
    setIsUnlocked(true);
    setMessage("Owner editor unlocked on this browser.");
    setPasscode("");
  }

  function lockEditor() {
    window.localStorage.removeItem(editorGateKey);
    setIsUnlocked(false);
    setMessage("Owner editor locked on this browser.");
  }

  function update<K extends keyof EditableSiteSettings>(section: K, value: EditableSiteSettings[K]) {
    const next = { ...settings, [section]: value };
    setSettings(next);
    applyThemeSettings(next);
  }

  function updateHero(field: keyof EditableSiteSettings["hero"], value: string) {
    const next = { ...settings, hero: { ...settings.hero, [field]: value } };
    setSettings(next);
    applyThemeSettings(next);
  }

  function updateSection(field: keyof EditableSiteSettings["sections"], value: string) {
    const next = { ...settings, sections: { ...settings.sections, [field]: value } };
    setSettings(next);
    applyThemeSettings(next);
  }

  function updateColor(field: keyof EditableSiteSettings["colors"], value: string) {
    const next = { ...settings, colors: { ...settings.colors, [field]: value } };
    setSettings(next);
    applyThemeSettings(next);
  }

  function updateSeo(field: keyof EditableSiteSettings["seo"], value: string) {
    const next = { ...settings, seo: { ...settings.seo, [field]: value } };
    setSettings(next);
  }

  function onSave(event?: FormEvent) {
    event?.preventDefault();
    saveSiteSettings(settings);
    setMessage("Settings saved. Open the homepage to review the live preview.");
  }

  function onReset() {
    const stored = readSiteSettings();
    setSettings(stored);
    applyThemeSettings(stored);
    setMessage("Unsaved changes reset to the last saved settings.");
  }

  function resetToDefaults() {
    resetSiteSettings();
    const defaults = readSiteSettings();
    setSettings(defaults);
    applyThemeSettings(defaults);
    setMessage("Settings reset to QRguitar defaults.");
  }

  async function copySettingsJson() {
    try {
      await window.navigator.clipboard?.writeText(settingsJson);
      setCopyError(false);
      setMessage("Current settings JSON copied.");
    } catch {
      setCopyError(true);
      setMessage("Clipboard blocked in this browser. Manually copy from the text area below.");
    }
  }

  return (
    <>
      <Nav />
      <main className="section site-editor-page">
        <div className="shell">
          <div className="site-editor-admin-hero">
            <div>
              <div className="owner-badge">
                <ShieldCheck size={16} />
                Owner only
              </div>
              <h1>QRguitar site editor.</h1>
              <p>Owner controls for homepage copy, SEO, brand text, and theme colors. This stays hidden from normal public navigation.</p>
            </div>
            <div className="editor-status card">
              <SlidersHorizontal size={28} />
              <strong>{message}</strong>
              <span>Passcode-gated owner editor for fast copy and theme updates.</span>
            </div>
          </div>

          {!isUnlocked ? (
            <form className="card owner-gate" onSubmit={unlockEditor}>
              <LockKeyhole size={34} />
              <div>
                <span className="mini-eyebrow">Owner access</span>
                <h2>Enter owner passcode.</h2>
                <p>Use your owner passcode to edit homepage copy, SEO, and theme settings.</p>
                <small className="owner-passcode-note">Passcode in use: {activePasscodeHint}</small>
              </div>
              <label className="field">
                <span>Passcode</span>
                <input
                  type="password"
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  placeholder="Owner passcode"
                />
              </label>
              <div className="editor-lock-actions">
                <button className="button" type="submit">
                  Unlock Editor
                </button>
                <button className="button secondary" type="button" onClick={() => setPasscode("")}>
                  Clear
                </button>
              </div>
            </form>
          ) : (
            <form className="site-editor-layout admin-editor-layout" onSubmit={onSave}>
              <section className="admin-editor-main">
                <div className="editor-tabs" role="tablist" aria-label="Site editor sections">
                  {tabs.map((tab) => (
                    <button
                      className={activeTab === tab.id ? "active" : undefined}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      key={tab.id}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === "brand" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Brand"
                      title="Basic site identity"
                      copy="Keep this short and plain. These fields feed the public brand and footer text."
                    />
                    <TextField label="Brand name" value={settings.brandName} onChange={(value) => update("brandName", value)} />
                    <TextArea label="Footer line" value={settings.tagline} onChange={(value) => update("tagline", value)} rows={3} />
                  </section>
                ) : null}

                {activeTab === "hero" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Hero"
                      title="First thing people read"
                      copy="This controls the top homepage message and calls to action."
                    />
                    <TextField label="Eyebrow" value={settings.hero.eyebrow} onChange={(value) => updateHero("eyebrow", value)} />
                    <TextArea label="Headline" value={settings.hero.headline} onChange={(value) => updateHero("headline", value)} rows={2} />
                    <TextArea label="Subtext" value={settings.hero.body} onChange={(value) => updateHero("body", value)} rows={4} />
                    <div className="form-grid">
                      <TextField label="Main button" value={settings.hero.primaryCta} onChange={(value) => updateHero("primaryCta", value)} />
                      <TextField
                        label="Second button"
                        value={settings.hero.secondaryCta}
                        onChange={(value) => updateHero("secondaryCta", value)}
                      />
                    </div>
                  </section>
                ) : null}

                {activeTab === "sections" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Homepage sections"
                      title="Main page wording"
                      copy="Edit section headlines and body copy without touching code."
                    />
                    <div className="editor-section-grid">
                      <TextArea
                        label="How it works headline"
                        value={settings.sections.howHeadline}
                        onChange={(value) => updateSection("howHeadline", value)}
                        rows={2}
                      />
                      <TextArea
                        label="How it works body"
                        value={settings.sections.howBody}
                        onChange={(value) => updateSection("howBody", value)}
                        rows={3}
                      />
                      <TextArea
                        label="Details headline"
                        value={settings.sections.detailsHeadline}
                        onChange={(value) => updateSection("detailsHeadline", value)}
                        rows={2}
                      />
                      <TextArea
                        label="Details body"
                        value={settings.sections.detailsBody}
                        onChange={(value) => updateSection("detailsBody", value)}
                        rows={3}
                      />
                      <TextArea
                        label="Audience headline"
                        value={settings.sections.audienceHeadline}
                        onChange={(value) => updateSection("audienceHeadline", value)}
                        rows={2}
                      />
                      <TextArea
                        label="Audience body"
                        value={settings.sections.audienceBody}
                        onChange={(value) => updateSection("audienceBody", value)}
                        rows={3}
                      />
                      <TextArea
                        label="Pricing headline"
                        value={settings.sections.pricingHeadline}
                        onChange={(value) => updateSection("pricingHeadline", value)}
                        rows={2}
                      />
                      <TextArea
                        label="Pricing body"
                        value={settings.sections.pricingBody}
                        onChange={(value) => updateSection("pricingBody", value)}
                        rows={3}
                      />
                    </div>
                  </section>
                ) : null}

                {activeTab === "colors" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Theme colors"
                      title="Dark premium system"
                      copy="These update the preview immediately and apply to the homepage when you click Save."
                    />
                    <div className="color-editor-grid">
                      <ColorField
                        label="Background"
                        value={settings.colors.background}
                        onChange={(value) => updateColor("background", value)}
                      />
                      <ColorField label="Panels" value={settings.colors.panel} onChange={(value) => updateColor("panel", value)} />
                      <ColorField label="Guitar orange" value={settings.colors.gold} onChange={(value) => updateColor("gold", value)} />
                      <ColorField label="Button cream" value={settings.colors.cream} onChange={(value) => updateColor("cream", value)} />
                      <ColorField label="Text" value={settings.colors.text} onChange={(value) => updateColor("text", value)} />
                    </div>
                  </section>
                ) : null}

                {activeTab === "seo" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="SEO"
                      title="Search and text-message previews"
                      copy="Simple fields for how QRguitar appears in Google, shared links, and text messages."
                    />
                    <div className="seo-editor-grid">
                      <TextField label="Google title" value={settings.seo.title} onChange={(value) => updateSeo("title", value)} />
                      <CharacterHint current={settings.seo.title.length} target="Good target: 45-60 characters" />
                      <TextArea
                        label="Google description"
                        value={settings.seo.description}
                        onChange={(value) => updateSeo("description", value)}
                        rows={4}
                      />
                      <CharacterHint current={settings.seo.description.length} target="Good target: 120-160 characters" />
                      <TextArea
                        label="Keywords / topics"
                        value={settings.seo.keywords}
                        onChange={(value) => updateSeo("keywords", value)}
                        rows={3}
                      />
                      <TextField
                        label="Text message preview image"
                        value={settings.seo.image}
                        onChange={(value) => updateSeo("image", value)}
                      />
                    </div>
                    <div className="seo-checklist">
                      <span><Search size={15} /> Say what QRguitar is in plain words.</span>
                      <span><Search size={15} /> Mention guitars, amps, ownership, service records, and QR codes.</span>
                      <span>
                        <Search size={15} /> Keep image path as <strong>/seo/qrguitar-og-v2.png</strong> for white/orange logo.
                      </span>
                    </div>
                  </section>
                ) : null}

                {activeTab === "preview" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Preview"
                      title="Current settings JSON"
                      copy="Useful for backup, comparing changes, or moving settings to another browser."
                    />
                    <textarea className="settings-json-preview" readOnly rows={16} value={settingsJson} />
                    <div className="preview-actions">
                      <button className="button secondary" type="button" onClick={() => void copySettingsJson()}>
                        <Clipboard size={16} /> Copy JSON
                      </button>
                    </div>
                    {copyError ? (
                      <p className="copy-warning">Clipboard blocked in this browser. Use the JSON box to copy manually.</p>
                    ) : null}
                  </section>
                ) : null}
              </section>

              <aside className="editor-preview">
                <div className="editor-status card">
                  <span className="mini-eyebrow">Owner session</span>
                  <strong>Browser unlocked</strong>
                  <span>You can preview changes before saving them to the site editor settings.</span>
                  <button className="button secondary" type="button" onClick={lockEditor}>
                    <LockKeyhole size={14} /> Lock owner session
                  </button>
                </div>
                <div className="editor-preview-panel">
                  <span className="eyebrow">{settings.hero.eyebrow}</span>
                  <h2>{settings.hero.headline}</h2>
                  <p>{settings.hero.body}</p>
                  <div className="hero-actions">
                    <span className="button">{settings.hero.primaryCta}</span>
                    <span className="button secondary">{settings.hero.secondaryCta}</span>
                  </div>
                </div>
                <div className="seo-preview-card">
                  <span className="mini-eyebrow">SEO preview</span>
                  <img src={settings.seo.image} alt="QRguitar SEO preview" />
                  <strong>{settings.seo.title}</strong>
                  <p>{settings.seo.description}</p>
                  <small>qrguitar.com</small>
                </div>
                <div className="editor-save-bar">
                  <button className="button" type="submit">
                    <Save size={16} /> Save Changes
                  </button>
                  <button className="button secondary" type="button" onClick={onReset}>
                    <RotateCcw size={16} /> Reset Changes
                  </button>
                  <button className="button secondary" type="button" onClick={resetToDefaults}>
                    <RotateCcw size={16} /> Reset to defaults
                  </button>
                  <Link className="button secondary" href="/?fresh=editor">
                    <Eye size={16} /> View Live Homepage
                  </Link>
                  <button className="button secondary" type="button" onClick={() => void copySettingsJson()}>
                    <Clipboard size={16} /> Copy Current Settings JSON
                  </button>
                </div>
                <small className="editor-local-note">Settings key: {siteSettingsKey}</small>
              </aside>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function EditorHeader({ label, title, copy }: { label: string; title: string; copy: string }) {
  return (
    <div className="editor-card-header">
      <span className="mini-eyebrow">{label}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({
  label,
  value,
  rows,
  onChange
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CharacterHint({ current, target }: { current: number; target: string }) {
  return (
    <p className="seo-character-hint">
      {current} characters. {target}.
    </p>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
