import React, { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Building2 } from "lucide-react";
import { dateCourte } from "@/lib/fiche-dossier";

// La carte d'un dossier (19 nov. 2026, maquette de Jules « Murs de pharmacie ») : le dossier au centre, dans une
// pastille cerclée qui luit ; le vendeur en haut à gauche, relié à l'agent seul ; l'agent dessous, relié au dossier ;
// sous l'agent, qui de l'équipe a repris le dossier (« A repris · 21 nov. »), en pointillé lavande vers ce qu'il a
// touché ; les clients à droite, une pastille bordée de la couleur de leur position et un trait de la même couleur
// vers le dossier (vert l'offre, lavande positionné, jaune la visio faite, gris en tirets s'il ne poursuit pas) ; en
// bas, celui qui porte le dossier, en pointillé gris vers tout ce qu'il a touché. Un clic ouvre la fiche de l'agent
// ou du client. Le dessin est fait sur 760 de large et suit la largeur de la fiche.

export const POSITION = {
  offre: { libelle: "Offre", couleur: "--k-statut-menthe-rgb", epais: 3 },
  signe: { libelle: "Signé", couleur: "--k-statut-menthe-rgb", epais: 4 },
  positionne: { libelle: "Positionné", couleur: "--k-statut-lavande-rgb", epais: 2.5 },
  interesse: { libelle: "Positionné", couleur: "--k-statut-lavande-rgb", epais: 2.5 },
  visio: { libelle: "Visio faite", couleur: "--k-statut-ambre-rgb", epais: 2.5 },
  presente: { libelle: "Présenté", couleur: "--k-ardoise-rgb", epais: 1.5 },
  abandon: { libelle: "Pas poursuivi", couleur: "--k-statut-gris-rgb", epais: 2, tirets: true, eteint: true },
};
const LEGENDE = ["offre", "positionne", "visio", "presente", "abandon"];
const rgb = (v, a = 1) => `rgb(var(${v}) / ${a})`;

const LARGEUR = 760;
const HAUT_PASTILLE = 52;
const PAS = 78;
const CENTRE = { l: 228, h: 70 };

