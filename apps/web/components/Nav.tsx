import Link from "next/link";

export function Nav() {
  return (
    <header className="shell nav">
      <Link className="brand" href="/">
        <span>QR</span><span>guitar</span>
      </Link>
      <nav className="nav-links" aria-label="Primary navigation">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/catalog">Catalog</Link>
        <Link href="/create">Create</Link>
        <Link href="/site-editor">Site Editor</Link>
        <Link href="/i/QRG-PI260001">Demo Profile</Link>
        <Link href="/login">Login</Link>
      </nav>
    </header>
  );
}
