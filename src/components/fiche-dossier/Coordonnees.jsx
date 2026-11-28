import React, { Suspense, lazy, useState } from "react";
import { ExternalLink, Mail, Phone } from "lucide-react";

// Les coordonnées en haut de chaque fiche, et les collaborateurs d'une agence (28 nov. 2026, Jules : « toutes les
// agences et agents ont la même carte ; au-dessus, ses infos : son email si on l'a, son numéro de téléphone » ; « si
// c'est une agence, une partie collaborateurs, et une fiche par agent »). Lues par server/fiche-dossier/coordonnees.js.

const ChampLien = lazy(() => import("@/components/prospection/ChampLien"));
const telLien = (t) => `tel:${String(t).replace(/[^\d+]/g, "")}`;
const siteLisible = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const lienWeb = (u) => (/^https?:\/\//i.test(String(u || "")) ? u : `https://${u}`);
const initiales = (nom) => String(nom || "").split(/[\s-]+/).filter((m) => /\p{L}/u.test(m)).slice(0, 2).map((m) => m[0].toUpperCase()).join("") || "?";

function Ligne({ libelle, children }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-3 py-1.5 text-[14.5px]">
      <span className="text-[13.5px] text-ardoise">{libelle}</span>
      <span className="min-w-0 text-encre [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

/** Le bandeau des coordonnées : un clic appelle, écrit, ouvre l'agence ou la page de la personne. */
export function Coordonnees({ c, onOuvrir }) {
  const [lien, setLien] = useState(false);
  if (!c) return null;
  const note = c.note ? `${String(c.note).replace(".", ",")} / ${c.note > 5 ? 10 : 5}${c.nb_avis ? ` · ${c.nb_avis} avis` : ""}` : null;
  const lignes = [
    c.telephone && ["Téléphone", <span key="t" className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{[c.telephone, ...(c.autres_telephones || [])].map((t) => <a key={t} href={telLien(t)} className="inline-flex items-center gap-1.5 tabular-nums hover:text-menthe"><Phone className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.8} />{t}</a>)}</span>],
    (c.email || c.email_deduit) && ["Mail", c.email
      ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-menthe"><Mail className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.8} />{c.email}</a>
      : <span className="inline-flex items-center gap-1.5 text-craie" title="Déduit du format des mails de l'agence, pas vérifié"><Mail className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.8} />{c.email_deduit} · déduit</span>],
    c.agence && ["Agence", c.agence.cle && onOuvrir
      ? <button type="button" onClick={() => onOuvrir(c.agence.cle)} className="text-left text-encre underline decoration-trait underline-offset-2 hover:text-menthe" style={{ background: "transparent" }}>{c.agence.nom}</button>
      : c.agence.nom],
    c.poste && ["Poste", c.poste],
    c.statut && ["Statut", c.statut],
    c.reseau && ["Réseau", c.reseau],
    c.site && ["Site", <a key="s" href={lienWeb(c.site)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-menthe">{siteLisible(c.site)}<ExternalLink className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.8} /></a>],
    c.adresse && ["Adresse", c.adresse],
    !c.adresse && c.ville && ["Ville", c.ville],
    note && ["Note", note],
    c.page && ["Sa page", <a key="p" href={c.page} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-menthe">{siteLisible(c.page).slice(0, 48)}<ExternalLink className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.8} /></a>],
  ].filter(Boolean);
  if (!lignes.length && !c.lien_page) return null;
  return (
    <section aria-label="Coordonnées" className="mb-1 border-y border-trait py-2.5">
      {lignes.map(([k, v]) => <Ligne key={k} libelle={k}>{v}</Ligne>)}
      {/* Le lien de sa page (sa page de conseiller) : collé ici, lu par le serveur, sans recherche web. */}
      {c.lien_page && (lien
        ? <div className="py-2"><Suspense fallback={null}><ChampLien agenceId={c.lien_page.agence_id} nom={c.lien_page.nom} libelle={c.page ? "Un autre lien pour sa page" : "Lien de sa page (site de l'agence, réseau)"} onLu={() => setLien(false)} /></Suspense></div>
        : <button type="button" onClick={() => setLien(true)} className="mt-1 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>{c.page ? "Changer le lien de sa page" : "Ajouter le lien de sa page"}</button>)}
    </section>
  );
}

/** Les collaborateurs d'une agence, en lignes : un clic ouvre la fiche de la personne. */
export function CollaborateursAgence({ gens = [], pageEquipe = null, onOuvrir }) {
  return (
    <div className="flex flex-col gap-4">
      {gens.length ? (
        <ul className="m-0 list-none divide-y divide-trait border-y border-trait p-0">
          {gens.map((x, i) => (
            <li key={x.cle || `${x.nom}-${i}`}>
              <button type="button" disabled={!x.cle} onClick={() => x.cle && onOuvrir?.(x.cle)} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors enabled:hover:bg-relief/60" style={{ background: "transparent" }}>
                <span className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full bg-rail-actif text-[12.5px] text-craie">
                  {x.photo ? <img src={x.photo} alt="" className="h-full w-full object-cover" loading="lazy" /> : initiales(x.nom)}
                </span>
                <span className="flex min-w-0 flex-auto flex-col">
                  <span className="truncate text-[15px] text-encre">{x.nom}</span>
                  {x.poste && <span className="truncate text-[13px] text-ardoise">{x.poste}</span>}
                </span>
                <span className="flex flex-none flex-col items-end text-[13.5px] tabular-nums">
                  {x.telephone ? <span className="text-encre">{x.telephone}</span> : <span className="text-brume">Pas de numéro</span>}
                  {x.biens ? <span className="text-[12px] text-menthe">{x.biens} bien{x.biens > 1 ? "s" : ""}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-[13.5px] text-brume">Aucun collaborateur connu encore.</p>}
      {/* La page équipe de l'agence : un lien, et toute l'équipe de la page rejoint la liste. */}
      {pageEquipe && <Suspense fallback={null}><ChampLien agenceId={pageEquipe.agence_id} libelle="Lien de la page équipe de l'agence" /></Suspense>}
    </div>
  );
}
