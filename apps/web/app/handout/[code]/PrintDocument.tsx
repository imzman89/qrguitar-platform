import type { ReactNode } from "react";
import { BrandLogo } from "../../../components/BrandLogo";
import type { PrintMode, PrintOrientation, PrintSize } from "../../../lib/print-layout";
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

function Facts({ facts }: { facts: Fact[] }) {
  return facts.length ? <dl className={styles.facts}>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null;
}

export function PrintDocument(props: Props) {
  const { mode, title, code, serial, photo, profileUrl, service } = props;
  const qr = <img className={styles.qr} src={props.qrDataUrl || undefined} alt={`QR code linking to ${profileUrl}`} />;
  const brand = props.includeLogo ? <span className={styles.brandPlate}><BrandLogo className={styles.logo} appearance={props.theme === "light" ? "paper" : "dark"} /></span> : <span />;
  const photograph = photo ? <div className={styles.photograph}><img src={photo} alt={title} style={{ objectFit: props.photoFit }} loading="eager" decoding="sync" /></div> : null;
  const identity: Fact[] = [["QRguitar ID", code], ...(serial ? [["Serial Number", serial] as Fact] : [])];
  const profileScan = <section className={styles.profileScan}>
    {qr}
    <div className={styles.profileScanCopy}>
      <span className={styles.sectionLabel}>Permanent QRguitar Profile</span>
      {props.includeInstruction ? <><h3>{props.scanInstruction}</h3><p>View Profile details, photographs, specifications and history.</p></> : null}
      {props.includeUrl ? <span className={styles.profileUrl}>{profileUrl}</span> : null}
    </div>
  </section>;
  const serviceScan = <section className={`${styles.scan} ${styles.serviceScan}`}>
    {qr}<div><span className={styles.sectionLabel}>Permanent service history</span>{props.includeInstruction ? <><h3>Open the complete QRguitar Profile</h3><p>Review photographs, specifications and approved service history.</p></> : null}{props.includeUrl ? <span>{profileUrl}</span> : null}</div>
  </section>;

  return <article
    id="qrguitar-print-root"
    data-print-document
    data-mode={mode}
    data-size={props.size}
    data-orientation={props.orientation}
    data-theme={props.theme}
    className={styles.document}
    aria-label={`Printable ${mode === "handout" ? "customer handout" : mode === "service" ? "service summary" : mode === "hangtag" ? "display card" : "QR label"} for ${title}`}
  >
    {mode === "label" ? <div className={styles.label}>
      <div className={styles.labelQr}>{qr}{props.includeInstruction ? <span>Scan Profile</span> : null}</div>
      <div className={styles.labelInfo}>{brand}<h2>{title}</h2><strong>{code}</strong>{serial ? <p>Serial Number: {serial}</p> : null}{props.includeUrl ? <span>{profileUrl}</span> : null}</div>
    </div> : mode === "hangtag" ? <div className={styles.tag}>
      <header className={styles.tagHeader}>{brand}<strong>{code}</strong></header>
      {photograph ? <div className={styles.tagPhoto}>{photograph}</div> : null}
      <section className={styles.tagIdentity}><span className={styles.sectionLabel}>QRguitar Profile</span><h2>{title}</h2><p>{props.facts.join(" / ")}</p>{props.badges}</section>
      <section className={styles.tagMeta}><Facts facts={[...identity, ...props.details].slice(0, 6)} /><div className={styles.tagQr}>{qr}{props.includeInstruction ? <span>Scan Profile</span> : null}</div></section>
      {props.note ? <p className={styles.tagNote}>{props.note}</p> : null}
      <footer className={styles.tagFooter}>{props.includeUrl ? <span>{profileUrl}</span> : null}<span>qrguitar.com</span></footer>
    </div> : <div className={`${styles.sheet} ${mode === "service" ? styles.serviceSheet : ""}`}>
      <header className={`${styles.header} ${mode === "handout" ? styles.profileHeader : styles.serviceHeader}`}>
        {brand}
        {mode === "handout" ? <div className={styles.documentMeta}><span>QRguitar Profile</span><strong>Permanent identity</strong></div> : <div className={styles.documentMeta}><span>Service history</span><strong>Service Summary</strong></div>}
      </header>
      <section className={mode === "service" ? styles.serviceIdentity : styles.identity}>
        {mode === "service" ? photograph : null}
        <div>{mode === "handout" ? <span className={styles.identityEyebrow}>Registered Profile</span> : <span className={styles.identityEyebrow}>Profile</span>}<h2>{title}</h2><p className={styles.primaryFacts}>{props.facts.join(" / ")}</p>{props.badges}{mode === "service" ? <Facts facts={[...identity, ...props.details]} /> : null}</div>
      </section>
      {mode === "handout" ? <div className={styles.profileBody} data-has-photo={Boolean(photo)}>
        {photograph ? <div className={styles.profilePhoto}>{photograph}</div> : null}
        <aside className={styles.profileDetails}>
          <section className={styles.profileIdentity} aria-label="Profile identity">
            <span className={styles.sectionLabel}>QRguitar ID</span>
            <strong>{code}</strong>
            {serial ? <div><span>Serial Number</span><b>{serial}</b></div> : null}
          </section>
          {props.details.length ? <section className={styles.detailGroup} aria-label="Profile details"><h3>Profile details</h3><Facts facts={props.details} /></section> : null}
          {props.specifications.length ? <section className={`${styles.specifications} ${styles.detailGroup}`} aria-label="Profile specifications"><h3>Specifications</h3><Facts facts={props.specifications} /></section> : null}
        </aside>
      </div> : null}
      {mode === "handout" ? profileScan : null}
      {mode === "service" && service ? <section className={styles.service}>
        <header><div><span>{service.category}</span><h3>{service.title}</h3></div><time>{service.date}</time></header>
        <section className={styles.serviceWork} aria-label="Work performed">
          <span>Work performed</span>
          {service.description ? <p>{service.description}</p> : <p>Recorded service event.</p>}
          <Facts facts={service.details} />
        </section>
        <section className={styles.serviceNotes} aria-label="Service notes">
          <span>Technician / shop notes</span>
          {props.note ? <p>{props.note}</p> : <div className={styles.noteLines} aria-hidden="true"><i /><i /><i /><i /></div>}
        </section>
        <div className={styles.provenance}><span>Record provenance</span><p>{service.provenance}</p></div>
      </section> : null}
      {props.timeline.length ? <section className={styles.timeline} aria-label="Recent history"><h3>Recent history</h3>{props.timeline.map((entry, index) => <p key={index}>{entry}</p>)}</section> : null}
      {mode === "service" ? serviceScan : null}
      {props.note && mode !== "service" ? <section className={styles.note}><p>{props.note}</p></section> : null}
      <footer className={styles.sheetFooter}><span>{mode === "service" ? "Private evidence and internal notes are not included." : "Keep this sheet with the gear."}</span><span>qrguitar.com</span></footer>
    </div>}
  </article>;
}
