import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Plus, Loader2, Trash2, Check, X, Clock, Phone, Mail, Globe, ExternalLink, SlidersHorizontal } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { createPageUrl } from "@/utils";
import CarteCommerces, { familleDe } from "@/components/kdata/CarteCommerces";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";
import { effectif } from "@/components/kzoning/FicheSociete";
import { BoutonMecanique, MecaniqueEnLigne } from "@/components/kdata/Mecanique";
import {
  BoutonPrincipal, BoutonOutil, Filtres, Statut, TitrePage, CLASSE_CARTE,
} from "@/components/mandataire/elements";

// K-Prospective : les commerces d'une zone qui répondent à des critères.
//
// Trois écrans. Le départ : un type de commerce, une adresse, un rayon, et
// un volet de critères ; chaque groupe dit sa source, et une option sans
// source ouverte se montre grisée plutôt que de promettre. Le chargement,
// étape par étape. Puis les résultats : la liste à gauche, qui défile seule,
// et la carte à droite, qui ne bouge pas. Un commerce cliqué ouvre sa fiche.
//
// 10 nov. 2026, Jules : planche Outils. Une page de Klocka (barre latérale,
// plus de barre K-Data) : lien « Outils » au-dessus d'un titre de 24 px,
// boutons de 32 px, liste dans un cadre au rayon 12 sur `bg-rail`, carte au
// rayon 12, et la fiche d'un commerce en panneau de droite comme celles du
// CRM, sur le fond de la barre latérale.
//
// 10 nov. 2026, Jules : écran d'arrivée. Dans le cadre des Outils (plus de
// lien « Outils »), titre de 20 px et son compteur. À gauche le formulaire
// empilé dans un cadre de 340 px, à droite l'aperçu de la zone, qui se dessine
// pendant qu'on règle l'adresse et le rayon. Dessous, les prospections
// réalisées en cartes, quatre par ligne, à la place du tableau.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const RAYONS = [250, 500, 1000, 2000];
const ANNEE = new Date().getFullYear();
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const euros = (n) => (n == null ? "-" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const metres = (r) => (r >= 1000 ? `${r / 1000} km` : `${r} m`);
const initiales = (nom) => String(nom || "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";
const RUES = { n1: "Rue N°1", tres_commercante: "Rue très commerçante", commercante: "Rue commerçante", semi: "Rue semi commerçante", residentielle: "Rue résidentielle" };

// La mécanique : dans quel ordre K-Prospective interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "OpenStreetMap", quoi: "Les devantures de la zone pour le type d'activité choisi : nom, rue, et souvent le SIRET." },
  { source: "Annuaire des entreprises", quoi: "La société derrière chaque devanture : par SIRET quand il est là, sinon par nom dans la commune, l'établissement le plus proche du point." },
  { source: "Fichier des personnes morales (DGFiP)", quoi: "Les murs : la parcelle et son propriétaire, quand c'est une personne morale." },
  { source: "Vos critères", quoi: "Appliqués à ce qu'on sait vraiment. La solvabilité chiffrée, le prix d'acquisition et l'échéance d'un bail n'ont pas de source ouverte : ces options sont grisées plutôt que devinées." },
];

const CHAMP = "h-10 w-full rounded-[8px] border border-trait bg-fond px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-doux max-md:text-[16px]";
const ETIQUETTE = "mb-1.5 block text-[12.5px] text-ardoise";

/** L'en-tête des écrans : le lien vers les Outils (l'équipe seule), le titre de 24 px, une ligne grise. */
function EnTete({ admin, titre, nombre = null, sousTitre, actions = null }) {
  return (
    <div className="mb-4 flex flex-shrink-0 flex-col gap-1.5">
      {admin
        ? <Link to={createPageUrl("KData")} className="w-fit text-[13px] text-ardoise hover:text-encre">← Outils · K-Prospective</Link>
        : <span className="text-[13px] text-ardoise">K-Prospective</span>}
      <TitrePage titre={titre} nombre={nombre} actions={actions} />
      {sousTitre && <p className="m-0 text-[13.5px] text-ardoise">{sousTitre}</p>}
    </div>
  );
}

function Ligne({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-trait py-2 text-[13.5px]">
      <span className="flex-shrink-0 text-ardoise">{label}</span>
      <span className="min-w-0 text-right text-encre">{children ?? "-"}</span>
    </div>
  );
}

function Intertitre({ children, className = "mt-6" }) {
  return <h3 className={`m-0 mb-1 text-[14px] font-medium text-encre ${className}`}>{children}</h3>;
}

// ── Le volet des critères ──────────────────────────────────────────────────

function Criteres({ groupes, choix, onChoix }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {groupes.map((g) => {
        const actifs = choix[g.cle] || [];
        return (
          <div key={g.cle} className="rounded-[12px] border border-trait bg-relief p-3">
            <p className="m-0 text-[13.5px] text-encre">{g.nom}</p>
            <p className="m-0 mb-2 text-[12.5px] text-brume">Source : {g.source}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.options.map((op) => {
                const actif = actifs.includes(op.valeur);
                return (
                  <button
                    key={op.valeur} type="button" disabled={op.indisponible} title={op.indisponible ? op.pourquoi : op.aide || ""}
                    onClick={() => onChoix(g.cle, actif ? actifs.filter((v) => v !== op.valeur) : [...actifs, op.valeur])}
                    style={actif ? undefined : { background: "transparent" }}
                    className={`inline-flex h-7 items-center rounded-full border px-3 text-[13px] transition-colors max-md:h-9 ${
                      op.indisponible ? "cursor-not-allowed border-trait text-brume/50 line-through" : actif ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-trait text-craie hover:border-bord-doux hover:text-encre"
                    }`}
                  >
                    {op.nom}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Le chargement ──────────────────────────────────────────────────────────

function Chargement({ prospection: p }) {
  return (
    <div className="mx-auto max-w-[620px] px-5 pt-16 text-center">
      <p className="m-0 text-[13px] text-ardoise">Prospection en cours</p>
      <h2 className="mt-1.5 mb-1 text-[24px] font-normal tracking-[-0.01em] text-encre">{p?.libelle || p?.adresse}</h2>
      <p className="m-0 text-[13.5px] text-ardoise">{p?.activite} · {p?.zone === "commune" ? `commune entière (emprise, ${p?.rayon_m} m)` : `${p?.rayon_m} m`}</p>
      <div className="mx-auto mt-8 h-2 w-full overflow-hidden rounded-full bg-relief">
        <div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.max(4, p?.progression || 0)}%` }} />
      </div>
      <p className="m-0 mt-2 text-[12.5px] tabular-nums text-brume">{p?.progression || 0} %</p>
      <ul className="mx-auto mt-8 m-0 max-w-[520px] list-none space-y-2 p-0 text-left">
        {(p?.etapes || []).map((s) => (
          <li key={s.cle} className="flex items-start gap-3 text-[13.5px]">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-trait">
              {s.etat === "faite" ? <Check className="h-3 w-3 text-vert" /> : s.etat === "ratee" ? <X className="h-3 w-3 text-alerte" /> : s.etat === "en_cours" ? <Loader2 className="h-3 w-3 animate-spin text-menthe" /> : <Clock className={`h-3 w-3 ${s.etat === "sautee" ? "text-brume/50" : "text-brume"}`} />}
            </span>
            <span className="min-w-0">
              <span className={`block ${s.etat === "a_faire" || s.etat === "sautee" ? "text-brume" : "text-encre"}`}>{s.nom}</span>
              {s.detail && <span className="block text-[12.5px] text-ardoise">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 mb-0 text-[12.5px] leading-[1.6] text-brume">Chaque devanture est rapprochée de sa société dans l&apos;annuaire des entreprises : comptez une à deux minutes pour une zone dense. Sources ouvertes, aucun crédit dépensé.</p>
    </div>
  );
}

// ── La fiche d'un commerce, en panneau de droite ───────────────────────────

function FicheCommerce({ commerce: c, point, onFermer }) {
  const s = c.societe;
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);
  // Un clic ailleurs ferme la fiche, comme au CRM ; un clic sur une autre ligne ouvre la sienne.
  const cadre = useRef(null);
  useEffect(() => {
    const dehors = (e) => { if (cadre.current && !cadre.current.contains(e.target) && !e.target.closest?.("[role=\"dialog\"], [role=\"alertdialog\"], [role=\"menu\"]")) onFermer(); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [onFermer]);
  const { icone: Icone, couleur } = familleDe(c.categorie);

  return (
    <aside ref={cadre} aria-label={`Fiche de ${c.nom || "ce commerce"}`}
      className="animate-in fade-in slide-in-from-right-4 duration-200 fixed inset-y-0 right-0 z-[600] flex w-[520px] max-w-full flex-col overflow-hidden border-l border-trait bg-rail shadow-[0_12px_40px_rgb(0_0_0/0.3)] max-md:inset-0 max-md:w-auto max-md:border-l-0 max-md:pt-[env(safe-area-inset-top)]">
      <div className="flex flex-shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px]" style={{ background: couleur }}><Icone className="h-4 w-4 text-fond" /></span>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[20px] font-normal leading-[1.2] text-encre">{c.nom || "Commerce sans nom"}</h2>
            <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{c.metier || c.genre}{c.categorie ? ` · ${c.categorie}` : ""}</p>
            <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{c.adresse ? `${c.adresse}, ` : ""}{point?.label?.split(" ").slice(-2).join(" ")}{c.distance_m != null ? ` · à ${c.distance_m} m de l'adresse` : ""}</p>
          </div>
        </div>
        <button type="button" onClick={onFermer} title="Fermer" aria-label="Fermer la fiche" style={{ background: "transparent" }} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-ardoise hover:text-encre max-md:h-10 max-md:w-10"><X className="h-4 w-4" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="overflow-hidden rounded-[12px] border border-trait">
          {CLE_MAPS ? (
            <iframe title="Vue de la rue" className="block h-[220px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
              src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${c.lat},${c.lon}&heading=0&pitch=0&fov=90`} />
          ) : <p className="m-0 px-4 py-6 text-[13.5px] text-ardoise">Clé Google Maps absente.</p>}
        </div>

        <Intertitre className="mt-5">Le commerce</Intertitre>
        <Ligne label="Enseigne">{c.enseigne || c.nom || "-"}</Ligne>
        <Ligne label="Activité relevée">{c.metier || c.genre || "-"}</Ligne>
        <Ligne label="Rue">{c.rue_typologie ? `${RUES[c.rue_typologie]} · ${c.rue_nb_commerces} commerces relevés` : "-"}</Ligne>
        <Ligne label="Horaires">{c.horaires || "-"}</Ligne>
        {/* Lot 9 (18 oct. 2026) : le téléphone et le site de Google Places quand OpenStreetMap n'en a pas. */}
        <Ligne label="Téléphone">{(c.telephone || c.contact?.telephone) ? <a className="text-menthe-texte" href={`tel:${c.telephone || c.contact.telephone}`}>{c.telephone || c.contact.telephone}</a> : "-"}</Ligne>
        <Ligne label="Email">{c.email ? <a className="text-menthe-texte" href={`mailto:${c.email}`}>{c.email}</a> : "-"}</Ligne>
        <Ligne label="Site">{(c.site || c.contact?.site) ? <a className="text-menthe-texte" href={c.site || c.contact.site} target="_blank" rel="noreferrer">{(c.site || c.contact.site).replace(/^https?:\/\//, "")}</a> : "-"}</Ligne>
        {c.interet && <Ligne label="Intérêt">{c.interet.total} / 100{c.interet.parts?.length ? ` · ${c.interet.parts.map((x) => x.libelle).join(", ")}` : ""}</Ligne>}
        {c.signaux?.length > 0 && <Ligne label="Signaux">{c.signaux.map((x) => `${x.type_signal}${x.date_signal ? ` (${String(x.date_signal).slice(0, 10)})` : ""}`).join(", ")}</Ligne>}
        {c.historique?.deja_cible && <Ligne label="Déjà chez Klocka">{`cible ALX${c.historique.pile ? `, pile « ${c.historique.pile} »` : ""}`}</Ligne>}
        {c.contact?.statut && c.contact.statut !== "OPERATIONAL" && <Ligne label="Sur Maps">{c.contact.statut === "CLOSED_PERMANENTLY" ? "fermé définitivement" : "fermé temporairement"}</Ligne>}

        <Intertitre>Informations sur l&apos;entreprise</Intertitre>
        {s ? (
          <>
            <p className="m-0 mb-1 text-[13.5px] text-craie">{s.nom}</p>
            <Ligne label="SIREN"><span className="tabular-nums">{s.siren}</span></Ligne>
            <Ligne label="SIRET de l'établissement"><span className="tabular-nums">{s.siret || "-"}</span></Ligne>
            <Ligne label="Siège">{s.siege ? `${s.siege.adresse || ""} ${s.siege.code_postal || ""} ${s.siege.commune || ""}`.trim() : "-"}</Ligne>
            <Ligne label="Activité">{s.activite_code ? `NAF ${s.activite_code}` : "-"}</Ligne>
            <Ligne label="Création">{s.creation ? quand(s.creation) : "-"}</Ligne>
            <Ligne label="Effectif de l'établissement">{effectif(s.effectif_etablissement || s.effectif)}</Ligne>
            <Ligne label="Établissements ouverts">{s.nombre_etablissements_ouverts ?? s.nombre_etablissements ?? "-"}</Ligne>
            <Ligne label={`Chiffre d'affaires${s.annee_comptes ? ` (${s.annee_comptes})` : ""}`}>{s.ca != null ? euros(s.ca) : "Comptes non déposés"}</Ligne>
            {s.etat === "C" && <p className="m-0 mt-2 text-[12.5px] text-alerte">Société cessée au registre.</p>}
            {s.dirigeants?.length > 0 && (
              <>
                <Intertitre className="mt-4">{s.dirigeants.length} dirigeant{s.dirigeants.length > 1 ? "s" : ""}</Intertitre>
                {s.dirigeants.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-trait py-2">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-trait text-[12px] text-encre">{initiales(d.nom)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-encre">{d.nom}{d.annee_naissance ? ` - ${ANNEE - Number(d.annee_naissance)} ans` : ""}</span>
                      <span className="block text-[12.5px] text-ardoise">{d.qualite || (d.morale ? "Personne morale" : "Dirigeant")}{d.morale ? " · via la holding" : ""}</span>
                    </span>
                  </div>
                ))}
              </>
            )}
            {s.etablissements_gerant != null && <Ligne label="Établissements du gérant">{s.etablissements_gerant}</Ligne>}
            <p className="m-0 mt-2 text-[12.5px] text-brume">Rapprochement : {s.methode}.</p>
            <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${s.siren}`} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre">
              <ExternalLink className="h-3.5 w-3.5" />Annuaire des entreprises
            </a>
          </>
        ) : <p className="m-0 text-[13.5px] text-ardoise">Aucune société n&apos;a pu être rapprochée de cette devanture : ni SIRET sur la fiche OpenStreetMap, ni établissement de ce nom à moins de 300 m dans l&apos;annuaire.</p>}

        {c.foncier && (
          <>
            <Intertitre>Les murs</Intertitre>
            <Ligne label="Parcelle">{c.parcelle ? `${c.parcelle.section} ${c.parcelle.numero} · ${c.parcelle.contenance ?? "-"} m²` : "-"}</Ligne>
            <Ligne label="Propriétaire exploitant">{c.foncier.proprietaire_exploitant ? "Oui" : "Non"}</Ligne>
            <Ligne label="Copropriété">{c.foncier.copropriete ? "Oui" : "Non"}</Ligne>
            {c.foncier.proprietaires?.map((x, i) => <Ligne key={i} label={x.droit || "Propriétaire"}>{x.nom}{x.siren ? ` · ${x.siren}` : ""} · {x.lots} lot{x.lots > 1 ? "s" : ""}</Ligne>)}
          </>
        )}

        <div className="relative mt-5 h-[240px] overflow-hidden rounded-[12px] border border-trait">
          <CarteCommerces point={{ lat: c.lat, lon: c.lon, label: c.nom || "" }} rayon_m={80} commerces={[c]} actif={c.id} onErreur={() => {}} />
        </div>
        <p className="m-0 mt-4 text-[12.5px] leading-[1.5] text-brume">Sources : OpenStreetMap pour la devanture, annuaire des entreprises pour la société, fichier des personnes morales (DGFiP) pour les murs.</p>
      </div>
    </aside>
  );
}

// ── Les résultats ──────────────────────────────────────────────────────────

const aUnSignal = (c) => c.signaux?.length > 0;
const dejaChezKlocka = (c) => !!c.historique?.deja_cible;

function Resultats({ prospection: p, groupes, admin, onRetour, onSupprimer }) {
  const [ouvert, setOuvert] = useState(null);
  const [actif, setActif] = useState(null);
  const [filtre, setFiltre] = useState("tous");
  const [voirCriteres, setVoirCriteres] = useState(false);
  const retenus = new Set(p.retenus || []);
  const liste = (p.commerces || []).filter((c) => retenus.has(c.id));
  const avecSignal = liste.filter(aUnSignal);
  const chezKlocka = liste.filter(dejaChezKlocka);
  const vus = filtre === "signal" ? avecSignal : filtre === "klocka" ? chezKlocka : liste;
  const ouvrir = useCallback((c) => setOuvert(c), []);
  const survoler = useCallback((c) => setActif(c.id), []);

  // Les critères appliqués, lus dans la prospection et nommés par le volet.
  const appliques = useMemo(() => Object.entries(p.criteres || {}).filter(([, v]) => v?.length).map(([cle, v]) => {
    const g = groupes.find((x) => x.cle === cle);
    return { cle, nom: g?.nom || cle, options: v.map((val) => g?.options.find((op) => op.valeur === val)?.nom || val) };
  }), [p.criteres, groupes]);
  const nbCriteres = appliques.reduce((n, g) => n + g.options.length, 0);

  const options = [["tous", "Tous", liste.length]];
  if (avecSignal.length) options.push(["signal", "Avec un signal", avecSignal.length]);
  if (chezKlocka.length) options.push(["klocka", "Déjà chez Klocka", chezKlocka.length]);

  return (
    <div className="relative flex flex-col px-5 py-[22px] text-encre md:min-h-0 md:flex-1 md:overflow-hidden md:px-8">
      <div className="relative mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col">
        <EnTete admin={admin} titre={p.libelle || p.adresse} nombre={`${liste.length} retenu${liste.length > 1 ? "s" : ""} sur ${p.nb_commerces}`}
          sousTitre={`${p.activite || "Tous les commerces"} · ${p.zone === "commune" ? "commune entière" : `${metres(p.rayon_m)} autour de l'adresse`}`}
          actions={<>
            <BoutonOutil onClick={() => setVoirCriteres((v) => !v)} aria-pressed={voirCriteres} aria-expanded={voirCriteres}><SlidersHorizontal className="h-3.5 w-3.5" />Critères · {nbCriteres}</BoutonOutil>
            <BoutonOutil onClick={onSupprimer} className="hover:!text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</BoutonOutil>
            <BoutonPrincipal onClick={onRetour}>Nouvelle prospection</BoutonPrincipal>
          </>} />

        {voirCriteres && (
          <div className={`${CLASSE_CARTE} mb-3.5 flex-shrink-0 px-4 py-3 text-[13.5px]`}>
            {!appliques.length ? <p className="m-0 text-ardoise">Aucun critère : tous les commerces de la zone sont retenus.</p> : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {appliques.map((g) => <li key={g.cle}><span className="text-ardoise">{g.nom} : </span><span className="text-encre">{g.options.join(", ")}</span></li>)}
              </ul>
            )}
          </div>
        )}

        {/* La liste défile seule ; la carte reste en place. */}
        <div className="grid min-h-0 flex-1 gap-3.5 lg:grid-cols-[440px_minmax(0,1fr)]">
          <section aria-label="Les commerces" className={`${CLASSE_CARTE} flex min-h-0 flex-col overflow-hidden px-3 py-2 max-lg:max-h-[60dvh]`}>
            <div className="flex-shrink-0 border-b border-trait pb-2 pt-1">
              <Filtres label="Filtrer les commerces" options={options} valeur={filtre} onChange={setFiltre} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!vus.length && <p className="m-0 p-4 text-[13.5px] text-ardoise">Aucun commerce ne répond à ces critères dans la zone.</p>}
              {vus.map((c) => {
                const { icone: Icone, couleur } = familleDe(c.categorie);
                const s = c.societe;
                return (
                  <button key={c.id} type="button" onClick={() => ouvrir(c)} onMouseEnter={() => survoler(c)}
                    style={actif === c.id || ouvert?.id === c.id ? undefined : { background: "transparent" }}
                    className={`flex w-full items-start gap-2.5 border-b border-trait px-1 py-2.5 text-left transition-colors last:border-b-0 ${actif === c.id || ouvert?.id === c.id ? "bg-relief" : "hover:!bg-relief"}`}>
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px]" style={{ background: couleur }}><Icone className="h-3.5 w-3.5 text-fond" /></span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[14px] text-encre">{c.nom || "Commerce sans nom"}</span>
                      <span className="truncate text-[12.5px] text-ardoise">{c.metier || c.genre}{c.adresse ? ` · ${c.adresse}` : ""}{c.distance_m != null ? ` · ${c.distance_m} m` : ""}</span>
                      <span className="flex flex-wrap items-center gap-1 text-ardoise">
                        <Statut couleur="gris">{s ? s.nom : "Société non rapprochée"}</Statut>
                        {s?.effectif_etablissement && <Statut couleur="gris">{effectif(s.effectif_etablissement)}</Statut>}
                        {s?.annee_naissance_gerant && <Statut couleur="gris">Gérant {ANNEE - Number(s.annee_naissance_gerant)} ans</Statut>}
                        {c.interet && <Statut couleur="gris">Intérêt {c.interet.total}</Statut>}
                        {aUnSignal(c) && <Statut couleur="ambre">Signal</Statut>}
                        {dejaChezKlocka(c) && <Statut couleur="menthe">Déjà chez Klocka</Statut>}
                        {(c.telephone || c.contact?.telephone) && <Phone className="h-3 w-3" aria-label="Téléphone connu" />}
                        {c.email && <Mail className="h-3 w-3" aria-label="Email connu" />}
                        {(c.site || c.contact?.site) && <Globe className="h-3 w-3" aria-label="Site connu" />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <div className="relative min-h-[420px] overflow-hidden rounded-[12px] border border-trait">
            <CarteCommerces point={p.point} rayon_m={p.rayon_m} commerces={vus} actif={actif} onCommerce={ouvrir} onErreur={(m) => toast.error(m)} />
          </div>
        </div>
      </div>

      {ouvert && createPortal(<FicheCommerce commerce={ouvert} point={p.point} onFermer={() => setOuvert(null)} />, document.body)}
      <BoutonMecanique etapes={ETAPES_MECANIQUE} />
    </div>
  );
}

// ── La page ────────────────────────────────────────────────────────────────

// 10 nov. 2026, Jules : écran d'arrivée. L'aperçu de la zone. Google sert de
// fond, figé (ni glisser ni zoomer) : le cercle pointillé, son étiquette et le
// point du centre sont dessinés par-dessus, au centre exact, à l'échelle du
// zoom choisi. Google ne trace pas de cercle pointillé, d'où ce calque.
const GRILLE = {
  backgroundImage: "linear-gradient(var(--k-trait) 1px, transparent 1px), linear-gradient(90deg, var(--k-trait) 1px, transparent 1px)",
  backgroundSize: "48px 48px",
};
// Mètres par pixel au zoom z (projection de Google, tuiles de 256 px).
const metresParPixel = (lat, z) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

function ApercuZone({ point, rayon, commune }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const [prete, setPrete] = useState(false);
  const [hauteur, setHauteur] = useState(420);

  useEffect(() => {
    const el = conteneur.current?.parentElement;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setHauteur(el.clientHeight || 420));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // La carte se charge au premier point choisi, jamais avant.
  useEffect(() => {
    if (!point || carte.current) return undefined;
    let vivant = true;
    chargerGoogleMaps().then(() => {
      if (!vivant || !conteneur.current || carte.current) return;
      carte.current = new window.google.maps.Map(conteneur.current, {
        center: { lat: point.lat, lng: point.lon }, zoom: 15, mapTypeId: "roadmap",
        disableDefaultUI: true, clickableIcons: false, gestureHandling: "none", keyboardShortcuts: false,
      });
      setPrete(true);
    }).catch(() => { /* sans clé : la grille seule */ });
    return () => { vivant = false; };
  }, [point]);

  // Le zoom qui fait tenir le cercle dans environ 60 % de la hauteur.
  const zoom = point ? Math.max(10, Math.min(18, Math.floor(Math.log2((156543.03392 * Math.cos((point.lat * Math.PI) / 180) * hauteur * 0.6) / (2 * (commune ? 2500 : rayon)))))) : 15;
  const diametre = point && !commune ? (2 * rayon) / metresParPixel(point.lat, zoom) : 0;

  useEffect(() => {
    if (!prete || !point || !carte.current) return;
    carte.current.setCenter({ lat: point.lat, lng: point.lon });
    carte.current.setZoom(zoom);
  }, [prete, point, zoom]);

  return (
    <>
      <div className="absolute inset-0" style={GRILLE} />
      <div ref={conteneur} className={`absolute inset-0 transition-opacity ${point && prete ? "opacity-100" : "opacity-0"}`} />
      {point && (
        <div className="pointer-events-none absolute left-1/2 top-1/2">
          {diametre > 0 && (
            <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-encre/70 bg-encre/[0.06]" style={{ width: diametre, height: diametre }}>
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded-[6px] bg-fond/90 px-2 py-0.5 text-[12px] tabular-nums text-encre">{metres(rayon)}</span>
            </div>
          )}
          <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fond bg-encre" />
        </div>
      )}
      <p className="absolute inset-x-3 bottom-3 m-0 rounded-[8px] bg-fond/90 px-3 py-2 text-[12.5px] text-craie">
        La zone se dessine ici pendant que vous réglez l&apos;adresse et le rayon. Au lancement : les devantures, la société derrière, les murs.
      </p>
    </>
  );
}

// 10 nov. 2026, Jules : écran d'arrivée. Une prospection réalisée, en carte compacte.
function CarteProspection({ x, onOuvrir }) {
  const etat = x.etat === "terminee"
    ? <span className="text-[14px] font-medium tabular-nums text-encre">{x.nb_retenus} retenu{x.nb_retenus > 1 ? "s" : ""} sur {x.nb_commerces}</span>
    : x.etat === "echec" ? <Statut couleur="corail">Échec</Statut>
      : <Statut couleur="bleu">En cours, {x.progression || 0} %</Statut>;
  return (
    <button type="button" onClick={onOuvrir} title={x.par ? `Par ${x.par}` : undefined}
      className={`${CLASSE_CARTE} flex min-w-0 flex-col gap-1 px-3.5 py-3 text-left transition-colors hover:border-bord-doux`}>
      <span className="truncate text-[14px] font-medium text-encre">{x.libelle || x.adresse}</span>
      <span className="truncate text-[13px] text-ardoise">{x.activite || "Tous les commerces"} · {x.zone === "commune" ? "commune entière" : metres(x.rayon_m)}</span>
      <span className="mt-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">{etat}</span>
        <span className="flex-none text-[12.5px] tabular-nums text-ardoise">{quand(x.fini_le || x.cree_le)}</span>
      </span>
    </button>
  );
}

// 10 nov. 2026, Jules : écran d'arrivée. Le volet des critères s'ouvre en
// panneau sous le bouton « Ajouter un groupe de critères », par-dessus l'aperçu.
function VoletCriteres({ groupes, choix, onChoix, onFermer }) {
  const cadre = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    const dehors = (e) => { if (cadre.current && !cadre.current.contains(e.target) && !e.target.closest?.("[data-ouvre-criteres]")) onFermer(); };
    window.addEventListener("keydown", k);
    document.addEventListener("pointerdown", dehors);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("pointerdown", dehors); };
  }, [onFermer]);
  return (
    <div ref={cadre} role="dialog" aria-label="Critères"
      className="absolute left-0 top-[calc(100%+6px)] z-30 w-[760px] max-w-[calc(100vw-32px)] rounded-[12px] border border-trait bg-surface-pleine p-4 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium text-encre">Recherche multi-critères</span>
        <button type="button" onClick={onFermer} aria-label="Fermer les critères" style={{ background: "transparent" }} className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        <Criteres groupes={groupes} choix={choix} onChoix={onChoix} />
      </div>
      <p className="m-0 mt-3 text-[12.5px] leading-[1.6] text-brume">Une option barrée n&apos;a pas de source ouverte : elle n&apos;est pas proposée plutôt que devinée.</p>
    </div>
  );
}

export default function KProspective() {
  const user = useUser();
  const qc = useQueryClient();
  const [activite, setActivite] = useState("");
  const [adresse, setAdresse] = useState("");
  const [rayon, setRayon] = useState(500);
  // Autour d'une adresse, ou une commune entière (lot 9, 18 oct. 2026 ; boîte à outils allumée côté serveur).
  const [zone, setZone] = useState("adresse");
  // Chaque suggestion de la BAN garde ses coordonnées : l'aperçu de la zone s'y centre.
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [point, setPoint] = useState(null);
  const [criteres, setCriteres] = useState({});
  const [voletOuvert, setVoletOuvert] = useState(false);
  const fermerVolet = useCallback(() => setVoletOuvert(false), []);
  const [mecanique, setMecanique] = useState(false);
  const [ouverte, setOuverte] = useState(null);

  // L'équipe, et les mandataires depuis l'onglet K Prospective de leur Prospection.
  const autorise = user?.role === "admin" || user?.role === "mandataire";
  const admin = user?.role === "admin";
  const { data } = useQuery({ queryKey: ["kprospective"], queryFn: () => base44.request("GET", "/api/kprospective"), enabled: autorise });
  const prospections = data?.prospections || [];
  const groupes = data?.criteres || [];
  const metiers = data?.metiers || [];

  const { data: detail } = useQuery({
    queryKey: ["kprospective", ouverte],
    queryFn: () => base44.request("GET", `/api/kprospective/${ouverte}`),
    enabled: !!ouverte,
    refetchInterval: (q) => (q.state.data?.prospection?.etat === "en_cours" ? 2000 : false),
  });
  const p = detail?.prospection;
  useEffect(() => { if (p && p.etat !== "en_cours") qc.invalidateQueries({ queryKey: ["kprospective"], exact: true }); }, [p?.etat, qc]);

  useEffect(() => {
    const q = adresse.trim();
    if (q.length < 3 || q === choisie.current) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://data.geopf.fr/geocodage/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.filter((x) => x.properties?.label).map((x) => ({
          label: x.properties.label, lon: x.geometry?.coordinates?.[0], lat: x.geometry?.coordinates?.[1],
        })));
      } catch { /* BAN injoignable */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", "/api/kprospective", { body: { adresse, activite, rayon_m: rayon, criteres, zone } }),
    onSuccess: (r) => { setOuverte(r.id); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kprospective"], exact: true }); },
    onError: (err) => toast.error(err?.message || "Lancement impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kprospective/${id}`),
    onSuccess: () => { setOuverte(null); qc.invalidateQueries({ queryKey: ["kprospective"], exact: true }); },
  });

  // Ouverte depuis la file de K-Data : « ?id=… » désigne la prospection à lire.
  const { search } = useLocation();
  const vuUrl = useRef("");
  useEffect(() => {
    if (vuUrl.current === search) return;
    const id = new URLSearchParams(search).get("id");
    if (!id) return;
    vuUrl.current = search;
    setOuverte(id);
  }, [search]);

  if (!autorise) return null;

  if (ouverte && p) {
    if (p.etat === "en_cours") return <div className="min-h-screen pt-2"><Chargement prospection={p} /></div>;
    if (p.etat === "echec") return (
      <div className="mx-auto max-w-[620px] px-5 pt-16 text-center">
        <p className="m-0 text-[15px] text-alerte">{p.erreur || "La prospection n'a pas abouti."}</p>
        <BoutonOutil className="mt-6" onClick={() => setOuverte(null)}>Revenir</BoutonOutil>
      </div>
    );
    return <Resultats prospection={p} groupes={groupes} admin={admin} onRetour={() => setOuverte(null)} onSupprimer={() => { if (window.confirm("Supprimer cette prospection ?")) supprimer.mutate(p.id); }} />;
  }

  // 10 nov. 2026, Jules : écran d'arrivée.
  const nbCriteres = Object.values(criteres).reduce((n, v) => n + (v?.length || 0), 0);
  const commune = zone === "commune";
  return (
    <div className="relative px-10 pb-12 pt-6 text-encre max-md:px-4 max-md:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[20px] font-medium text-encre">K-Prospective{prospections.length ? <span className="ml-2 text-[14px] font-normal tabular-nums text-ardoise">{prospections.length}</span> : null}</h1>
        <button type="button" onClick={() => setMecanique((o) => !o)} aria-expanded={mecanique} className="inline-flex h-8 items-center rounded-[8px] border border-bord-doux px-3 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>D&apos;où viennent les chiffres</button>
      </div>
      <p className="m-0 mt-1 text-[13.5px] text-ardoise">Les commerces d&apos;une zone qui répondent à vos critères.</p>
      {mecanique && <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" className="mt-4" ouvertDepart />}

      <div className="mt-5 grid gap-3.5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className={`${CLASSE_CARTE} flex flex-col p-[18px]`}>
          <label htmlFor="kp-adresse" className={ETIQUETTE}>{commune ? "Commune" : "Adresse"}</label>
          <div className="relative">
            <input id="kp-adresse" value={adresse} autoComplete="off"
              onChange={(ev) => { setAdresse(ev.target.value); if (ev.target.value !== choisie.current) setPoint(null); }}
              placeholder={commune ? "Cannes" : "49 rue Dabray, 06000 Nice"} className={CHAMP} />
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-[44px] z-20 m-0 list-none overflow-hidden rounded-[12px] border border-trait bg-surface-pleine p-1 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
                {suggestions.map((s) => (
                  <li key={s.label}>
                    <button type="button" onClick={() => { choisie.current = s.label; setAdresse(s.label); setPoint(Number.isFinite(s.lat) && Number.isFinite(s.lon) ? { lat: s.lat, lon: s.lon, label: s.label } : null); setSuggestions([]); }}
                      style={{ background: "transparent" }} className="block w-full rounded-[8px] px-3 py-2 text-left text-[13.5px] text-craie hover:!bg-relief hover:text-encre max-md:py-3">{s.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label htmlFor="kp-activite" className={`${ETIQUETTE} mt-4`}>Type de commerce</label>
          <input id="kp-activite" list="metiers-prospective" value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant… ou vide pour tous"
            className={CHAMP} />
          <datalist id="metiers-prospective">{metiers.map((m) => <option key={m} value={m} />)}</datalist>

          <p className={`${ETIQUETTE} mt-4`}>Zone</p>
          <Filtres label="Zone" options={[["adresse", "Autour de l'adresse"], ["commune", "Commune entière"]]} valeur={zone} onChange={setZone} className="-ml-1" />

          {!commune && (
            <>
              <p className={`${ETIQUETTE} mt-4`}>Rayon</p>
              <Filtres label="Rayon" options={RAYONS.map((r) => [r, metres(r)])} valeur={rayon} onChange={setRayon} className="-ml-1" />
            </>
          )}

          <p className={`${ETIQUETTE} mt-4`}>Critères · {nbCriteres}</p>
          <div className="relative">
            <button type="button" data-ouvre-criteres onClick={() => setVoletOuvert((v) => !v)} aria-expanded={voletOuvert} style={{ background: "transparent" }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-bord-doux text-[13.5px] text-craie hover:border-bord-vif hover:text-encre">
              <Plus className="h-4 w-4" />Ajouter un groupe de critères
            </button>
            {voletOuvert && <VoletCriteres groupes={groupes} choix={criteres} onChoix={(cle, v) => setCriteres((c) => ({ ...c, [cle]: v }))} onFermer={fermerVolet} />}
          </div>
          <p className="m-0 mt-2 text-[12.5px] leading-[1.5] text-ardoise">Dans un groupe, une option suffit ; entre les groupes, il faut tout.</p>

          <BoutonPrincipal className="mt-5 w-full !h-10 !rounded-[8px]" onClick={() => lancer.mutate()} disabled={lancer.isPending || adresse.trim().length < 5}>
            {lancer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lancer la prospection
          </BoutonPrincipal>
          <p className="m-0 mt-3 text-[12.5px] text-ardoise">Aucun crédit dépensé.</p>
        </div>

        <div className="relative min-h-[420px] overflow-hidden rounded-[12px] border border-trait bg-rail max-lg:h-[360px]">
          <ApercuZone point={point} rayon={rayon} commune={commune} />
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-[15px] font-medium text-encre">Prospections réalisées{prospections.length ? <span className="ml-2 text-[13px] font-normal tabular-nums text-ardoise">{prospections.length}</span> : null}</h2>
      {!prospections.length ? <p className="m-0 text-[13.5px] text-ardoise">Aucune pour l&apos;instant.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {prospections.map((x) => <CarteProspection key={x.id} x={x} onOuvrir={() => setOuverte(x.id)} />)}
        </div>
      )}
    </div>
  );
}
