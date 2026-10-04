
"use client";
import { useUiText } from "../../../components/UiTextProvider";
import type { ReactNode } from "react";
import { BrandLogo } from "../../../components/BrandLogo";
import type { PrintMode, PrintOrientation, PrintSize } from "../../../lib/print-layout";
import { hangTagSpecifications } from "../../../lib/print-layout";
import styles from "./print-document.module.css";

type Fact = [string, string];
type Service = { title: string; date: string; category: string; description: string; details: Fact[]; provenance: string };

type Props = {
  mode: PrintMode;
  size: PrintSize;
  orientation: PrintOrientation;
  theme: "light" | "dark";
  title: string;
  code: string;
  serial: string;
  facts: string[];
  details: Fact[];
  specifications: Fact[];
  timeline: string[];
  badges: ReactNode;
  photo: string;
  photoFit: "contain" | "cover";
  qrDataUrl: string;
  profileUrl: string;
  includeLogo: boolean;
  includeUrl: boolean;
  includeInstruction: boolean;
  scanInstruction: string;
  note: string;
  service: Service | null;
};

function Facts({ facts, expandLong = false }: { facts: Fact[]; expandLong?: boolean }) {
  return facts.length ? <dl className={styles.facts}>{facts.map(([label, value]) => <div key={label} className={expandLong && value.length > 72 ? styles.longFact : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null;
}

export function PrintDocument(props: Props) {
  const ui = useUiText("app.handout.code.PrintDocument");
  const { mode, title, code, serial, photo, profileUrl, service } = props;
  const qr = <img className={styles.qr} src={props.qrDataUrl || undefined} alt={ui("ui.app.handout.code.PrintDocument.94272b2b86d2", "QR code linking to {{value1}}", { value1: profileUrl })} />;
  const brand = props.includeLogo ? <span className={styles.brandPlate}><BrandLogo className={styles.logo} appearance={props.theme === "light" ? "paper" : "dark"} /></span> : <span />;
  const photograph = photo ? <div className={styles.photograph}><img src={photo} alt={title} style={{ objectFit: props.photoFit }} loading="eager" decoding="sync" /></div> : null;
  const identity: Fact[] = [["QRguitar ID", code], ...(serial ? [["Serial Number", serial] as Fact] : [])];
  const profileScan = <section className={styles.profileScan}>
    {qr}
    <div className={styles.profileScanCopy}>
      <span className={styles.sectionLabel}>{ui("ui.app.handout.code.PrintDocument.1081dbe09b14", "Permanent QRguitar Profile")}</span>
      {props.includeInstruction ? <><h3>{props.scanInstruction}</h3><p>{ui("ui.app.handout.code.PrintDocument.bddbc8638f57", "View Profile details, photographs, specifications and history.")}</p></> : null}
      {props.includeUrl ? <span className={styles.profileUrl}>{profileUrl}</span> : null}
      {props.includeInstruction ? <p className={styles.buyerGuidance}>{ui("ui.app.handout.code.PrintDocument.buyerRequest", "New owner? Scan, then choose Start ownership request on the Profile.")}</p> : null}
    </div>
  </section>;
  const serviceScan = <section className={`${styles.scan} ${styles.serviceScan}`}>
    {qr}<div><span className={styles.sectionLabel}>{ui("ui.app.handout.code.PrintDocument.7232f916051f", "Permanent service history")}</span>{props.includeInstruction ? <><h3>{ui("ui.app.handout.code.PrintDocument.0498504da58e", "Open the complete QRguitar Profile")}</h3><p>{ui("ui.app.handout.code.PrintDocument.1236999f1bfb", "Review photographs, specifications and approved service history.")}</p></> : null}{props.includeUrl ? <span>{profileUrl}</span> : null}</div>
  </section>;

  return <article
    id="qrguitar-print-root"
    data-print-document
    data-mode={mode}
    data-size={props.size}
    data-orientation={props.orientation}
    data-theme={props.theme}
    className={styles.document}
    aria-label={ui("ui.app.handout.code.PrintDocument.ebda169628a4", "Printable {{value1}} for {{value2}}", { value1: mode === "handout" ? "Profile sheet" : mode === "service" ? "service summary" : mode === "hangtag" ? "hang tag" : mode === "qr" ? "QR only" : "label", value2: title })}
  >
    {mode === "qr" ? <div className={styles.qrOnly}>{qr}</div> : mode === "label" ? <div className={styles.label}>
      <div className={styles.labelQr}>{qr}{props.includeInstruction ? <span>{ui("ui.app.handout.code.PrintDocument.8db3ef5c5d2f", "Scan Profile")}</span> : null}</div>
      <div className={styles.labelInfo}>{brand}<h2>{title}</h2><strong>{code}</strong>{serial ? <p>{ui("ui.app.handout.code.PrintDocument.1631e4a6b7d7", "Serial Number:")}{" "}{serial}</p> : null}{props.includeUrl ? <span>{profileUrl}</span> : null}</div>
    </div> : mode === "hangtag" ? <div className={styles.tag} data-has-photo={Boolean(photo)}>
      <header className={styles.tagHeader}>{brand}<strong>{code}</strong></header>
      {photograph ? <div className={styles.tagPhoto}>{photograph}</div> : null}
      <section className={styles.tagIdentity}><span className={styles.sectionLabel}>{ui("ui.app.handout.code.PrintDocument.4538b821a0d6", "QRguitar Profile")}</span><h2>{title}</h2><p>{props.facts.join(" / ")}</p>{props.badges}</section>
      <section className={styles.tagMeta}><Facts facts={[...identity, ...props.details, ...hangTagSpecifications(props.specifications)].slice(0, 9)} /><div className={styles.tagQr}>{qr}{props.includeInstruction ? <span>{ui("ui.app.handout.code.PrintDocument.8db3ef5c5d2f", "Scan Profile")}</span> : null}</div></section>
      {props.note ? <p className={styles.tagNote}>{props.note}</p> : null}
      <footer className={styles.tagFooter}>{props.includeUrl ? <span>{profileUrl}</span> : null}<span>{ui("ui.app.handout.code.PrintDocument.1a719f6a72dd", "qrguitar.com")}</span></footer>
    </div> : <div className={`${styles.sheet} ${mode === "service" ? styles.serviceSheet : ""}`}>
      <header className={`${styles.header} ${mode === "handout" ? styles.profileHeader : styles.serviceHeader}`}>
        {brand}
        {mode === "handout" ? <div className={styles.documentMeta}><span>{ui("ui.app.handout.code.PrintDocument.a6c8f92c19f4", "QRguitar ID")}</span><strong>{code}</strong></div> : <div className={styles.documentMeta}><span>{ui("ui.app.handout.code.PrintDocument.a734981c99b6", "Service history")}</span><strong>{ui("ui.app.handout.code.PrintDocument.ce86d91e272a", "Service Summary")}</strong></div>}
      </header>
      <section className={mode === "service" ? styles.serviceIdentity : styles.identity} data-has-photo={Boolean(photo)}>
        {mode === "service" ? photograph : null}
        <div>{mode === "handout" ? <span className={styles.identityEyebrow}>{ui("ui.app.handout.code.PrintDocument.3ec29e5e7860", "Registered Profile")}</span> : <span className={styles.identityEyebrow}>{ui("ui.app.handout.code.PrintDocument.d696a35bdd18", "Profile")}</span>}<h2>{title}</h2><p className={styles.primaryFacts}>{props.facts.join(" / ")}</p>{props.badges}{mode === "service" ? <Facts facts={[...identity, ...props.details]} /> : null}</div>
      </section>
      {mode === "handout" ? <div className={styles.profileBody} data-has-photo={Boolean(photo)} data-density={props.specifications.length + props.details.length > 9 || [...props.specifications, ...props.details].some(([, value]) => value.length > 100) ? "compact" : "comfortable"}>
        {photograph ? <div className={styles.profilePhoto}>{photograph}</div> : null}
        <aside className={styles.profileDetails}>
          {serial ? <section className={styles.profileIdentity} aria-label={ui("ui.app.handout.code.PrintDocument.9b7e3e571ecb", "Profile identity")}>
            <Facts facts={[[ui("ui.app.handout.code.PrintDocument.14b1b3c5b151", "Serial Number"), serial]]} />
          </section> : null}
          {props.details.length ? <section className={styles.detailGroup} aria-label={ui("ui.app.handout.code.PrintDocument.73949bb1bdba", "Profile details")}><Facts facts={props.details} /></section> : null}
          {props.specifications.length ? <section className={`${styles.profileSpecifications} ${styles.detailGroup}`} aria-label={ui("ui.app.handout.code.PrintDocument.b70ec7c6b4ce", "Profile specifications")}><h3>{ui("ui.app.handout.code.PrintDocument.015b4e0a76e5", "Specifications")}</h3><Facts facts={props.specifications} expandLong /></section> : null}
        </aside>
      </div> : null}
      {mode === "handout" ? profileScan : null}
      {mode === "service" && service ? <section className={styles.service}>
        <header><div><span>{service.category}</span><h3>{service.title}</h3></div><time>{service.date}</time></header>
        <section className={styles.serviceWork} aria-label={ui("ui.app.handout.code.PrintDocument.a303b38a9485", "Work performed")}>
          <span>{ui("ui.app.handout.code.PrintDocument.a303b38a9485", "Work performed")}</span>
          {service.description ? <p>{service.description}</p> : <p>{ui("ui.app.handout.code.PrintDocument.f29bf8bd83f2", "Recorded service event.")}</p>}
          <Facts facts={service.details} />
        </section>
        <section className={styles.serviceNotes} aria-label={ui("ui.app.handout.code.PrintDocument.3929e139c666", "Service notes")}>
          <span>{ui("ui.app.handout.code.PrintDocument.19a60e95bdbe", "Technician / shop notes")}</span>
          {props.note ? <p>{props.note}</p> : <div className={styles.noteLines} aria-hidden="true"><i /><i /><i /><i /></div>}
        </section>
        <div className={styles.provenance}><span>{ui("ui.app.handout.code.PrintDocument.6a0e15d298c4", "Record provenance")}</span><p>{service.provenance}</p></div>
      </section> : null}
      {props.timeline.length ? <section className={styles.timeline} aria-label={ui("ui.app.handout.code.PrintDocument.aba8db7131dc", "Recent history")}><h3>{ui("ui.app.handout.code.PrintDocument.aba8db7131dc", "Recent history")}</h3>{props.timeline.map((entry, index) => <p key={index}>{entry}</p>)}</section> : null}
      {mode === "service" ? serviceScan : null}
      {props.note && mode !== "service" ? <section className={styles.note}><p>{props.note}</p></section> : null}
      <footer className={styles.sheetFooter}><span>{mode === "service" ? ui("ui.app.handout.code.PrintDocument.serviceEvidenceNotice", "Unshared documents and internal notes are not included.") : ui("ui.app.handout.code.PrintDocument.6af5e1108227", "Keep this sheet with the gear.")}</span><span>{ui("ui.app.handout.code.PrintDocument.1a719f6a72dd", "qrguitar.com")}</span></footer>
    </div>}
  </article>;
}
