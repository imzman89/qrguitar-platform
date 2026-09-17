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
  note: string;
  service: Service | null;
};

function Facts({ facts }: { facts: Fact[] }) {
  return facts.length ? <dl className={styles.facts}>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null;
}

export function PrintDocument(props: Props) {
  const { mode, title, code, serial, photo, profileUrl, service } = props;
  const qr = <img className={styles.qr} src={props.qrDataUrl || undefined} alt={`QR code linking to ${profileUrl}`} />;
  const brand = props.includeLogo ? <span className={styles.brandPlate}><BrandLogo className={styles.logo} /></span> : <span />;
  const photograph = photo ? <div className={styles.photograph}><img src={photo} alt={title} style={{ objectFit: props.photoFit }} loading="eager" decoding="sync" /></div> : null;
  const identity: Fact[] = [["QRguitar ID", code], ...(serial ? [["Serial Number", serial] as Fact] : [])];
  const footer = <footer className={styles.footer}>{props.note ? <p>{props.note}</p> : null}{props.includeUrl ? <span>{profileUrl}</span> : null}</footer>;
  const scan = <section className={styles.scan}>
    {qr}<div>{props.includeInstruction ? <><h3>Scan to open this Profile</h3><p>Photos, specifications and instrument history.</p></> : null}{props.includeUrl ? <span>{profileUrl}</span> : null}</div>
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
      {qr}
      <div className={styles.labelInfo}>{brand}<h2>{title}</h2><strong>{code}</strong>{serial ? <p>Serial Number: {serial}</p> : null}{props.includeInstruction ? <p>Scan the instrument Profile</p> : null}{props.includeUrl ? <span>{profileUrl}</span> : null}</div>
    </div> : mode === "hangtag" ? <div className={styles.tag}>
      <header className={styles.header}>{brand}<span>QRguitar Profile</span></header>
      {photograph}
      <section className={styles.tagIdentity}><div><h2>{title}</h2><p>{props.facts.join(" / ")}</p>{props.badges}</div>{qr}</section>
      <Facts facts={[...identity, ...props.details]} />
      {props.includeInstruction ? <p className={styles.instruction}>Scan for photos, specifications and history.</p> : null}
      {footer}
    </div> : <div className={styles.sheet}>
      <header className={styles.header}>{brand}<span>{mode === "service" ? "Service summary" : "QRguitar Profile"}</span></header>
      <section className={mode === "service" ? styles.serviceIdentity : styles.identity}>
        {mode === "service" ? photograph : null}
        <div><h2>{title}</h2><p className={styles.primaryFacts}>{props.facts.join(" / ")}</p>{props.badges}</div>
      </section>
      {mode === "handout" ? <div className={styles.profileBody} data-has-photo={Boolean(photo)}>
        {photograph}
        <aside className={styles.profileDetails}>
          <Facts facts={[...identity, ...props.details]} />
          {props.specifications.length ? <section className={styles.specifications} aria-label="Profile specifications"><Facts facts={props.specifications} /></section> : null}
          {scan}
        </aside>
      </div> : <Facts facts={[...identity, ...props.details]} />}
      {mode === "service" && service ? <section className={styles.service}>
        <header><div><span>{service.category}</span><h3>{service.title}</h3></div><span>{service.date}</span></header>
        {service.description ? <p>{service.description}</p> : null}
        <Facts facts={service.details} />
        <p className={styles.provenance}>{service.provenance}</p>
      </section> : null}
      {mode === "service" && props.specifications.length ? <section className={styles.specifications} aria-label="Profile specifications"><Facts facts={props.specifications} /></section> : null}
      {props.timeline.length ? <section className={styles.timeline} aria-label="Recent history"><h3>Recent history</h3>{props.timeline.map((entry, index) => <p key={index}>{entry}</p>)}</section> : null}
      {mode === "service" ? scan : null}
      {props.note ? <section className={styles.note}><p>{props.note}</p></section> : null}
      <footer className={styles.sheetFooter}><span>{mode === "service" ? "Private evidence and internal notes are not included." : "Keep this sheet with the instrument."}</span><span>qrguitar.com</span></footer>
    </div>}
  </article>;
}
