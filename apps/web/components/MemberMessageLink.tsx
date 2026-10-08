import { MessageCircle } from "lucide-react";
import Link from "next/link";

export function MemberMessageLink({ handle, profileCode = "", transferId = "", label = "Message member", className = "button" }: {
  handle: string;
  profileCode?: string;
  transferId?: string;
  label?: string;
  className?: string;
}) {
  const query = new URLSearchParams({ member: handle });
  if (transferId) query.set("transfer", transferId);
  else if (profileCode) query.set("profile", profileCode);
  return <Link className={className} href={`/messages/new?${query.toString()}`}><MessageCircle size={16} aria-hidden="true" /> {label}</Link>;
}
