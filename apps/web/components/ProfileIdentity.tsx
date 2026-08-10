import type { ReactNode } from "react";

export type ProfileIdentityField = {
  label: "QRguitar ID" | "Make / Model" | "Serial Number" | "Year" | "Location" | "Type" | "Availability";
  value: string;
};

type ProfileIdentityValues = {
  qrGuitarId: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  showSerial?: boolean;
  noSerialNumber?: boolean;
  year?: string;
  location?: string;
  type?: string;
  availability?: "For Sale" | "Not for Sale" | string;
};

function clean(value?: string) {
  return String(value || "").trim();
}

export function buildProfileIdentityFields(values: ProfileIdentityValues): ProfileIdentityField[] {
  const makeModel = [clean(values.brand), clean(values.model)].filter(Boolean).join(" ");
  const serialValue = values.noSerialNumber
    ? "No serial number"
    : values.showSerial === false
      ? ""
      : clean(values.serialNumber);

  return [
    { label: "QRguitar ID", value: clean(values.qrGuitarId) },
    { label: "Make / Model", value: makeModel },
    { label: "Serial Number", value: serialValue },
    { label: "Year", value: clean(values.year) },
    { label: "Location", value: clean(values.location) },
    { label: "Type", value: clean(values.type) },
    { label: "Availability", value: clean(values.availability) }
  ].filter((field): field is ProfileIdentityField => Boolean(field.value));
}

export function ProfileIdentity({
  values,
  mediaSummary = "",
  excludeLabels = [],
  children
}: {
  values: ProfileIdentityValues;
  mediaSummary?: string;
  excludeLabels?: ProfileIdentityField["label"][];
  children?: ReactNode;
}) {
  const fields = buildProfileIdentityFields(values).filter((field) => !excludeLabels.includes(field.label));

  return (
    <section className="identity-card">
      <header className="identity-card-header">
        <span>Profile Identity</span>
        {mediaSummary ? <span className="identity-media-summary">{mediaSummary}</span> : null}
      </header>
      <div className="identity-grid">
        {fields.map((field) => (
          <div className="identity-cell" key={field.label}>
            <span>{field.label}</span>
            <strong>{field.value}</strong>
          </div>
        ))}
      </div>
      {children}
    </section>
  );
}
