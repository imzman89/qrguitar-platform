"use client";

import { RotateCcw, Save, Send, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  applyThemeSettings,
  defaultSiteSettings,
  readSiteSettings,
  resetSiteSettings,
  saveSiteSettings,
  type EditableSiteSettings
} from "../../lib/site-settings";

export default function SiteEditorPage() {
  const [settings, setSettings] = useState<EditableSiteSettings>(defaultSiteSettings);
  const [message, setMessage] = useState("Ready to edit.");

  useEffect(() => {
    const stored = readSiteSettings();
    setSettings(stored);
    applyThemeSettings(stored);
  }, []);

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

  function onSave(event: FormEvent) {
    event.preventDefault();
    saveSiteSettings(settings);
    setMessage("Saved. Open the homepage to see it live in this browser.");
  }

  function onReset() {
    resetSiteSettings();
    setSettings(defaultSiteSettings);
    applyThemeSettings(defaultSiteSettings);
    setMessage("Reset to the QRguitar default copy and colors.");
  }

  return (
    <>
      <Nav />
      <main className="section site-editor-page">
        <div className="shell">
          <div className="dashboard-hero editor-hero">
            <div>
              <div className="eyebrow">Owner site editor</div>
              <h1>Edit the website without touching code.</h1>
              <p>
                Change the homepage message, buttons, footer line, and main colors. This is the simple editor for testing today.
                When the app goes live, these settings move into your admin account.
              </p>
            </div>
            <div className="editor-status card">
              <SlidersHorizontal size={28} />
              <strong>{message}</strong>
              <span>Changes save on this computer for the current test build.</span>
              <Link className="button" href="/?fresh=editor">
                <Send size={16} /> View Homepage
              </Link>
            </div>
          </div>

          <form className="site-editor-layout" onSubmit={onSave}>
            <section className="card editor-card">
              <div className="editor-card-header">
                <span className="mini-eyebrow">Brand</span>
                <h2>Basics</h2>
              </div>
              <TextField label="Brand name" value={settings.brandName} onChange={(value) => update("brandName", value)} />
              <TextArea label="Footer line" value={settings.tagline} onChange={(value) => update("tagline", value)} rows={3} />
            </section>

            <section className="card editor-card">
              <div className="editor-card-header">
                <span className="mini-eyebrow">Homepage hero</span>
                <h2>First thing people read</h2>
              </div>
              <TextField label="Eyebrow" value={settings.hero.eyebrow} onChange={(value) => updateHero("eyebrow", value)} />
              <TextArea label="Headline" value={settings.hero.headline} onChange={(value) => updateHero("headline", value)} rows={2} />
              <TextArea label="Subtext" value={settings.hero.body} onChange={(value) => updateHero("body", value)} rows={4} />
              <div className="form-grid">
                <TextField label="Main button" value={settings.hero.primaryCta} onChange={(value) => updateHero("primaryCta", value)} />
                <TextField label="Second button" value={settings.hero.secondaryCta} onChange={(value) => updateHero("secondaryCta", value)} />
              </div>
            </section>

            <section className="card editor-card">
              <div className="editor-card-header">
                <span className="mini-eyebrow">Homepage sections</span>
                <h2>Main page wording</h2>
              </div>
              <TextArea label="How it works headline" value={settings.sections.howHeadline} onChange={(value) => updateSection("howHeadline", value)} rows={2} />
              <TextArea label="How it works body" value={settings.sections.howBody} onChange={(value) => updateSection("howBody", value)} rows={3} />
              <TextArea label="Details headline" value={settings.sections.detailsHeadline} onChange={(value) => updateSection("detailsHeadline", value)} rows={2} />
              <TextArea label="Details body" value={settings.sections.detailsBody} onChange={(value) => updateSection("detailsBody", value)} rows={3} />
              <TextArea label="Audience headline" value={settings.sections.audienceHeadline} onChange={(value) => updateSection("audienceHeadline", value)} rows={2} />
              <TextArea label="Audience body" value={settings.sections.audienceBody} onChange={(value) => updateSection("audienceBody", value)} rows={3} />
              <TextArea label="Pricing headline" value={settings.sections.pricingHeadline} onChange={(value) => updateSection("pricingHeadline", value)} rows={2} />
              <TextArea label="Pricing body" value={settings.sections.pricingBody} onChange={(value) => updateSection("pricingBody", value)} rows={3} />
            </section>

            <section className="card editor-card">
              <div className="editor-card-header">
                <span className="mini-eyebrow">Theme</span>
                <h2>Colors</h2>
              </div>
              <div className="color-editor-grid">
                <ColorField label="Background" value={settings.colors.background} onChange={(value) => updateColor("background", value)} />
                <ColorField label="Panels" value={settings.colors.panel} onChange={(value) => updateColor("panel", value)} />
                <ColorField label="Guitar orange" value={settings.colors.gold} onChange={(value) => updateColor("gold", value)} />
                <ColorField label="Button cream" value={settings.colors.cream} onChange={(value) => updateColor("cream", value)} />
                <ColorField label="Text" value={settings.colors.text} onChange={(value) => updateColor("text", value)} />
              </div>
            </section>

            <aside className="editor-preview">
              <div className="editor-preview-panel">
                <span className="eyebrow">{settings.hero.eyebrow}</span>
                <h2>{settings.hero.headline}</h2>
                <p>{settings.hero.body}</p>
                <div className="hero-actions">
                  <span className="button">{settings.hero.primaryCta}</span>
                  <span className="button secondary">{settings.hero.secondaryCta}</span>
                </div>
              </div>
              <div className="editor-save-bar">
                <button className="button" type="submit">
                  <Save size={16} /> Save Changes
                </button>
                <button className="button secondary" type="button" onClick={onReset}>
                  <RotateCcw size={16} /> Reset
                </button>
              </div>
            </aside>
          </form>
        </div>
      </main>
      <Footer />
    </>
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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
