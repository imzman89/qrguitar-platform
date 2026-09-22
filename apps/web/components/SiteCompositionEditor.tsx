"use client";
import { useUiText } from "./UiTextProvider";


import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, EyeOff, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  defaultEditorialComposition,
  editorialIconAllowlist,
  editorialPageLabels,
  type EditorialBlock,
  type EditorialPageKey,
  type EditorialSection
} from "../lib/site-settings";

type Props = {
  pageKey: EditorialPageKey;
  sections: EditorialSection[];
  errors?: Record<string, string>;
  onChange: (sections: EditorialSection[]) => void;
};

const dragMimeTypes = { section: "text/cms-section", block: "text/cms-block" };

function moveItem<T>(items: T[], from: number, to: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function newBlockId(pageKey: EditorialPageKey, sectionId: string) {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return `${pageKey}-${sectionId}-${unique}`;
}

function validationId(path: string) {
  return `composition-error-${path.replace(/[^a-z0-9]+/gi, "-")}`;
}

function controlId(path: string) {
  return `composition-input-${path.replace(/[^a-z0-9]+/gi, "-")}`;
}

export function SiteCompositionEditor({ pageKey, sections, errors = {}, onChange }: Props) {
  const ui = useUiText("components.SiteCompositionEditor");
  const defaults = defaultEditorialComposition[pageKey].sections;
  const [openSectionId, setOpenSectionId] = useState(sections[0]?.id || "");
  const [focusedBlockId, setFocusedBlockId] = useState(sections[0]?.blocks[0]?.id || "");
  const previousPageKey = useRef(pageKey);
  const dragSequence = useRef(0);
  const drag = useRef<{
    kind: "section" | "block";
    pageKey: EditorialPageKey;
    sectionId: string;
    blockId?: string;
    sections: EditorialSection[];
    payload: string;
  } | null>(null);

  useEffect(() => {
    if (previousPageKey.current === pageKey) return;
    previousPageKey.current = pageKey;
    drag.current = null;
    const firstSection = sections[0];
    setOpenSectionId(firstSection?.id || "");
    setFocusedBlockId(firstSection?.blocks[0]?.id || "");
  }, [pageKey, sections]);

  useEffect(() => {
    if (openSectionId && !sections.some((section) => section.id === openSectionId)) {
      setOpenSectionId(sections[0]?.id || "");
    }
  }, [openSectionId, sections]);

  function updateSection(index: number, patch: Partial<EditorialSection>) {
    onChange(sections.map((section, itemIndex) => itemIndex === index ? { ...section, ...patch } : section));
  }

  function reorderSection(from: number, to: number) {
    const next = moveItem(sections, from, to);
    if (next === sections || sections.slice(Math.min(from, to), Math.max(from, to) + 1).some((section) => section.locked)) return;
    onChange(next);
  }

  function updateBlock(sectionIndex: number, blockIndex: number, patch: Partial<EditorialBlock>) {
    const section = sections[sectionIndex];
    updateSection(sectionIndex, {
      blocks: section.blocks.map((block, itemIndex) => itemIndex === blockIndex ? { ...block, ...patch } : block)
    });
  }

  function reorderBlock(sectionIndex: number, from: number, to: number) {
    const section = sections[sectionIndex];
    if (!section) return;
    const blocks = moveItem(section.blocks, from, to);
    if (blocks !== section.blocks) updateSection(sectionIndex, { blocks });
  }

  function beginDrag(event: DragEvent<HTMLElement>, sectionId: string, blockId?: string) {
    event.stopPropagation();
    drag.current = null;
    const section = sections.find((item) => item.id === sectionId);
    const kind = blockId === undefined ? "section" : "block";
    if (!section || (kind === "section" && section.locked)) return;
    const payload = JSON.stringify({ pageKey, sectionId, blockId, sequence: ++dragSequence.current });
    drag.current = { kind, pageKey, sectionId, blockId, sections, payload };
    event.dataTransfer.setData(dragMimeTypes[kind], payload);
    event.dataTransfer.effectAllowed = "move";
  }

  function moveSectionWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, sectionIndex: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    reorderSection(sectionIndex, sectionIndex + (event.key === "ArrowUp" ? -1 : 1));
  }

  function currentDrag(kind: "section" | "block") {
    const source = drag.current;
    return source?.kind === kind && source.pageKey === pageKey && source.sections === sections ? source : null;
  }

  function dragOver(event: DragEvent<HTMLElement>, kind: "section" | "block", section: EditorialSection) {
    event.stopPropagation();
    const source = currentDrag(kind);
    if (source && (kind === "block" ? source.sectionId === section.id : !section.locked)) event.preventDefault();
  }

  function drop(event: DragEvent<HTMLElement>, kind: "section" | "block", sectionIndex: number, blockIndex?: number) {
    event.preventDefault();
    event.stopPropagation();
    const source = currentDrag(kind);
    drag.current = null;
    if (!source) return;
    try {
      // Only this component's current drag may change its current page snapshot.
      if (event.dataTransfer.getData(dragMimeTypes[kind]) !== source.payload) return;
    } catch { return; }
    const fromSection = sections.findIndex((section) => section.id === source.sectionId);
    if (kind === "section") {
      reorderSection(fromSection, sectionIndex);
    } else if (fromSection === sectionIndex && blockIndex !== undefined) {
      const fromBlock = sections[fromSection]?.blocks.findIndex((block) => block.id === source.blockId) ?? -1;
      reorderBlock(sectionIndex, fromBlock, blockIndex);
    }
  }

  function addBlock(sectionIndex: number) {
    const section = sections[sectionIndex];
    if (section.blocks.length >= 12) return;
    const id = newBlockId(pageKey, section.id);
    updateSection(sectionIndex, {
      blocks: [...section.blocks, {
        id,
        name: "New item",
        title: "New item",
        body: "Add the concise supporting copy for this item.",
        icon: "help",
        visible: true
      }]
    });
    setFocusedBlockId(id);
  }

  function duplicateBlock(sectionIndex: number, blockIndex: number) {
    const section = sections[sectionIndex];
    if (section.blocks.length >= 12) return;
    const source = section.blocks[blockIndex];
    const duplicate = { ...source, id: newBlockId(pageKey, section.id), name: `${source.name} copy`, protected: false };
    const blocks = [...section.blocks];
    blocks.splice(blockIndex + 1, 0, duplicate);
    updateSection(sectionIndex, { blocks });
  }

  function removeBlock(sectionIndex: number, blockIndex: number) {
    const section = sections[sectionIndex];
    const block = section.blocks[blockIndex];
    if (block.protected || section.blocks.length <= 1) return;
    if (!window.confirm(`Remove "${block.name}" from this draft? Published pages will not change until Publish.`)) return;
    updateSection(sectionIndex, { blocks: section.blocks.filter((_, index) => index !== blockIndex) });
  }

  function resetSection(sectionIndex: number) {
    const section = sections[sectionIndex];
    const fallback = defaults.find((item) => item.id === section.id);
    if (!fallback || !window.confirm(`Reset "${section.name}" to its approved default blocks and visibility?`)) return;
    updateSection(sectionIndex, structuredClone(fallback));
    if (section.id === openSectionId) setFocusedBlockId(fallback.blocks[0]?.id || "");
  }

  return (
    <section className="cms-field-group cms-composition-editor" aria-label={ui("ui.components.SiteCompositionEditor.4904a0d50cf7", "{{value1}} section arrangement", { value1: editorialPageLabels[pageKey] })}>
      <header>
        <div><span>{ui("ui.components.SiteCompositionEditor.783dc516d32b", "Page sections")}</span><h2>{ui("ui.components.SiteCompositionEditor.d557a972ab06", "Arrange")}{" "}{editorialPageLabels[pageKey]}</h2></div>
        <span>{sections.length}{" "}{ui("ui.components.SiteCompositionEditor.4697ef322d1b", "sections")}</span>
      </header>
      <p className="cms-section-intro">{ui("ui.components.SiteCompositionEditor.bdb7f34c2678", "Choose a section to manage its content. Drag to reorder, or use the arrow controls for precise placement.")}</p>
      <div className="cms-section-stack">
        {sections.map((section, sectionIndex) => {
          const isOpen = section.id === openSectionId;
          const focusedBlockIndex = Math.max(0, section.blocks.findIndex((block) => block.id === focusedBlockId));
          const focusedBlock = section.blocks[focusedBlockIndex];
          const sectionPath = `composition.${pageKey}.${section.id || "unknown"}`;
          const sectionNameError = errors[`${sectionPath}.name`];
          const sectionStructureError = errors[sectionPath] || errors[`${sectionPath}.blocks`];
          const hasSectionError = Object.entries(errors).some(([key, value]) => Boolean(value) && (key === sectionPath || key.startsWith(`${sectionPath}.`)));
          const focusedBlockPath = focusedBlock ? `${sectionPath}.${focusedBlock.id || "unknown"}` : "";
          const focusedError = (field: string) => errors[`${focusedBlockPath}.${field}`] || (field === "name" || field === "title" ? errors[focusedBlockPath] : "");
          return (
          <article
            className={`${section.visible ? "cms-section-editor" : "cms-section-editor is-hidden"}${isOpen ? " is-open" : ""}${hasSectionError ? " has-error" : ""}`}
            key={section.id}
            onDragOver={(event) => dragOver(event, "section", section)}
            onDrop={(event) => drop(event, "section", sectionIndex)}
          >
            <div className="cms-section-editor-head">
              <button
                type="button"
                className="cms-section-drag-handle"
                draggable={!section.locked}
                disabled={section.locked}
                aria-label={ui("ui.components.SiteCompositionEditor.a3405724636d", "Drag {{value1}} to reorder", { value1: section.name || "unnamed section" })}
                title={section.locked ? ui("ui.components.SiteCompositionEditor.68857f555f0c", "This section stays in its required position.") : ui("ui.components.SiteCompositionEditor.ccd456181b42", "Drag to reorder. Use the arrow keys or move buttons for keyboard control.")}
                onDragStart={(event) => beginDrag(event, section.id)}
                onDragEnd={() => { drag.current = null; }}
                onKeyDown={(event) => moveSectionWithKeyboard(event, sectionIndex)}
              >
                <GripVertical aria-hidden="true" size={18} />
              </button>
              <button
                type="button"
                className="cms-section-open"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenSectionId(isOpen ? "" : section.id);
                  if (!focusedBlockId && section.blocks[0]) setFocusedBlockId(section.blocks[0].id);
                }}
              >
                <span><strong>{section.name || ui("ui.components.SiteCompositionEditor.93e9f40bff0d", "Unnamed section")}</strong><small>{section.blocks.length ? ui("ui.components.SiteCompositionEditor.ee38dfaf5c5f", "{{value1}} content {{value2}}", { value1: section.blocks.length, value2: section.blocks.length === 1 ? "item" : "items" }) : ui("ui.components.SiteCompositionEditor.74de83b70ea6", "Page copy and layout")}</small></span>
                <span className={section.visible ? "cms-visibility is-visible" : "cms-visibility"}>{section.visible ? ui("ui.components.SiteCompositionEditor.6ba2a0e0afd0", "Shown") : ui("ui.components.SiteCompositionEditor.7e6fefff0f0a", "Hidden")}</span>
                <ChevronDown className={isOpen ? "is-open" : ""} size={17} />
              </button>
              <div className="cms-order-actions">
                <button type="button" aria-label={ui("ui.components.SiteCompositionEditor.740ebe32a73f", "Move {{value1}} up", { value1: section.name })} disabled={section.locked || sectionIndex === 0 || sections[sectionIndex - 1]?.locked} onClick={() => reorderSection(sectionIndex, sectionIndex - 1)}><ArrowUp size={15} /></button>
                <button type="button" aria-label={ui("ui.components.SiteCompositionEditor.a1ae739bcef6", "Move {{value1}} down", { value1: section.name })} disabled={section.locked || sectionIndex === sections.length - 1 || sections[sectionIndex + 1]?.locked} onClick={() => reorderSection(sectionIndex, sectionIndex + 1)}><ArrowDown size={15} /></button>
                <button type="button" className="cms-icon-text-control" disabled={section.locked} onClick={() => updateSection(sectionIndex, { visible: !section.visible })}>{section.visible ? <EyeOff size={14} /> : <Eye size={14} />}{section.locked ? ui("ui.components.SiteCompositionEditor.4850b174b713", "Required") : section.visible ? ui("ui.components.SiteCompositionEditor.ac20a57bfde0", "Hide") : ui("ui.components.SiteCompositionEditor.0df6f1cad36c", "Show")}</button>
                <button type="button" aria-label={ui("ui.components.SiteCompositionEditor.aeb976353a17", "Reset {{value1}}", { value1: section.name })} onClick={() => resetSection(sectionIndex)}><RotateCcw size={15} /></button>
              </div>
            </div>

            {isOpen ? <div className="cms-section-fields">
              <label className={sectionNameError ? "has-error" : ""} htmlFor={`composition-${pageKey}-${section.id}-name`}>{ui("ui.components.SiteCompositionEditor.7c0faddce9a7", "Section name")}<input
                  id={`composition-${pageKey}-${section.id}-name`}
                  value={section.name}
                  maxLength={100}
                  aria-invalid={Boolean(sectionNameError)}
                  aria-describedby={sectionNameError ? validationId(`${sectionPath}.name`) : undefined}
                  onChange={(event) => updateSection(sectionIndex, { name: event.target.value })}
                />
                {sectionNameError ? <small id={validationId(`${sectionPath}.name`)} className="cms-validation-error" role="alert">{sectionNameError}</small> : null}
              </label>
              {sectionStructureError ? <p id={validationId(sectionPath)} className="cms-validation-error" role="alert">{sectionStructureError}</p> : null}
            </div> : null}

            {isOpen && section.blocks.length ? (
              <div className="cms-block-focus-layout">
                <div className="cms-block-list" role="list" aria-label={ui("ui.components.SiteCompositionEditor.f6514d2b3986", "{{value1}} content items", { value1: section.name })}>
                  {section.blocks.map((block, blockIndex) => (
                  <button
                    type="button"
                    className={`${block.visible ? "cms-block-row" : "cms-block-row is-hidden"}${focusedBlock?.id === block.id ? " is-active" : ""}${Object.entries(errors).some(([key, value]) => Boolean(value) && key.startsWith(`${sectionPath}.${block.id || "unknown"}`)) ? " has-error" : ""}`}
                    key={block.id}
                    draggable
                    onDragStart={(event) => beginDrag(event, section.id, block.id)}
                    onDragEnd={() => { drag.current = null; }}
                    onDragOver={(event) => dragOver(event, "block", section)}
                    onDrop={(event) => drop(event, "block", sectionIndex, blockIndex)}
                    aria-current={focusedBlock?.id === block.id ? "true" : undefined}
                    onClick={() => setFocusedBlockId(block.id)}
                  >
                    <GripVertical size={15} aria-hidden="true" />
                    <span><strong>{block.name || ui("ui.components.SiteCompositionEditor.c014c64b338c", "Unnamed item")}</strong><small>{block.title || ui("ui.components.SiteCompositionEditor.f59ab8d1331b", "Untitled")}</small></span>
                    <em>{block.visible ? ui("ui.components.SiteCompositionEditor.6ba2a0e0afd0", "Shown") : ui("ui.components.SiteCompositionEditor.7e6fefff0f0a", "Hidden")}</em>
                  </button>
                ))}
                  <button type="button" className="cms-add-block" disabled={section.blocks.length >= 12} onClick={() => addBlock(sectionIndex)}><Plus size={15} />{" "}{ui("ui.components.SiteCompositionEditor.d1a0b329a72b", "Add item")}</button>
                </div>
                {focusedBlock ? (
                  <section className="cms-focused-block" aria-label={ui("ui.components.SiteCompositionEditor.4f98de363fa7", "Edit {{value1}}", { value1: focusedBlock.name || "unnamed item" })}>
                    <header><div><span>{ui("ui.components.SiteCompositionEditor.abb8fd53815a", "Selected item")}</span><h3>{focusedBlock.name || ui("ui.components.SiteCompositionEditor.c014c64b338c", "Unnamed item")}</h3></div><span className={focusedBlock.visible ? "cms-visibility is-visible" : "cms-visibility"}>{focusedBlock.visible ? ui("ui.components.SiteCompositionEditor.6ba2a0e0afd0", "Shown") : ui("ui.components.SiteCompositionEditor.7e6fefff0f0a", "Hidden")}</span></header>
                      <details className="cms-item-actions">
                        <summary>{ui("ui.components.SiteCompositionEditor.a145120d719e", "Item actions")}</summary>
                      <div className="cms-block-actions">
                        <button type="button" disabled={focusedBlockIndex === 0} onClick={() => reorderBlock(sectionIndex, focusedBlockIndex, focusedBlockIndex - 1)}><ArrowUp size={14} />{" "}{ui("ui.components.SiteCompositionEditor.c66feb5eb8f2", "Move up")}</button>
                        <button type="button" disabled={focusedBlockIndex === section.blocks.length - 1} onClick={() => reorderBlock(sectionIndex, focusedBlockIndex, focusedBlockIndex + 1)}><ArrowDown size={14} />{" "}{ui("ui.components.SiteCompositionEditor.40bb50da160c", "Move down")}</button>
                        <button type="button" onClick={() => duplicateBlock(sectionIndex, focusedBlockIndex)}><Copy size={14} />{" "}{ui("ui.components.SiteCompositionEditor.02cdaabfca80", "Duplicate")}</button>
                        <button type="button" onClick={() => updateBlock(sectionIndex, focusedBlockIndex, { visible: !focusedBlock.visible })}>{focusedBlock.visible ? <EyeOff size={14} /> : <Eye size={14} />} {focusedBlock.visible ? ui("ui.components.SiteCompositionEditor.ac20a57bfde0", "Hide") : ui("ui.components.SiteCompositionEditor.0df6f1cad36c", "Show")}</button>
                        <button type="button" className="is-danger" disabled={focusedBlock.protected || section.blocks.length <= 1} onClick={() => removeBlock(sectionIndex, focusedBlockIndex)}><Trash2 size={14} />{" "}{ui("ui.components.SiteCompositionEditor.c3812fc4acb8", "Remove")}</button>
                      </div>
                      </details>
                      <div className="cms-block-fields">
                        <label className={focusedError("name") ? "has-error" : ""} htmlFor={controlId(`${focusedBlockPath}.name`)}>{ui("ui.components.SiteCompositionEditor.70d5f430ca1e", "Item name")}<input id={controlId(`${focusedBlockPath}.name`)} value={focusedBlock.name} maxLength={80} aria-invalid={Boolean(focusedError("name"))} aria-describedby={focusedError("name") ? validationId(`${focusedBlockPath}.name`) : undefined} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { name: event.target.value })} />
                          {focusedError("name") ? <small id={validationId(`${focusedBlockPath}.name`)} className="cms-validation-error" role="alert">{focusedError("name")}</small> : null}
                        </label>
                        <label className={focusedError("icon") ? "has-error" : ""} htmlFor={controlId(`${focusedBlockPath}.icon`)}>{ui("ui.components.SiteCompositionEditor.b5a829ad13ef", "Approved icon")}<select id={controlId(`${focusedBlockPath}.icon`)} value={focusedBlock.icon || "help"} aria-invalid={Boolean(focusedError("icon"))} aria-describedby={focusedError("icon") ? validationId(`${focusedBlockPath}.icon`) : undefined} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { icon: event.target.value as EditorialBlock["icon"] })}>{editorialIconAllowlist.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select>
                          {focusedError("icon") ? <small id={validationId(`${focusedBlockPath}.icon`)} className="cms-validation-error" role="alert">{focusedError("icon")}</small> : null}
                        </label>
                        <label className={`is-wide${focusedError("title") ? " has-error" : ""}`} htmlFor={controlId(`${focusedBlockPath}.title`)}>{ui("ui.components.SiteCompositionEditor.7e8cd2056da7", "Title")}<input id={controlId(`${focusedBlockPath}.title`)} value={focusedBlock.title} maxLength={160} aria-invalid={Boolean(focusedError("title"))} aria-describedby={focusedError("title") ? validationId(`${focusedBlockPath}.title`) : undefined} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { title: event.target.value })} />
                          {focusedError("title") ? <small id={validationId(`${focusedBlockPath}.title`)} className="cms-validation-error" role="alert">{focusedError("title")}</small> : null}
                        </label>
                        <label className={`is-wide${focusedError("body") ? " has-error" : ""}`} htmlFor={controlId(`${focusedBlockPath}.body`)}>{ui("ui.components.SiteCompositionEditor.f96e28614336", "Supporting copy")}<textarea id={controlId(`${focusedBlockPath}.body`)} value={focusedBlock.body} rows={4} maxLength={1000} aria-invalid={Boolean(focusedError("body"))} aria-describedby={focusedError("body") ? validationId(`${focusedBlockPath}.body`) : undefined} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { body: event.target.value })} />
                          {focusedError("body") ? <small id={validationId(`${focusedBlockPath}.body`)} className="cms-validation-error" role="alert">{focusedError("body")}</small> : null}
                        </label>
                        {focusedBlock.label !== undefined ? <label className={focusedError("label") ? "has-error" : ""}>{ui("ui.components.SiteCompositionEditor.f21c1973ea84", "Label / price")}<input value={focusedBlock.label} maxLength={80} aria-invalid={Boolean(focusedError("label"))} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { label: event.target.value })} />{focusedError("label") ? <small className="cms-validation-error" role="alert">{focusedError("label")}</small> : null}</label> : null}
                        {focusedBlock.ctaLabel !== undefined || focusedBlock.ctaUrl !== undefined ? <>
                          <label className={focusedError("ctaLabel") ? "has-error" : ""}>{ui("ui.components.SiteCompositionEditor.57a9536e074b", "Button label")}<input value={focusedBlock.ctaLabel || ""} maxLength={80} aria-invalid={Boolean(focusedError("ctaLabel"))} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { ctaLabel: event.target.value })} />{focusedError("ctaLabel") ? <small className="cms-validation-error" role="alert">{focusedError("ctaLabel")}</small> : null}</label>
                          <label className={focusedError("ctaUrl") ? "has-error" : ""} htmlFor={controlId(`${focusedBlockPath}.ctaUrl`)}>{ui("ui.components.SiteCompositionEditor.594d5f2b982b", "CTA URL")}<input id={controlId(`${focusedBlockPath}.ctaUrl`)} value={focusedBlock.ctaUrl || ""} maxLength={300} aria-invalid={Boolean(focusedError("ctaUrl"))} aria-describedby={focusedError("ctaUrl") ? validationId(`${focusedBlockPath}.ctaUrl`) : undefined} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { ctaUrl: event.target.value })} />
                            {focusedError("ctaUrl") ? <small id={validationId(`${focusedBlockPath}.ctaUrl`)} className="cms-validation-error" role="alert">{focusedError("ctaUrl")}</small> : null}
                          </label>
                        </> : null}
                        {focusedBlock.items !== undefined ? <label className={`is-wide${focusedError("items") ? " has-error" : ""}`}>{ui("ui.components.SiteCompositionEditor.7fdd310bf84a", "List items")}<textarea value={focusedBlock.items.join("\n")} rows={4} aria-invalid={Boolean(focusedError("items"))} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { items: event.target.value.split("\n").slice(0, 20) })} /><small className={focusedError("items") ? "cms-validation-error" : undefined}>{focusedError("items") || ui("ui.components.SiteCompositionEditor.9b451cd0021d", "One item per line.")}</small></label> : null}
                      </div>
                  </section>
                ) : null}
              </div>
            ) : isOpen ? <p className="cms-section-empty">{ui("ui.components.SiteCompositionEditor.57677897bcd3", "This section uses the page's approved layout and copy fields.")}{" "}{section.locked ? ui("ui.components.SiteCompositionEditor.27b448e5215c", "This required section stays visible in its fixed position.") : ui("ui.components.SiteCompositionEditor.5ce4a28799d5", "You can still hide or reorder it.")}</p> : null}
          </article>
        )})}
      </div>
    </section>
  );
}