/** Une pastille : l'avatar, le nom, la ligne d'en dessous. */
function Pastille({ n, i, fixe, onClick }) {
  const Corps = onClick ? "button" : "div";
  return (
    // Le cadre garde la hauteur du dessin ; la pastille y est centrée et grandit des deux côtés quand un nom long passe
    // à la ligne : le trait arrive toujours en son milieu.
    <motion.div className="absolute flex items-center" style={{ left: n.x, top: n.y, width: n.l, height: n.h }}
      initial={fixe ? false : { opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}>
      <Corps type={onClick ? "button" : undefined} onClick={onClick || undefined} aria-label={onClick ? `Ouvrir la fiche de ${n.nom}` : undefined}
        className={`relative flex min-h-full w-full flex-none items-center gap-3 border bg-barre text-left transition-[transform,border-color,box-shadow] duration-300 ease-out ${n.centre ? "rounded-[18px] px-3.5 py-2" : "rounded-[26px] px-5 py-2"} ${onClick ? "hover:-translate-y-px hover:shadow-[0_8px_24px_rgb(0_0_0/0.18)]" : ""}`}
        style={{ borderColor: n.bord || (n.centre ? rgb("--k-menthe-rgb", 0.55) : "var(--k-bord-doux)"), boxShadow: n.centre ? `0 0 40px 2px ${rgb("--k-menthe-rgb", 0.16)}` : undefined, opacity: n.eteint ? 0.9 : 1 }}>
        <span aria-hidden className="absolute inset-0 rounded-[inherit] bg-relief" />
        {/* Le nom seul, sans les initiales (19 nov. 2026, Jules) ; le dossier garde son icône. */}
        {n.centre && <span className="relative grid h-11 w-11 flex-none place-items-center rounded-[12px] bg-menthe/15 text-menthe"><Building2 className="h-5 w-5" strokeWidth={1.6} /></span>}
        <span className="relative min-w-0 flex-1">
          <span className={`block break-words text-encre ${n.centre ? "text-[15px] leading-[1.25]" : "text-[14.5px] leading-[1.3]"}`}>{n.nom}</span>
          {n.sous && <span className="mt-0.5 block break-words text-[12.5px] leading-[1.3] text-ardoise">{n.sous}</span>}
        </span>
      </Corps>
    </motion.div>
  );
}

/**
 * @param {{ carte: { dossier: object, vendeur: string|null, agents: object[], clients: object[], equipe: object[] }, sous?: string, onOuvrir?: (cle: string) => void }} props
 */
export default function CarteDossier({ carte, sous = "", onOuvrir }) {
  const fixe = useReducedMotion();
  const boite = useRef(null);
  // La place qu'a la carte : toute la fiche sous les onglets, la légende en bas (19 nov. 2026, Jules : « que ça prenne
  // bien l'espace, la légende en bas, le visuel au milieu »).
  const [place, setPlace] = useState({ l: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    const mesurer = () => setPlace({ l: el.clientWidth, h: el.clientHeight });
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!carte) return null;

  const porteur = carte.equipe.find((p) => !p.repris) || null;
  const repris = carte.equipe.filter((p) => p.repris);

  // La colonne de gauche : le vendeur, les agents, puis ceux qui ont repris ; à droite, les clients.
  const gauche = [
    ...(carte.vendeur ? [{ cle: "vendeur", nom: carte.vendeur, sous: "Vendeur · via l'agent", genre: "vendeur" }] : []),
    ...carte.agents.map((a) => ({ cle: a.cle, nom: a.nom, sous: ["Agent", a.detail].filter(Boolean).join(" · "), genre: "agent" })),
    ...repris.map((p) => ({ cle: `equipe:${p.email}`, nom: p.prenom, sous: `A repris${p.depuis ? ` · ${dateCourte(String(p.depuis).slice(0, 10))}` : ""}`, genre: "equipe", equipe: true, liens: p.liens, repris: true })),
  ];
  // Les deux colonnes centrées sur le dossier ; l'écart entre les rangs suit la hauteur de la fiche, pour que la carte
  // en prenne la place (entre 78 et 170 sur le dessin de 760 de large).
  const rangs = Math.max(gauche.length, carte.clients.length, 1);
  // En vrais pixels, sans mise à l'échelle : le texte garde la taille du chat (19 nov. 2026, Jules : « trop grand dans
  // les fiches ») ; seules les largeurs et les distances suivent la place.
  const W = Math.max(520, place.l || LARGEUR);
  // Le dossier prend 30 % (170 à 250), les deux colonnes se partagent le reste, avec 28 px d'air de chaque côté.
  const lc = Math.round(Math.min(250, Math.max(170, W * 0.3)));
  const lg = Math.round(Math.min(260, Math.max(150, (W - lc - 56) / 2)));
  const ld = lg;
  const hauteurDispo = place.h || 0;
  const autour = 18 + (porteur ? HAUT_PASTILLE + 40 : 0);
  const pas = hauteurDispo ? Math.max(PAS, Math.min(170, (hauteurDispo * 0.9 - autour) / (rangs + (porteur ? 0.6 : 0)))) : PAS;
  const ecartBas = porteur ? Math.round(pas * 0.6) : 0;
  const ligne = (n, i) => 8 + ((rangs - n) * pas) / 2 + (i + 0.5) * pas - HAUT_PASTILLE / 2;
  gauche.forEach((n, i) => Object.assign(n, { x: 0, y: ligne(gauche.length, i), l: lg, h: HAUT_PASTILLE }));
  const droite = carte.clients.map((c, i) => {
    const p = POSITION[c.position] || POSITION.presente;
    return { ...c, genre: "client", sous: [c.detail && c.position === "offre" ? `Offre ${c.detail}` : p.libelle, c.detail && c.position !== "offre" ? c.detail : null].filter(Boolean).join(" · "),
      bord: c.position === "presente" || c.position === "abandon" ? undefined : rgb(p.couleur, 0.85), eteint: p.eteint, p, x: W - ld, y: ligne(carte.clients.length, i), l: ld, h: HAUT_PASTILLE };
  });
  const hauteurColonnes = 8 + rangs * pas;
  const centre = { cle: carte.dossier.cle, nom: carte.dossier.nom, sous, centre: true, x: Math.round((W - lc) / 2), y: 8 + (rangs * pas) / 2 - CENTRE.h / 2, l: lc, h: CENTRE.h };
  const bas = porteur ? { cle: `equipe:${porteur.email}`, nom: porteur.prenom, sous: "Klocka", genre: "equipe", equipe: true, liens: porteur.liens, x: Math.round(W / 2 - 95 - W * 0.05), y: Math.max(hauteurColonnes, centre.y + centre.h) + Math.max(28, ecartBas), l: 190, h: HAUT_PASTILLE } : null;
  const hauteur = (bas ? bas.y + bas.h : hauteurColonnes) + 10;

  const tous = [centre, ...gauche, ...droite, ...(bas ? [bas] : [])];
  const milieu = (n) => ({ x: n.x + n.l / 2, y: n.y + n.h / 2 });
  const parCle = new Map(tous.map((n) => [n.cle, n]));
  const vendeur = gauche.find((n) => n.genre === "vendeur");
  const agents = gauche.filter((n) => n.genre === "agent");

  // Les traits, sous les pastilles : de centre à centre, les pastilles en couvrent les bouts.
  const traits = [];
  if (vendeur && agents[0]) traits.push({ id: "v", a: milieu(vendeur), b: milieu(agents[0]), couleur: "var(--k-bord-vif)", epais: 1.5 });
  for (const a of agents) traits.push({ id: a.cle, a: milieu(a), b: milieu(centre), couleur: "var(--k-bord-vif)", epais: 1.5 });
  for (const c of droite) traits.push({ id: c.cle, a: milieu(centre), b: milieu(c), couleur: rgb(c.p.couleur, c.p.eteint ? 0.7 : 1), epais: c.p.epais, tirets: c.p.tirets });
  for (const m of [...gauche.filter((n) => n.equipe), ...(bas ? [bas] : [])]) {
    for (const cle of m.liens || []) {
      const cible = parCle.get(cle);
      if (cible) traits.push({ id: `${m.cle}-${cle}`, a: milieu(m), b: milieu(cible), couleur: m.repris ? rgb("--k-statut-lavande-rgb", 0.85) : rgb("--k-ardoise-rgb", 0.5), epais: 1.2, points: true });
    }
  }

  const presentes = new Set(carte.clients.map((c) => (c.position === "interesse" ? "positionne" : c.position === "signe" ? "offre" : c.position)));
  // À l'échelle de la place, en largeur comme en hauteur ; au milieu.
  return (
    <div className="flex min-h-0 flex-auto flex-col">
      <div ref={boite} className="relative min-h-[280px] flex-auto" style={{ minHeight: Math.max(280, hauteur) }}>
        <div className="absolute left-0" style={{ width: W, height: hauteur, top: Math.max(0, (place.h - hauteur) / 2) }}>
          <svg width={W} height={hauteur} className="absolute inset-0" aria-hidden>
            {traits.map((t, i) => (
              <motion.line key={t.id} x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y} stroke={t.couleur} strokeWidth={t.epais} strokeLinecap="round"
                strokeDasharray={t.points ? "2 5" : t.tirets ? "8 7" : undefined}
                initial={fixe ? false : t.points || t.tirets ? { opacity: 0 } : { pathLength: 0, opacity: 0 }} animate={t.points || t.tirets ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.75, delay: 0.15 + i * 0.04, ease: [0.22, 1, 0.36, 1] }} />
            ))}
          </svg>
          {tous.map((n, i) => (
            <Pastille key={n.cle} n={n} i={i} fixe={fixe} onClick={onOuvrir && (n.genre === "agent" || n.genre === "client") ? () => onOuvrir(n.cle) : null} />
          ))}
        </div>
      </div>
      {!carte.clients.length && <p className="m-0 mt-2 text-center text-[13px] text-brume">Aucun client encore : lie une note à ce dossier et au client à qui tu l'as présenté.</p>}
      <ul className="m-0 mt-4 flex flex-none list-none flex-wrap justify-center gap-x-5 gap-y-1.5 border-t border-trait p-0 pt-4">
        {LEGENDE.filter((k) => k !== "presente" || presentes.has("presente")).map((k) => {
          const p = POSITION[k];
          return (
            <li key={k} className="inline-flex items-center gap-2 text-[12.5px] text-craie">
              <svg width="22" height="6" aria-hidden><line x1="1.5" y1="3" x2="20.5" y2="3" stroke={rgb(p.couleur)} strokeWidth={p.tirets ? 2 : 3} strokeLinecap="round" strokeDasharray={p.tirets ? "5 4" : undefined} /></svg>
              {p.libelle}
            </li>
          );
        })}
        <li className="inline-flex items-center gap-2 text-[12.5px] text-craie">
          <svg width="22" height="6" aria-hidden><line x1="1.5" y1="3" x2="20.5" y2="3" stroke={rgb("--k-ardoise-rgb", 0.8)} strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" /></svg>
          Équipe Klocka
        </li>
      </ul>
    </div>
  );
}
