import type { AnchorHTMLAttributes } from "react";

/**
 * Plain document navigation between the app sections. vinext's next/link client
 * router throws on these routes ("e is not a function"), so links did nothing.
 */
export default function NavLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}
