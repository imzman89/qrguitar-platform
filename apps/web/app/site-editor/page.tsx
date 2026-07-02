"use client";

import { Clipboard, Eye, Image as ImageIcon, LockKeyhole, Plus, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  botSettingsKey,
  defaultBotSettings,
  readBotSettings,
  resetBotSettings,
  saveBotSettings,
  type EditableBotSettings
} from "../../lib/bot-settings";
import {
  applyThemeSettings,
  defaultSiteSettings,
  fetchPublishedSiteSettings,
  readSiteSettings,
  resetSiteSettings,
  saveSiteSettings,
  siteSettingsKey,
  type EditableSiteSettings
} from "../../lib/site-settings";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";

const editorGateKey = "qrguitar.siteEditorUnlocked";
const ownerPasscodeKey = "qrguitar.ownerPasscode";
const ownerPasscode = "admin";
type EditorTab = "brand" | "hero" | "sections" | "colors" | "seo" | "bot" | "preview";

const seoImageOptions = [
  { label: "White / orange social card", value: "/seo/qrguitar-og-v2.png" },
  { label: "Alternate social card", value: "/seo/qrguitar-og.png" },
  { label: "Text logo", value: "/seo/qrguitar-text-logo.svg" },
  { label: "Header logo", value: "/qrguitar-logo-white-orange.svg" }
];

const faviconOptions = [
  { label: "QRguitar logo", value: "/qrguitar-logo-white-orange.svg" },
  { label: "Text logo", value: "/seo/qrguitar-text-logo.svg" },
  { label: "Social card", value: "/seo/qrguitar-og-v2.png" }
];

const tabs: Array<{ id: EditorTab; label: string }> = [
  { id: "brand", label: "Brand" },
  { id: "hero", label: "Hero" },
  { id: "sections", label: "Homepage Sections" },
  { id: "colors", label: "Theme Colors" },
  { id: "seo", label: "SEO" },
  { id: "bot", label: "Bot Notes" },
  { id: "preview", label: "Settings JSON" }
];

