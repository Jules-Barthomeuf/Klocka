import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { IMG, LOGIN_URL } from "@/lib/format";

export const LOGO = IMG + "4c33bb9a6_Screenshot2026-09-29at174111.png";

const LINKS = [
  ["Investir", "/"],
  ["Équipe", "/equipe"],
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06]"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="relative flex items-center justify-between px-6 md:px-[44px] py-[22px] md:py-[26px]">
        <Link to="/" onClick={() => setOpen(false)} className="shrink-0">
          <img src={LOGO} alt="Klocka" loading="eager" className="h-[18px] w-auto bg-transparent border-0 p-0" style={{ mixBlendMode: "lighten" }} />
        </Link>
        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-[38px]">
          {LINKS.map(([label, to]) => (
            <Link key={to} to={to} className="text-[15px] text-white/[0.86] hover:text-k-sage transition-colors duration-300">
              {label}
            </Link>
          ))}
        </div>
        <a href={LOGIN_URL} className="k-btn-secondary hidden md:inline-flex !px-[22px] !py-[10px] !text-[14.5px]">
          Se connecter
        </a>
        <button className="md:hidden text-white" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden px-6 pb-8 flex flex-col gap-5">
          {LINKS.map(([label, to]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className="text-lg text-white/90">
              {label}
            </Link>
          ))}
          <a href={LOGIN_URL} className="k-btn-secondary self-start">Se connecter</a>
        </div>
      )}
    </nav>
  );
}
