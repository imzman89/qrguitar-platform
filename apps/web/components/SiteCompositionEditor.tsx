"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
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

export function SiteCompositionEditor({ pageKey, sections, onChange }: Props) {
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
    if (!section || (kind === "section" && (section.locked || event.target !== event.currentTarget))) return;
    const payload = JSON.stringify({ pageKey, sectionId, blockId, sequence: ++dragSequence.current });
    drag.current = { kind, pageKey, sectionId, blockId, sections, payload };
    event.dataTransfer.setData(dragMimeTypes[kind], payload);
    event.dataTransfer.effectAllowed = "move";
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
    <section className="cms-field-group cms-composition-editor">
      <header>
        <div><span>Page sections</span><h2>Arrange {editorialPageLabels[pageKey]}</h2></div>
        <span>{sections.length} sections</span>
      </header>
      <p className="cms-section-intro">Choose a section to manage its content. Drag to reorder, or use the arrow controls for precise placement.</p>
      <div className="cms-section-stack">
        {sections.map((section, sectionIndex) => {
          const isOpen = section.id === openSectionId;
          const focusedBlockIndex = Math.max(0, section.blocks.findIndex((block) => block.id === focusedBlockId));
          const focusedBlock = section.blocks[focusedBlockIndex];
          return (
          <article
            className={`${section.visible ? "cms-section-editor" : "cms-section-editor is-hidden"}${isOpen ? " is-open" : ""}`}
            key={section.id}
            draggable={!section.locked}
            onDragStart={(event) => beginDrag(event, section.id)}
            onDragEnd={() => { drag.current = null; }}
            onDragOver={(event) => dragOver(event, "section", section)}
            onDrop={(event) => drop(event, "section", sectionIndex)}
          >
            <div className="cms-section-editor-head">
              <button
                type="button"
                className="cms-section-open"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenSectionId(isOpen ? "" : section.id);
                  if (!focusedBlockId && section.blocks[0]) setFocusedBlockId(section.blocks[0].id);
                }}
              >
                <GripVertical aria-hidden="true" className={section.locked ? "is-locked" : ""} size={18} />
                <span><strong>{section.name}</strong><small>{section.blocks.length ? `${section.blocks.length} content ${section.blocks.length === 1 ? "item" : "items"}` : "Page copy and layout"}</small></span>
                <span className={section.visible ? "cms-visibility is-visible" : "cms-visibility"}>{section.visible ? "Shown" : "Hidden"}</span>
                <ChevronDown className={isOpen ? "is-open" : ""} size={17} />
              </button>
              <div className="cms-order-actions">
                <button type="button" aria-label={`Move ${section.name} up`} disabled={section.locked || sectionIndex === 0 || sections[sectionIndex - 1]?.locked} onClick={() => reorderSection(sectionIndex, sectionIndex - 1)}><ArrowUp size={15} /></button>
                <button type="button" aria-label={`Move ${section.name} down`} disabled={section.locked || sectionIndex === sections.length - 1 || sections[sectionIndex + 1]?.locked} onClick={() => reorderSection(sectionIndex, sectionIndex + 1)}><ArrowDown size={15} /></button>
                <button type="button" className="cms-icon-text-control" disabled={section.locked} onClick={() => updateSection(sectionIndex, { visible: !section.visible })}>{section.visible ? <EyeOff size={14} /> : <Eye size={14} />}{section.locked ? "Required" : section.visible ? "Hide" : "Show"}</button>
                <button type="button" aria-label={`Reset ${section.name}`} onClick={() => resetSection(sectionIndex)}><RotateCcw size={15} /></button>
              </div>
            </div>

            {isOpen && section.blocks.length ? (
              <div className="cms-block-focus-layout">
                <div className="cms-block-list" role="list" aria-label={`${section.name} content items`}>
                  {section.blocks.map((block, blockIndex) => (
                  <button
                    type="button"
                    className={`${block.visible ? "cms-block-row" : "cms-block-row is-hidden"}${focusedBlock?.id === block.id ? " is-active" : ""}`}
                    key={block.id}
                    draggable
                    onDragStart={(event) => beginDrag(event, section.id, block.id)}
                    onDragEnd={() => { drag.current = null; }}
                    onDragOver={(event) => dragOver(event, "block", section)}
                    onDrop={(event) => drop(event, "block", sectionIndex, blockIndex)}
                    onClick={() => setFocusedBlockId(block.id)}
                  >
                    <GripVertical size={15} aria-hidden="true" />
                    <span><strong>{block.name}</strong><small>{block.title}</small></span>
                    <em>{block.visible ? "Shown" : "Hidden"}</em>
                  </button>
                ))}
                  <button type="button" className="cms-add-block" disabled={section.blocks.length >= 12} onClick={() => addBlock(sectionIndex)}><Plus size={15} /> Add item</button>
                </div>
                {focusedBlock ? (
                  <section className="cms-focused-block" aria-label={`Edit ${focusedBlock.name}`}>
                    <header><div><span>Selected item</span><h3>{focusedBlock.name}</h3></div><span className={focusedBlock.visible ? "cms-visibility is-visible" : "cms-visibility"}>{focusedBlock.visible ? "Shown" : "Hidden"}</span></header>
                      <div className="cms-block-actions">
                        <button type="button" disabled={focusedBlockIndex === 0} onClick={() => reorderBlock(sectionIndex, focusedBlockIndex, focusedBlockIndex - 1)}><ArrowUp size={14} /> Move up</button>
                        <button type="button" disabled={focusedBlockIndex === section.blocks.length - 1} onClick={() => reorderBlock(sectionIndex, focusedBlockIndex, focusedBlockIndex + 1)}><ArrowDown size={14} /> Move down</button>
                        <button type="button" onClick={() => duplicateBlock(sectionIndex, focusedBlockIndex)}><Copy size={14} /> Duplicate</button>
                        <button type="button" onClick={() => updateBlock(sectionIndex, focusedBlockIndex, { visible: !focusedBlock.visible })}>{focusedBlock.visible ? <EyeOff size={14} /> : <Eye size={14} />} {focusedBlock.visible ? "Hide" : "Show"}</button>
                        <button type="button" className="is-danger" disabled={focusedBlock.protected || section.blocks.length <= 1} onClick={() => removeBlock(sectionIndex, focusedBlockIndex)}><Trash2 size={14} /> Remove</button>
                      </div>
                      <div className="cms-block-fields">
                        <label>Item name<input value={focusedBlock.name} maxLength={80} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { name: event.target.value })} /></label>
                        <label>Approved icon<select value={focusedBlock.icon || "help"} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { icon: event.target.value as EditorialBlock["icon"] })}>{editorialIconAllowlist.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label>
                        <label className="is-wide">Title<input value={focusedBlock.title} maxLength={160} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { title: event.target.value })} /></label>
                        <label className="is-wide">Supporting copy<textarea value={focusedBlock.body} rows={4} maxLength={1000} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { body: event.target.value })} /></label>
                        {focusedBlock.label !== undefined ? <label>Label / price<input value={focusedBlock.label} maxLength={80} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { label: event.target.value })} /></label> : null}
                        {focusedBlock.ctaLabel !== undefined || focusedBlock.ctaUrl !== undefined ? <>
                          <label>Button label<input value={focusedBlock.ctaLabel || ""} maxLength={80} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { ctaLabel: event.target.value })} /></label>
                          <label>CTA URL<input value={focusedBlock.ctaUrl || ""} maxLength={300} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { ctaUrl: event.target.value })} /></label>
                        </> : null}
                        {focusedBlock.items !== undefined ? <label className="is-wide">List items<textarea value={focusedBlock.items.join("\n")} rows={4} onChange={(event) => updateBlock(sectionIndex, focusedBlockIndex, { items: event.target.value.split("\n").slice(0, 20) })} /><small>One item per line.</small></label> : null}
                      </div>
                  </section>
                ) : null}
              </div>
            ) : isOpen ? <p className="cms-section-empty">This section uses the page&apos;s approved layout and copy fields. {section.locked ? "This required section stays visible in its fixed position." : "You can still hide or reorder it."}</p> : null}
          </article>
        )})}
      </div>
    </section>
  );
}