export default function SiteEditorPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<EditableSiteSettings>(defaultSiteSettings);
  const [botSettings, setBotSettings] = useState<EditableBotSettings>(defaultBotSettings);
  const [message, setMessage] = useState("Ready to edit.");
  const [activeTab, setActiveTab] = useState<EditorTab>("hero");
  const [passcode, setPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState(ownerPasscode);
  const [passcodeMessage, setPasscodeMessage] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isOwnerPasscodeSet, setIsOwnerPasscodeSet] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const activePasscodeHint = isOwnerPasscodeSet ? "custom owner passcode configured" : `default (${ownerPasscode})`;
  const editorStatusTitle = !authChecked
    ? "Checking owner access."
    : !isSignedIn
      ? "Sign in required."
      : isUnlocked
        ? message
        : "Owner passcode required.";
  const editorStatusBody = !authChecked
    ? "Confirming your QRguitar session before editor tools load."
    : !isSignedIn
      ? "Sign in with the owner account before changing live site settings."
      : isUnlocked
        ? "Save publishes changes across desktop, mobile, and public visitors."
        : "Unlock the protected editor before changing published site settings.";
  const seoChecks = [
    {
      label: "Title",
      value: settings.seo.title.length >= 45 && settings.seo.title.length <= 60 ? "Good" : "Needs 45-60 characters"
    },
    {
      label: "Description",
      value: settings.seo.description.length >= 120 && settings.seo.description.length <= 160 ? "Good" : "Needs 120-160 characters"
    },
    {
      label: "Social image",
      value: settings.seo.image ? "Set" : "Missing"
    },
    {
      label: "Tab thumbnail",
      value: settings.seo.favicon ? "Set" : "Missing"
    }
  ];

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) {
        return;
      }

      const hasSession = Boolean(data.session?.user);
      setIsSignedIn(hasSession);
      setAuthChecked(true);

      if (!hasSession) {
        window.localStorage.removeItem(editorGateKey);
        router.replace(`/login?next=${encodeURIComponent("/site-editor")}&reason=session-expired`);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const hasSession = Boolean(session?.user);
      setIsSignedIn(hasSession);
      setAuthChecked(true);

      if (!hasSession) {
        window.localStorage.removeItem(editorGateKey);
        setIsUnlocked(false);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!authChecked || !isSignedIn) {
      return;
    }

    const storedPasscode = window.localStorage.getItem(ownerPasscodeKey) || ownerPasscode;
    setIsUnlocked(window.localStorage.getItem(editorGateKey) === "true");

    setIsOwnerPasscodeSet(Boolean(window.localStorage.getItem(ownerPasscodeKey)));
    setNewPasscode(storedPasscode);
    const hasLocalDraft = Boolean(window.localStorage.getItem(siteSettingsKey));
    const stored = readSiteSettings();
    setSettings(stored);
    setBotSettings(readBotSettings());
    applyThemeSettings(stored);

    void fetchPublishedSiteSettings().then((published) => {
      if (published && !hasLocalDraft) {
        setSettings(published);
        applyThemeSettings(published);
        setMessage("Published site settings loaded. Save to update every device.");
        return;
      }

      if (hasLocalDraft) {
        setMessage("Local draft loaded. Click Save Changes to publish it across desktop and mobile.");
      }
    });
  }, [authChecked, isSignedIn]);

  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);

  function unlockEditor(event: FormEvent) {
    event.preventDefault();
    const expectedPasscode = window.localStorage.getItem(ownerPasscodeKey) || ownerPasscode;

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

  function setEditorPasscode() {
    const cleaned = newPasscode.trim();
    if (!cleaned) {
      setPasscodeMessage("Passcode cannot be empty.");
      return;
    }

    window.localStorage.setItem(ownerPasscodeKey, cleaned);
    setIsOwnerPasscodeSet(true);
    setPasscodeMessage("Owner passcode updated.");
  }

  function resetEditorPasscode() {
    window.localStorage.removeItem(ownerPasscodeKey);
    setIsOwnerPasscodeSet(false);
    setNewPasscode(ownerPasscode);
    setPasscodeMessage("Passcode reset to default admin.");
  }

  function update<K extends keyof EditableSiteSettings>(section: K, value: EditableSiteSettings[K]) {
    const next = { ...settings, [section]: value };
    setSettings(next);
    applyThemeSettings(next);
  }

  function updateCategoryOption(index: number, value: string) {
    const next = [...settings.instrumentCategories];
    next[index] = value;
    setSettings({ ...settings, instrumentCategories: next });
  }

  function addCategoryOption() {
    setSettings({ ...settings, instrumentCategories: [...settings.instrumentCategories, "New category"] });
  }

  function removeCategoryOption(index: number) {
    const next = settings.instrumentCategories.filter((_, current) => current !== index);
    setSettings({ ...settings, instrumentCategories: next });
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

  function updateBotSetting(field: keyof EditableBotSettings, value: string) {
    setBotSettings((current) => ({ ...current, [field]: value }));
  }

  function updateSectionCard(
    section: "howCards" | "audienceCards",
    index: number,
    field: "title" | "copy",
    value: string
  ) {
    const list = [...settings.sections[section]];
    list[index] = { ...list[index], [field]: value };
    setSettings({ ...settings, sections: { ...settings.sections, [section]: list } });
    applyThemeSettings({ ...settings, sections: { ...settings.sections, [section]: list } });
  }

  function addSectionCard(section: "howCards" | "audienceCards") {
    const next = [...settings.sections[section], { title: "New card", copy: "Add details here." }];
    const updated = { ...settings, sections: { ...settings.sections, [section]: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function removeSectionCard(section: "howCards" | "audienceCards", index: number) {
    const next = settings.sections[section].filter((_, current) => current !== index);
    const updated = { ...settings, sections: { ...settings.sections, [section]: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function updateDetailsCheck(index: number, value: string) {
    const next = [...settings.sections.detailsChecks];
    next[index] = value;
    const updated = { ...settings, sections: { ...settings.sections, detailsChecks: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function addDetailsCheck() {
    const next = [...settings.sections.detailsChecks, "Add a detail your customers should see."];
    const updated = { ...settings, sections: { ...settings.sections, detailsChecks: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function removeDetailsCheck(index: number) {
    const next = settings.sections.detailsChecks.filter((_, current) => current !== index);
    const updated = { ...settings, sections: { ...settings.sections, detailsChecks: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function updatePricingPlanField(index: number, field: "name" | "price" | "copy" | "badge", value: string) {
    const next = [...settings.sections.pricingCards];
    next[index] = { ...next[index], [field]: value };
    const updated = { ...settings, sections: { ...settings.sections, pricingCards: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function updatePricingPlanFeature(planIndex: number, featureIndex: number, value: string) {
    const next = [...settings.sections.pricingCards];
    const features = [...(next[planIndex]?.features || [])];
    features[featureIndex] = value;
    next[planIndex] = { ...next[planIndex], features };
    const updated = { ...settings, sections: { ...settings.sections, pricingCards: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function addPricingPlanFeature(planIndex: number) {
    const next = [...settings.sections.pricingCards];
    const plan = { ...next[planIndex] };
    plan.features = [...(plan.features || []), "Add one benefit for this plan."];
    next[planIndex] = plan;
    const updated = { ...settings, sections: { ...settings.sections, pricingCards: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  function removePricingPlanFeature(planIndex: number, featureIndex: number) {
    const next = [...settings.sections.pricingCards];
    const plan = { ...next[planIndex] };
    plan.features = (plan.features || []).filter((_, current) => current !== featureIndex);
    next[planIndex] = plan;
    const updated = { ...settings, sections: { ...settings.sections, pricingCards: next } };
    setSettings(updated);
    applyThemeSettings(updated);
  }

  async function onSave(event?: FormEvent) {
    event?.preventDefault();
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    saveSiteSettings(settings);
    saveBotSettings(botSettings);
    setMessage("Saving and publishing site settings...");

    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/site-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ settings })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; settings?: EditableSiteSettings };

      if (!response.ok || !payload.ok) {
        setMessage(`Save failed (${response.status}): ${payload.message || "Could not publish to every device."}`);
        return;
      }

      const published = payload.settings || (await fetchPublishedSiteSettings());
      if (published) {
        setSettings(published);
        applyThemeSettings(published);
      }

      setMessage(payload.message || "Published globally.");
    } catch {
      setMessage("Saved locally, but publishing failed. Check your connection and try Save again.");
    } finally {
      setIsSaving(false);
    }
  }

  function onReset() {
    const stored = readSiteSettings();
    setSettings(stored);
    setBotSettings(readBotSettings());
    applyThemeSettings(stored);
    setMessage("Unsaved changes reset to the last saved settings.");
  }

  function resetToDefaults() {
    resetSiteSettings();
    resetBotSettings();
    const defaults = readSiteSettings();
    setSettings(defaults);
    setBotSettings(readBotSettings());
    applyThemeSettings(defaults);
    setMessage("Homepage and bot settings reset to QRguitar defaults.");
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
              <p>Owner controls for published homepage copy, brand text, SEO, and theme colors. This stays hidden from normal public navigation.</p>
            </div>
            <div className="editor-status card">
              <SlidersHorizontal size={28} />
              <strong>{editorStatusTitle}</strong>
              <span>{editorStatusBody}</span>
            </div>
          </div>

          {!authChecked ? (
            <section className="card owner-gate">
              <LockKeyhole size={34} />
              <div>
                <span className="mini-eyebrow">Checking session</span>
                <h2>Checking owner access.</h2>
                <p>Confirming your QRguitar session before loading editor controls.</p>
              </div>
            </section>
          ) : null}

          {authChecked && !isSignedIn ? (
            <section className="card owner-gate">
              <LockKeyhole size={34} />
              <div>
                <span className="mini-eyebrow">Sign in required</span>
                <h2>Your session expired.</h2>
                <p>Please sign in again before opening owner tools.</p>
              </div>
              <Link className="button" href={`/login?next=${encodeURIComponent("/site-editor")}&reason=session-expired`}>
                Sign in again
              </Link>
            </section>
          ) : null}

          {authChecked && isSignedIn && !isUnlocked ? (
            <form className="card owner-gate" onSubmit={unlockEditor}>
              <LockKeyhole size={34} />
              <div>
                <span className="mini-eyebrow">Protected local tool</span>
                <h2>Enter owner passcode.</h2>
                <p>This is a temporary local gate for MVP testing, not full authentication.</p>
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
                <button className="button secondary" type="button" onClick={resetEditorPasscode}>
                  Reset to admin
                </button>
              </div>
            </form>
          ) : null}

          {authChecked && isSignedIn && isUnlocked ? (
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
                    <div className="editor-subsection">
                      <div className="subsection-head">
                        <h3>Instrument categories</h3>
                        <button type="button" className="button secondary" onClick={addCategoryOption}>
                          <Plus size={14} /> Add category
                        </button>
                      </div>
                      <p className="editor-help-text">These options feed the Type / category dropdown on create and edit forms.</p>
                      {settings.instrumentCategories.map((category, index) => (
                        <div key={`category-${index}`} className="editor-array-card feature-row">
                          <TextField
                            label={`Category ${index + 1}`}
                            value={category}
                            onChange={(value) => updateCategoryOption(index, value)}
                          />
                          <button type="button" className="button secondary" onClick={() => removeCategoryOption(index)}>
                            <Trash2 size={14} /> Remove category
                          </button>
                        </div>
                      ))}
                    </div>
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
                      title="Main page wiring"
                      copy="Every visible homepage section can be edited from here."
                    />

                    <div className="editor-subsection">
                      <div className="editor-section-grid">
                        <TextField
                          label="How it works eyebrow"
                          value={settings.sections.howEyebrow}
                          onChange={(value) => updateSection("howEyebrow", value)}
                        />
                        <TextArea
                          label="How it works headline"
                          value={settings.sections.howHeadline}
                          onChange={(value) => updateSection("howHeadline", value)}
                          rows={2}
                        />
                      </div>
                      <TextArea
                        label="How it works body"
                        value={settings.sections.howBody}
                        onChange={(value) => updateSection("howBody", value)}
                        rows={3}
                      />
                    </div>

                    <div className="editor-subsection">
                      <div className="subsection-head">
                        <h3>How it works cards</h3>
                        <button type="button" className="button secondary" onClick={() => addSectionCard("howCards")}>
                          <Plus size={14} /> Add card
                        </button>
                      </div>
                      {settings.sections.howCards.map((card, index) => (
                        <div key={`how-${index}`} className="editor-array-card">
                          <TextField
                            label={`Card ${index + 1} title`}
                            value={card.title}
                            onChange={(value) => updateSectionCard("howCards", index, "title", value)}
                          />
                          <TextArea
                            label={`Card ${index + 1} text`}
                            value={card.copy}
                            onChange={(value) => updateSectionCard("howCards", index, "copy", value)}
                            rows={2}
                          />
                          <button type="button" className="button secondary" onClick={() => removeSectionCard("howCards", index)}>
                            <Trash2 size={14} /> Remove card
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="editor-subsection">
                      <div className="editor-section-grid">
                        <TextField
                          label="Customization eyebrow"
                          value={settings.sections.detailsEyebrow}
                          onChange={(value) => updateSection("detailsEyebrow", value)}
                        />
                        <TextArea
                          label="Customization headline"
                          value={settings.sections.detailsHeadline}
                          onChange={(value) => updateSection("detailsHeadline", value)}
                          rows={2}
                        />
                      </div>
                      <TextArea
                        label="Customization body"
                        value={settings.sections.detailsBody}
                        onChange={(value) => updateSection("detailsBody", value)}
                        rows={3}
                      />
                      <TextField
                        label="Customization action text"
                        value={settings.sections.detailsCta}
                        onChange={(value) => updateSection("detailsCta", value)}
                      />
                      <TextField
                        label="Promoted spotlight QR code (optional)"
                        value={settings.sections.detailsFeaturedCode}
                        onChange={(value) => updateSection("detailsFeaturedCode", value)}
                      />
                      <div className="editor-subsection">
                        <div className="subsection-head">
                          <h3>Record details checklist</h3>
                          <button type="button" className="button secondary" onClick={addDetailsCheck}>
                            <Plus size={14} /> Add item
                          </button>
                        </div>
                        {settings.sections.detailsChecks.map((item, index) => (
                          <div key={`check-${index}`} className="editor-array-card">
                            <TextArea
                              label={`Item ${index + 1}`}
                              value={item}
                              onChange={(value) => updateDetailsCheck(index, value)}
                              rows={2}
                            />
                            <button type="button" className="button secondary" onClick={() => removeDetailsCheck(index)}>
                              <Trash2 size={14} /> Remove item
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="editor-subsection">
                      <div className="editor-section-grid">
                        <TextField
                          label="Audience eyebrow"
                          value={settings.sections.audienceEyebrow}
                          onChange={(value) => updateSection("audienceEyebrow", value)}
                        />
                        <TextArea
                          label="Audience headline"
                          value={settings.sections.audienceHeadline}
                          onChange={(value) => updateSection("audienceHeadline", value)}
                          rows={2}
                        />
                      </div>
                      <TextArea
                        label="Audience body"
                        value={settings.sections.audienceBody}
                        onChange={(value) => updateSection("audienceBody", value)}
                        rows={3}
                      />
                      <TextField
                        label="Audience action text"
                        value={settings.sections.audienceCta}
                        onChange={(value) => updateSection("audienceCta", value)}
                      />
                      <div className="subsection-head">
                        <h3>Audience cards</h3>
                        <button type="button" className="button secondary" onClick={() => addSectionCard("audienceCards")}>
                          <Plus size={14} /> Add card
                        </button>
                      </div>
                      {settings.sections.audienceCards.map((card, index) => (
                        <div key={`audience-${index}`} className="editor-array-card">
                          <TextField
                            label={`Card ${index + 1} title`}
                            value={card.title}
                            onChange={(value) => updateSectionCard("audienceCards", index, "title", value)}
                          />
                          <TextArea
                            label={`Card ${index + 1} text`}
                            value={card.copy}
                            onChange={(value) => updateSectionCard("audienceCards", index, "copy", value)}
                            rows={2}
                          />
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => removeSectionCard("audienceCards", index)}
                          >
                            <Trash2 size={14} /> Remove card
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="editor-subsection">
                      <div className="editor-section-grid">
                        <TextField
                          label="Pricing eyebrow"
                          value={settings.sections.pricingEyebrow}
                          onChange={(value) => updateSection("pricingEyebrow", value)}
                        />
                        <TextArea
                          label="Pricing headline"
                          value={settings.sections.pricingHeadline}
                          onChange={(value) => updateSection("pricingHeadline", value)}
                          rows={2}
                        />
                      </div>
                      <TextArea
                        label="Pricing body"
                        value={settings.sections.pricingBody}
                        onChange={(value) => updateSection("pricingBody", value)}
                        rows={3}
                      />
                      <TextField
                        label="Commercial title"
                        value={settings.sections.pricingEnterpriseTitle}
                        onChange={(value) => updateSection("pricingEnterpriseTitle", value)}
                      />
                      <TextArea
                        label="Commercial body"
                        value={settings.sections.pricingEnterpriseBody}
                        onChange={(value) => updateSection("pricingEnterpriseBody", value)}
                        rows={3}
                      />
                      <div className="editor-subsection">
                        <div className="subsection-head">
                          <h3>Pricing cards</h3>
                        </div>
                        {settings.sections.pricingCards.map((plan, planIndex) => (
                          <div key={`plan-${planIndex}`} className="editor-array-card">
                            <TextField
                              label={`Plan ${planIndex + 1} name`}
                              value={plan.name}
                              onChange={(value) => updatePricingPlanField(planIndex, "name", value)}
                            />
                            <TextField
                              label="Price"
                              value={plan.price}
                              onChange={(value) => updatePricingPlanField(planIndex, "price", value)}
                            />
                            <TextArea
                              label="Summary"
                              value={plan.copy}
                              onChange={(value) => updatePricingPlanField(planIndex, "copy", value)}
                              rows={2}
                            />
                            <TextField
                              label="Badge (optional)"
                              value={plan.badge || ""}
                              onChange={(value) => updatePricingPlanField(planIndex, "badge", value)}
                            />
                            <div className="subsection-head">
                              <h4>Plan features</h4>
                              <button type="button" className="button secondary" onClick={() => addPricingPlanFeature(planIndex)}>
                                <Plus size={14} /> Add feature
                              </button>
                            </div>
                            {plan.features.map((feature, featureIndex) => (
                              <div key={`feature-${planIndex}-${featureIndex}`} className="editor-array-card feature-row">
                                <TextArea
                                  label={`Feature ${featureIndex + 1}`}
                                  value={feature}
                                  onChange={(value) => updatePricingPlanFeature(planIndex, featureIndex, value)}
                                  rows={2}
                                />
                                <button
                                  type="button"
                                  className="button secondary"
                                  onClick={() => removePricingPlanFeature(planIndex, featureIndex)}
                                >
                                  <Trash2 size={14} /> Remove feature
                                </button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}

                {activeTab === "colors" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Theme colors"
                      title="Dark premium system"
                      copy="These update the current browser preview immediately and save locally when you click Save."
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
                      title="Search, sharing, and traffic"
                      copy="Control the words and images people see in Google, text messages, Facebook, X, and link previews."
                    />
                    <div className="seo-editor-grid">
                      <TextField label="Google page title" value={settings.seo.title} onChange={(value) => updateSeo("title", value)} />
                      <CharacterHint current={settings.seo.title.length} target="Good target: 45-60 characters" />
                      <TextArea
                        label="Google page description"
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
                        label="Canonical URL"
                        value={settings.seo.canonicalUrl}
                        onChange={(value) => updateSeo("canonicalUrl", value)}
                      />
                      <TextField
                        label="Twitter handle"
                        value={settings.seo.twitterHandle}
                        onChange={(value) => updateSeo("twitterHandle", value)}
                      />
                      <TextArea
                        label="Robots"
                        value={settings.seo.robots}
                        onChange={(value) => updateSeo("robots", value)}
                        rows={2}
                      />
                      <div className="editor-subsection seo-image-editor">
                        <div className="subsection-head">
                          <div>
                            <h3>SEO images</h3>
                            <span className="editor-inline-note">Pick the image used for social shares, text previews, and homepage Open Graph metadata.</span>
                          </div>
                          <ImageIcon size={18} />
                        </div>
                        <div className="seo-image-options">
                          {seoImageOptions.map((option) => (
                            <button
                              className={settings.seo.image === option.value ? "active" : ""}
                              type="button"
                              key={option.value}
                              onClick={() => updateSeo("image", option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <TextField
                          label="Custom image path or URL"
                          value={settings.seo.image}
                          onChange={(value) => updateSeo("image", value)}
                        />
                        <small className="editor-inline-note">Best size: 1200 x 630 PNG or JPG. Use a full URL or a file path from the public folder, like /seo/qrguitar-og-v2.png.</small>
                      </div>
                      <div className="editor-subsection seo-image-editor">
                        <div className="subsection-head">
                          <div>
                            <h3>Browser tab thumbnail</h3>
                            <span className="editor-inline-note">This controls the favicon/tab icon people see in browser tabs, bookmarks, and saved shortcuts.</span>
                          </div>
                          <ImageIcon size={18} />
                        </div>
                        <div className="seo-image-options">
                          {faviconOptions.map((option) => (
                            <button
                              className={settings.seo.favicon === option.value ? "active" : ""}
                              type="button"
                              key={option.value}
                              onClick={() => updateSeo("favicon", option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <TextField
                          label="Custom tab icon path or URL"
                          value={settings.seo.favicon}
                          onChange={(value) => updateSeo("favicon", value)}
                        />
                      </div>
                    </div>
                    <div className="seo-checklist">
                      <span><Search size={15} /> Say what QRguitar does in plain words: permanent records, photos, specs, documents, service history, ownership, and QR codes.</span>
                      <span><Search size={15} /> Include real guitar-world phrases customers search for, such as guitar inventory, service records, warranty records, builders, shops, and collectors.</span>
                      <span><Search size={15} /> Use location terms only when they are true, such as Rhode Island guitar repair, Cranston guitar shop, or US builder records.</span>
                    </div>
                  </section>
                ) : null}

                {activeTab === "bot" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Bot Notes"
                      title="Assistant notes"
                      copy="Notes saved for future assistant behavior. This does not retrain or change the live bot by itself."
                    />
                    <TextArea
                      label="Knowledge notes"
                      value={botSettings.knowledgeNotes}
                      onChange={(value) => updateBotSetting("knowledgeNotes", value)}
                      rows={10}
                    />
                    <TextArea
                      label="Update notes"
                      value={botSettings.updateNotes}
                      onChange={(value) => updateBotSetting("updateNotes", value)}
                      rows={4}
                    />
                    <TextArea
                      label="Scope rules"
                      value={botSettings.scopeRules}
                      onChange={(value) => updateBotSetting("scopeRules", value)}
                      rows={4}
                    />
                  </section>
                ) : null}

                {activeTab === "preview" ? (
                  <section className="card editor-card">
                    <EditorHeader
                      label="Settings JSON"
                      title="Current Published Settings JSON"
                      copy="Backup and compare published settings. This is not a visual preview."
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
                  <span>You can preview and edit without affecting other users until you click Save.</span>
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
                  <div className="seo-preview-wordmark" aria-label="QRguitar SEO preview wordmark">
                    <span>QR</span><strong>guitar</strong>
                  </div>
                  <strong>{settings.seo.title}</strong>
                  <p>{settings.seo.description}</p>
                  <small>qrguitar.com</small>
                </div>
                <div className="seo-preview-card favicon-preview-card">
                  <span className="mini-eyebrow">Browser tab</span>
                  <div className="favicon-preview-row">
                    <img src={settings.seo.favicon} alt="" />
                    <strong>{settings.seo.title || "QRguitar"}</strong>
                  </div>
                  <p>Saved tab icon and title preview.</p>
                </div>
                <div className="editor-save-bar">
                  <button className="button" type="button" onClick={() => void onSave()} disabled={isSaving}>
                    <Save size={16} /> {isSaving ? "Saving..." : "Save Changes"}
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
                <div className="editor-save-bar owner-access-card">
                  <span className="mini-eyebrow">Owner access</span>
                  <div className="field">
                    <span>Site editor passcode</span>
                    <input value={newPasscode} onChange={(event) => setNewPasscode(event.target.value)} />
                  </div>
                  <div className="owner-access-actions">
                    <button className="button secondary" type="button" onClick={setEditorPasscode}>
                      Save passcode
                    </button>
                    <button className="button secondary" type="button" onClick={resetEditorPasscode}>
                      Reset to admin
                    </button>
                  </div>
                  <small className="editor-local-note">{passcodeMessage || activePasscodeHint}</small>
                </div>
                <small className="editor-local-note">Local key: {siteSettingsKey}</small>
                <small className="editor-local-note">Bot key: {botSettingsKey}</small>
              </aside>
            </form>
          ) : null}
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
