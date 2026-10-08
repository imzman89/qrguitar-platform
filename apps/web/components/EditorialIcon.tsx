import {
  CircleHelp,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  Link as LinkIcon,
  QrCode,
  Repeat2,
  ShieldCheck,
  Store,
  Wrench
} from "lucide-react";
import type { EditorialIcon as EditorialIconName } from "../lib/site-settings";

const icons = {
  qr: QrCode,
  history: History,
  photo: ImageIcon,
  shield: ShieldCheck,
  store: Store,
  wrench: Wrench,
  transfer: Repeat2,
  document: FileText,
  eye: Eye,
  help: CircleHelp,
  link: LinkIcon
};

export function EditorialIcon({ name = "help", size = 20 }: { name?: EditorialIconName; size?: number }) {
  const Icon = icons[name] || CircleHelp;
  return <Icon size={size} aria-hidden="true" />;
}
