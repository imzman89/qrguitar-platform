import { MessageCircle } from "lucide-react";
import Link from "next/link";

export function MemberMessageLink({ handle, profileCode = "", label = "Message member", className = "button" }: {
  handle: string;
  profileCode?: string;
  label?: string;
  className?: string;
}) {
  const query = new URLSearchParams({ member: handle });
  if (profileCode) query.set("profile", profileCode);
  return <Link className={className} href={`/messages/new?${query.toString()}`}><MessageCircle size={16} aria-hidden="true" /> {label}</Link>;
}
