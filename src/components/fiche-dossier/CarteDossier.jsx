import React, { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, Users } from "lucide-react";
import { dateCourte } from "@/lib/fiche-dossier";

// La carte d'un dossier, onglet Personnes (20 nov. 2026, Jules, maquette « MACSF ») : le dossier dans un grand rond au
// milieu ; côté vente à gauche, les vendeurs et l'agent ; côté achat à droite, chaque client à qui on l'a présenté (un
// rond en tirets s'il ne poursuit pas) et un rond pointillé « Autre client » ; des traits fins vers le centre. Dessous,
// le compte (« 3 personnes · 1 offre refusée · 0 client positionné ») et « Présenter à un autre client », qui prépare
// une note liée au dossier dans le chat. Un clic sur l'agent ou un client ouvre sa fiche.

export const POSITION = {
  offre: { libelle: "Offre", couleur: "--k-statut-menthe-rgb" },
  signe: { libelle: "Signé", couleur: "--k-statut-menthe-rgb" },
  positionne: { libelle: "Positionné", couleur: "--k-statut-lavande-rgb" },
  interesse: { libelle: "Positionné", couleur: "--k-statut-lavande-rgb" },
  visio: { libelle: "Visio faite", couleur: "--k-statut-ambre-rgb" },
  presente: { libelle: "Présenté", couleur: null },
  abandon: { libelle: "Pas poursuivi", couleur: null, tirets: true },
};
const rgb = (v, a = 1) => `rgb(var(${v}) / ${a})`;
const initiales = (n) => String(n || "?").replace(/^\(test\)\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const pluriel = (n, un, plus = `${un}s`) => `${n} ${n > 1 ? plus : un}`;

const ROND = 56;
const CENTRE = 104;
const LABEL = 180;

/** Les angles (en degrés) de `n` ronds répartis entre `de` et `a`. */
const angles = (n, de, a) => (n <= 1 ? [(de + a) / 2] : Array.from({ length: n }, (_, i) => de + ((a - de) * i) / (n - 1)));

function Rond({ n, i, fixe }) {
  const Corps = n.onClick ? "button" : "div";
  const dessus = n.labelDessus;
  const label = (n.nom || n.sous) && (
    <span className={`pointer-events-none absolute left-1/2 block -translate-x-1/2 text-center ${dessus ? "bottom-full mb-2" : "top-full mt-2"}`} style={{ width: LABEL }}>
      {n.nom && <span className={`block truncate text-[14.5px] leading-[1.3] ${n.eteint ? "text-craie" : "text-encre"}`}>{n.nom}</span>}
      {n.sous && <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-[1.3] text-ardoise">{n.sous}</span>}
    </span>
  );
  return (
    <motion.div className="absolute" style={{ left: n.x - n.d / 2, top: n.y - n.d / 2, width: n.d, height: n.d }}
      initial={fixe ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.08 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}>
      {label}
      <Corps type={n.onClick ? "button" : undefined} onClick={n.onClick || undefined} aria-label={n.aria || undefined}
        className={`grid h-full w-full place-items-center rounded-full text-craie transition-[transform,border-color] duration-300 ease-out ${n.onClick ? "hover:-translate-y-px hover:border-bord-vif" : ""} ${n.centre ? "border-[1.5px] px-3 text-center text-encre" : "border-[1.5px]"}`}
        style={{ background: "transparent", borderColor: n.bord || "var(--k-bord-vif)", borderStyle: n.style || "solid" }}>
        {n.contenu}
      </Corps>
    </motion.div>
  );
}

/**
 * @param {{ carte: { dossier: object, vendeur: string|null, agents: object[], clients: object[] }, onOuvrir?: (cle: string) => void }} props
 */
export default function CarteDossier({ carte, onOuvrir }) {
  const fixe = useReducedMotion();
  const boite = useRef(null);
  const [W, setW] = useState(0);
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    const mesurer = () => setW(el.clientWidth);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!carte) return null;

  const presenter = () => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte: `J'ai présenté ${carte.dossier.nom} à `, liens: [{ cle: carte.dossier.cle, nom: carte.dossier.nom }] } }));

  const largeur = Math.max(320, W || 560);
  const R = Math.min(largeur * 0.37, 210);
  const c = { x: largeur / 2, y: 0 };
  const place = (a, r) => ({ x: c.x + r * Math.cos((a * Math.PI) / 180), y: c.y - r * Math.sin((a * Math.PI) / 180) });

  // Côté vente : les vendeurs en bas, l'agent au-dessus ; côté achat : les clients, puis « Autre client ».
  const gauche = [
    { cle: "vendeurs", nom: carte.vendeur || "Vendeurs", sous: carte.vendeur ? "Vendeur" : null, contenu: <Users className="h-5 w-5" strokeWidth={1.6} /> },
    ...carte.agents.map((a) => ({ cle: a.cle, nom: a.nom, sous: "Agent", contenu: <span className="text-[14px] tracking-[.02em]">{initiales(a.nom)}</span>, onClick: onOuvrir ? () => onOuvrir(a.cle) : null, aria: `Ouvrir la fiche de ${a.nom}` })),
  ];
  const droite = [
    ...carte.clients.map((x) => {
      const p = POSITION[x.position] || POSITION.presente;
      const etat = x.position === "offre" && x.detail ? `Offre ${x.detail}` : x.detail ? `${x.detail.charAt(0).toUpperCase()}${x.detail.slice(1)}` : p.libelle;
      const sous = [etat, x.le ? dateCourte(String(x.le).slice(0, 10)) : null].filter(Boolean).join(" · ");
      return { cle: x.cle, nom: x.nom, sous, contenu: <span className="text-[14px] tracking-[.02em]">{initiales(x.nom)}</span>, bord: p.couleur ? rgb(p.couleur, 0.85) : null, trait: p.couleur ? rgb(p.couleur, 0.7) : null,
        style: p.tirets ? "dashed" : "solid", eteint: p.tirets, onClick: onOuvrir ? () => onOuvrir(x.cle) : null, aria: `Ouvrir la fiche de ${x.nom}` };
    }),
    { cle: "autre", nom: null, sous: "Autre client", contenu: <Plus className="h-4 w-4 text-ardoise" strokeWidth={1.8} />, style: "dotted", bord: "var(--k-bord-vif)", onClick: presenter, aria: "Présenter à un autre client", ajout: true },
  ];
  const ag = angles(gauche.length, 195, gauche.length > 3 ? 105 : 125);
  const ad = angles(droite.length, droite.length > 3 ? 80 : 64, droite.length > 3 ? -18 : 20);
  const noeuds = [
    ...gauche.map((n, i) => ({ ...n, a: ag[i], r: R * (i % 2 ? 0.86 : 0.98) })),
    ...droite.map((n, i) => ({ ...n, a: ad[i], r: R * (i % 2 ? 0.86 : 1.02) })),
  ].map((n) => {
    const p = place(n.a, n.r);
    const s = Math.sin((n.a * Math.PI) / 180);
    // Le nom au-dessus des ronds du haut, dessous pour les autres ; jamais hors du cadre.
    return { ...n, ...p, x: Math.min(largeur - LABEL / 2, Math.max(LABEL / 2, p.x)), d: ROND, labelDessus: s > 0.3 && !n.ajout };
  });
  // Le dessin descend pour que les noms du haut tiennent dans le cadre ; sa hauteur suit ce qu'il montre.
  const haut = Math.min(-CENTRE / 2, ...noeuds.map((n) => n.y - ROND / 2 - (n.labelDessus ? 58 : 0)));
  const decale = 4 - haut;
  c.y += decale;
  for (const n of noeuds) n.y += decale;
  const H = Math.max(c.y + CENTRE / 2, ...noeuds.map((n) => n.y + ROND / 2 + (!n.labelDessus ? 58 : 0))) + 28;
  const centre = { cle: "centre", centre: true, x: c.x, y: c.y, d: CENTRE, bord: "var(--k-bord-vif)",
    contenu: <span className={`line-clamp-3 break-words leading-[1.2] ${carte.dossier.nom.length > 14 ? "text-[12.5px]" : "text-[15px]"}`}>{carte.dossier.nom}</span> };
  // Les traits s'arrêtent au bord des ronds.
  const trait = (n) => {
    const dx = n.x - c.x; const dy = n.y - c.y; const l = Math.hypot(dx, dy) || 1;
    const de = CENTRE / 2 + 2; const a = l - ROND / 2 - 2;
    return { x1: c.x + (dx / l) * de, y1: c.y + (dy / l) * de, x2: c.x + (dx / l) * a, y2: c.y + (dy / l) * a };
  };

  const refus = carte.clients.filter((x) => x.position === "abandon");
  const offresRefusees = refus.filter((x) => /offre/i.test(x.detail || "")).length;
  const positionnes = carte.clients.filter((x) => ["positionne", "interesse", "offre", "signe"].includes(x.position)).length;
  const compte = [
    pluriel(1 + carte.agents.length + carte.clients.length, "personne"),
    offresRefusees ? `${pluriel(offresRefusees, "offre refusée", "offres refusées")}` : null,
    refus.length - offresRefusees ? `${refus.length - offresRefusees} sans suite` : null,
    `${positionnes} client${positionnes > 1 ? "s" : ""} positionné${positionnes > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col">
      <div ref={boite} className="relative w-full" style={{ height: H }}>
        <svg width={largeur} height={H} className="absolute inset-0" aria-hidden>
          {noeuds.map((n, i) => {
            const t = trait(n);
            return (
              <motion.line key={n.cle} {...t} stroke={n.trait || "var(--k-bord-vif)"} strokeWidth={1.2} strokeLinecap="round"
                initial={fixe ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.12 + i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
            );
          })}
        </svg>
        <span className="absolute bottom-1 left-0 text-[11.5px] uppercase tracking-[.2em] text-brume">Côté vente</span>
        <span className="absolute bottom-1 right-0 text-[11.5px] uppercase tracking-[.2em] text-brume">Côté achat</span>
        {[centre, ...noeuds].map((n, i) => <Rond key={n.cle} n={n} i={i} fixe={fixe} />)}
      </div>
      <p className="m-0 mt-4 text-center text-[14px] text-ardoise">{compte}</p>
      <button type="button" onClick={presenter}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-[16px] border border-dashed border-bord-vif text-[15px] text-encre transition-colors hover:bg-relief" style={{ background: "transparent" }}>
        <Plus className="h-4 w-4" strokeWidth={1.8} />Présenter à un autre client
      </button>
    </div>
  );
}
