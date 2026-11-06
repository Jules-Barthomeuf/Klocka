import { Link } from "react-router-dom";
import { LOGO } from "./SiteNav";

const NAV = [["Investir", "/"], ["Équipe", "/equipe"]];
const LEGAL = [
  ["Mentions légales", "/legal#mentions"],
  ["Politique de confidentialité", "/legal#confidentialite"],
  ["CGU", "/legal#cgu"],
  ["Cookies", "/legal#cookies"],
];

function Col({ title, children }) {
  return (
    <div>
      <p className="k-label mb-5">{title}</p>
      <div className="flex flex-col gap-3 text-[15px] text-k-t2">{children}</div>
    </div>
  );
}

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.08] px-[6vw] pt-20 pb-10">
      <div className="max-w-[1500px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1">
          <img src={LOGO} alt="Klocka" className="h-[26px] w-auto" style={{ mixBlendMode: "screen" }} />
          <p className="mt-5 text-[15px] text-k-t3 max-w-[28ch]">Acquisition de murs commerciaux loués partout en France.</p>
        </div>
        <Col title="Navigation">
          {NAV.map(([l, to]) => <Link key={to} to={to} className="hover:text-k-sage transition-colors">{l}</Link>)}
        </Col>
        <Col title="Légal">
          {LEGAL.map(([l, to]) => <Link key={to} to={to} className="hover:text-k-sage transition-colors">{l}</Link>)}
        </Col>
        <Col title="Contact">
          <a href="mailto:contact@klocka.immo" className="hover:text-k-sage transition-colors">contact@klocka.immo</a>
          <a href="https://www.linkedin.com/company/klocka" target="_blank" rel="noopener noreferrer" className="hover:text-k-sage transition-colors">LinkedIn</a>
        </Col>
      </div>
      <div className="max-w-[1500px] mx-auto mt-16 pt-6 border-t border-white/[0.06] flex flex-col md:flex-row justify-between gap-3 text-[13px] text-k-dim">
        <p>© Klocka 2026. Tous droits réservés.</p>
        <p>Les performances passées ne préjugent pas des performances futures.</p>
      </div>
    </footer>
  );
}
