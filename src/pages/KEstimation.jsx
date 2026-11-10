import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Loader2, ChevronLeft, ChevronRight, Trash2, Calculator } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { BoutonOutil, BoutonPrincipal, Cases, CLASSE_CARTE, CLASSE_TABLE, CLASSE_TABLEAU, CLASSE_TD, CLASSE_TH, classeCase, Filtres, Statut, TitrePage, TRANSPARENT } from "@/components/mandataire/elements";
import { couleurStatut } from "@/lib/couleur-statut";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { MecaniqueEnLigne } from "@/components/kdata/Mecanique";

// K-Estimation : estimer des murs commerciaux par trois méthodes croisées.
//
// Le parcours suit celui de K-Expertise, parce que c'est le même geste : une
// adresse, une attente, un résultat. L'écran de chargement lit le marché à
// l'adresse — ventes de murs à 500 m, commerces autour, niveau de vie, valeur
// locative du secteur. Le formulaire en quatre étapes décrit le statut, le
// local, l'emplacement. La dernière étape confronte trois valeurs : la
// capitalisation du loyer réel, celle de la valeur locative de marché, et les
// comparables de vente — puis retient une fourchette et montre, ligne à ligne,
// ce qui l'a faite bouger.
//
// L'habit est celui des pages de Klocka depuis la planche Outils (10 nov. 2026,
// Jules) : le titre de 24 px, les cases de chiffres, les tableaux à traits
// verticaux, les cartes en bg-rail rayon 12 (elements.jsx de l'espace mandataire).
const ETAPES_FORM = ["Statut", "Le local", "L'emplacement", "Estimation"];

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// La mécanique : dans quel ordre K-Estimation interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse tapée." },
  { source: "DVF, Etalab", quoi: "Les ventes de murs commerciaux à moins de 500 m dans les 36 derniers mois : le prix au m² pondéré par la surface, pour la méthode par comparaison." },
  { source: "OpenStreetMap", quoi: "La densité commerciale autour du point : elle place le taux de capitalisation dans sa bande." },
  { source: "INSEE Filosofi", quoi: "Le niveau de vie de la zone de 800 m : le second signal qui place le taux dans sa bande." },
  { source: "DVF, prix des murs × taux de rendement", quoi: "La valeur locative de marché déduite des ventes à 500 m, au taux de la grille : une déduction, dite comme telle, qui sert de premier repère." },
  { source: "Equimmox, analyse de loyer", quoi: "Après le formulaire, quand il est configuré : les loyers de locaux comparables à 500 m, de surface à ±30 %. Cette lecture remplace celle de la rue." },
  { source: "Vos réponses", quoi: "Statut, locataire, bail, local, emplacement : la grille de taux, puis chaque ajustement, nommé et chiffré." },
];

/** La bande de taux que la grille donne à ces réponses : la même règle que le serveur. */
const bandeDe = (grille, rep) => {
  if (!grille?.length) return null;
  if (rep.ville === "moyenne") return grille[3];
  if (rep.emplacement === "n1") return rep.statut !== "vacant" && rep.locataire === "enseigne" ? grille[0] : grille[1];
  return grille[2];
};

// ── Les briques du formulaire ──────────────────────────────────────────────

// Les étapes sur une ligne, marques rondes numérotées (10 nov. 2026, Jules : planche Outils) :
// faite en case menthe, celle du moment pleine, à venir en relief.
function Fil({ etape }) {
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-2 border-b border-trait pb-3">
      {ETAPES_FORM.map((nom, i) => {
        const n = i + 1;
        const fait = n < etape;
        const ici = n === etape;
        return (
          <span key={nom} aria-current={ici ? "step" : undefined} className={`flex items-center gap-2 text-[13px] ${ici ? "text-encre" : "text-ardoise"}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11.5px] tabular-nums ${ici ? "bg-menthe text-sur-menthe" : fait ? classeCase("menthe") : "bg-relief text-ardoise"}`}>{n}</span>
            {nom}
          </span>
        );
      })}
    </div>
  );
}

function Champ({ label, obligatoire = false, children, aide = null }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[12.5px] text-ardoise">
        {label}{obligatoire && <span className="text-menthe-texte"> *</span>}
      </label>
      {children}
      {aide && <p className="m-0 mt-1 text-[12.5px] text-brume">{aide}</p>}
    </div>
  );
}

/** Un nombre avec son unité collée au champ. */
function Nombre({ valeur, onChange, unite, placeholder = "" }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord-doux bg-fond px-3 focus-within:border-menthe">
      <input
        type="text" inputMode="decimal" value={valeur ?? ""} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full bg-transparent text-[14px] tabular-nums text-encre outline-none placeholder:text-brume max-md:h-10 max-md:text-[16px]"
      />
      <span className="flex-shrink-0 text-[13px] text-ardoise">{unite}</span>
    </div>
  );
}

/** Le choix en filtres ronds, ceux de la planche. */
function Pastilles({ options, valeur, onChange, label }) {
  return <Filtres label={label} options={options.map((o) => [o.valeur, o.nom])} valeur={valeur} onChange={onChange} />;
}

function Boutons({ onRetour, onSuivant, labelSuivant = "Continuer", occupe = false, desactive = false }) {
  return (
    <div className="mt-6 flex items-center gap-2 border-t border-trait pt-4">
      <BoutonOutil onClick={onRetour}><ChevronLeft className="h-3.5 w-3.5" />Retour</BoutonOutil>
      <BoutonPrincipal onClick={onSuivant} disabled={desactive || occupe}>
        {occupe && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{labelSuivant}
        {!occupe && <ChevronRight className="h-3.5 w-3.5" />}
      </BoutonPrincipal>
    </div>
  );
}

// ── La lecture en cours : une ligne, comme une expertise ───────────────────

function EnCours({ estimation: e }) {
  const affinage = !!e?.reponses;
  const etape = (e?.etapes || []).find((s) => s.etat === "en_cours") || (e?.etapes || []).find((s) => s.etat === "a_faire");
  const avance = e?.progression || 0;
  return (
    <div className={`${CLASSE_CARTE} flex flex-col gap-2 px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="text-[14px] text-encre">{affinage ? "Affinage de l'estimation" : "Lecture du marché"}</span>
        <span className="h-1.5 min-w-[120px] flex-[1_1_200px] overflow-hidden rounded-full bg-relief">
          <span className="block h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.max(4, avance)}%` }} />
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-craie">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />{avance} %{etape ? ` · ${etape.nom}` : ""}
        </span>
      </div>
      <p className="m-0 text-[12.5px] text-ardoise">
        {affinage
          ? "Equimmox lit les loyers de locaux comparables dans un navigateur : comptez une minute. Vous pouvez quitter, l'estimation vous attendra dans la liste."
          : "Tout vient de sources ouvertes : DVF, OpenStreetMap, INSEE. Aucun crédit n'est dépensé."}
      </p>
    </div>
  );
}

// ── L'écran d'explication, avant le formulaire ─────────────────────────────

function Explication({ onCommencer }) {
  const methodes = [
    ["Capitalisation du loyer réel", "La méthode reine d'un local loué : le loyer annuel net divisé par un taux de capitalisation, pris dans une grille par classe d'emplacement et de locataire, puis ajusté au bien."],
    ["Capitalisation de la valeur locative de marché", "Ce que le local rapporterait au prix du secteur. Seule méthode par le loyer d'un local vacant ; pour un local loué, elle dit si le loyer facial est au-dessus ou en dessous du marché. La valeur locative est cherchée pour vous."],
    ["Comparables de vente", "Le prix au m², pondéré par la surface, des murs commerciaux vendus à moins de 500 m dans les 36 derniers mois, d'après les actes publiés par l'administration fiscale."],
  ];
  return (
    <div className={`${CLASSE_CARTE} max-w-[900px] p-5 max-md:p-4`}>
      <h2 className="m-0 text-[15px] font-medium text-encre">Comprendre le fonctionnement de l&apos;estimation</h2>
      <p className="m-0 mt-2 text-[14px] leading-[1.65] text-craie">
        Des murs de commerce ne valent pas par leur mètre carré comme un logement : ils valent par le loyer qu&apos;ils rapportent, ou
        rapporteraient, et par le risque que ce loyer s&apos;arrête. L&apos;outil confronte trois regards et en retient une fourchette.
      </p>
      <ol className="m-0 mt-3 list-none p-0">
        {methodes.map(([titre, texte], i) => (
          <li key={titre} className="flex items-start gap-3 border-b border-trait py-2.5 text-[13.5px] text-craie">
            <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-relief text-[11.5px] tabular-nums text-ardoise">{i + 1}</span>
            <span><span className="block text-encre">{titre}</span><span className="block leading-[1.55] text-ardoise">{texte}</span></span>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-3 text-[13.5px] leading-[1.6] text-ardoise">
        <span className="text-encre">Lecture :</span> plus le taux de capitalisation exigé est faible, plus les investisseurs acceptent de payer
        cher les murs. Un taux élevé traduit du risque, donc une valeur plus faible. Un bail triple net, une enseigne nationale,
        une fin de bail proche : chaque ajustement est nommé et chiffré à l&apos;écran.
      </p>
      <BoutonPrincipal onClick={onCommencer} className="mt-5">Commencer l&apos;estimation<ChevronRight className="h-3.5 w-3.5" /></BoutonPrincipal>
    </div>
  );
}

// ── Le résultat ────────────────────────────────────────────────────────────

const virgule = (n) => String(n).replace(".", ",");
const signe = (n) => `${n > 0 ? "+" : ""}${virgule(n)}`;

/** Un titre de section, 15 px, son détail en gris. */
function Titre({ children, detail = null }) {
  return <h2 className="m-0 text-[15px] font-medium text-encre">{children}{detail && <span className="text-[13px] font-normal text-ardoise"> · {detail}</span>}</h2>;
}

/** Un tableau de méthodes : Méthode, Basse, Moyenne, Haute, et le poids quand il y en a un. */
function TableMethodes({ lignes, avecPoids }) {
  return (
    <div className={CLASSE_TABLEAU}>
      <table className={`${CLASSE_TABLE} min-w-[640px]`}>
        <colgroup><col /><col className="w-[140px]" /><col className="w-[140px]" /><col className="w-[140px]" />{avecPoids && <col className="w-[100px]" />}</colgroup>
        <thead><tr>
          <th className={CLASSE_TH}>Méthode</th><th className={CLASSE_TH}>Basse</th><th className={CLASSE_TH}>Moyenne</th><th className={CLASSE_TH}>Haute</th>
          {avecPoids && <th className={CLASSE_TH}>Poids</th>}
        </tr></thead>
        <tbody>
          {lignes.map(({ cle, libelle, m, poids }) => (
            <tr key={cle}>
              <td className={CLASSE_TD} title={libelle}>{libelle}</td>
              <td className={`${CLASSE_TD} tabular-nums`}>{euros(m.basse)}</td>
              <td className={`${CLASSE_TD} tabular-nums !text-encre`}>{euros(m.moyenne)}</td>
              <td className={`${CLASSE_TD} tabular-nums`}>{euros(m.haute)}</td>
              {avecPoids && <td className={`${CLASSE_TD} tabular-nums`}>{poids != null ? `${Math.round(poids * 100)} %` : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Une ligne simple : le libellé à gauche, la valeur ou le point coloré à droite. */
function Ligne({ label, valeur = null, droite = null, fort = false, dernier = false }) {
  return (
    <div className={`flex min-h-[40px] items-center justify-between gap-4 py-1 text-[14px] ${dernier ? "" : "border-b border-trait"}`}>
      <span className={`min-w-0 ${fort ? "font-medium text-encre" : "text-encre"}`}>{label}</span>
      <span className="flex flex-shrink-0 items-center gap-2">
        {valeur != null && <span className={`tabular-nums ${fort ? "font-medium text-encre" : "text-craie"}`}>{valeur}</span>}
        {droite}
      </span>
    </div>
  );
}

/** Le point d'un ajustement de taux : un taux qui baisse fait monter la valeur. */
const Point = ({ points }) => <Statut couleur={points < 0 ? "menthe" : points > 0 ? "ambre" : "gris"} className="tabular-nums">{signe(points)} pt</Statut>;
/** Un ajustement de la matrice, sur la valeur. */
const Ajustement = ({ libelle, pct: p }) => <Statut couleur={p > 0 ? "menthe" : p < 0 ? "corail" : "gris"}>{libelle} {signe(p)} %</Statut>;

function Resultat({ estimation: e }) {
  const r = e.resultat;
  const m = r.methodes || {};
  const t = r.taux;
  const tv = r.trois_valeurs;
  const nMethodes = tv?.valeurs ? Object.values(tv.methodes).filter((x) => !x.redondante).length : Object.keys(m).length;
  const croisees = [
    m.capitalisation && { cle: "capitalisation", libelle: m.capitalisation.libelle, m: m.capitalisation, poids: r.poids.capitalisation },
    m.vlm && { cle: "vlm", libelle: m.vlm.libelle, m: m.vlm, poids: r.poids.vlm },
    m.dvf && { cle: "dvf", libelle: m.dvf.libelle, m: m.dvf, poids: r.poids.dvf },
  ].filter(Boolean);
  const nbAjustements = r.coefficients.length + (m.vlm?.facteurs?.length || 0);

  // Le résultat au dessin de la planche (10 nov. 2026, Jules : planche Outils) : les trois valeurs en cases, la
  // moyenne en accent, les quatre repères en cases, les méthodes en tableau, le taux en lignes, la matrice en cases.
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2.5">
        <p className="m-0 text-[12.5px] text-ardoise">
          Fourchette retenue · {r.statut === "vacant" ? "local vacant" : "local loué"} · {nMethodes} méthode{nMethodes > 1 ? "s" : ""} croisée{nMethodes > 1 ? "s" : ""}{tv?.valeurs ? ` · confiance ${tv.confiance.niveau}` : ""}
        </p>
        {/* Cases ne connaît pas l'accent : la case du milieu se dessine ici, au même gabarit. */}
        <div className="grid gap-2.5 md:grid-cols-3">
          {[["Estimation basse", r.valeurs.basse], ["Estimation moyenne", r.valeurs.moyenne], ["Estimation haute", r.valeurs.haute]].map(([titre, valeur], i) => (
            <div key={titre} className={`min-w-0 rounded-[12px] border bg-rail px-3.5 py-2.5 ${i === 1 ? "border-menthe" : "border-trait"}`}>
              <div className={`truncate text-[18px] font-medium tabular-nums ${i === 1 ? "text-menthe-texte" : "text-encre"}`}>{euros(valeur)}</div>
              <div className="truncate text-[12.5px] text-ardoise">{titre}</div>
            </div>
          ))}
        </div>
        <Cases items={[
          [tv?.valeurs && tv.methodes.capitalisation ? pct(tv.methodes.capitalisation.taux) : t ? pct(t.retenu) : "—", "Taux retenu"],
          [r.loyer_annuel ? `${euros(r.loyer_annuel)} / an` : r.vlm?.loyer ? `${euros(r.vlm.loyer.moyen)} / an (marché)` : "—", "Loyer de référence"],
          [r.surface?.totale ? `${r.surface.totale} m²${r.surface.ponderee !== r.surface.totale ? ` · ${r.surface.ponderee} m² pondérés` : ""}` : "Non renseignée", "Surface"],
          [r.prix_m2 != null ? `${r.prix_m2.toLocaleString("fr-FR")} € / m²` : "—", "Prix au m²"],
        ]} />
      </div>

      {/* Boîte à outils (lot 5, 18 oct. 2026) : comparaison, capitalisation, Equimmox ; la confiance par l'écart. */}
      {tv && (
        <section className="flex flex-col gap-2.5">
          <Titre detail={`confiance ${tv.confiance.niveau}`}>Les trois valeurs</Titre>
          <TableMethodes avecPoids={false} lignes={Object.entries(tv.methodes).map(([k, mm]) => ({ cle: k, libelle: mm.libelle, m: mm }))} />
          <div className="flex flex-col gap-1 text-[12.5px] leading-[1.55] text-ardoise">
            {Object.entries(tv.methodes).map(([k, mm]) => (
              <p key={k} className="m-0">
                <span className="text-craie">{mm.libelle} : </span>
                {mm.prix_m2 ? `${euros(mm.prix_m2.bas)} à ${euros(mm.prix_m2.haut)} / m², médiane ${euros(mm.prix_m2.median)}. ` : ""}
                {k === "capitalisation" ? `${euros(mm.loyer)} de loyer annuel à ${pct(mm.taux)} ; taux : ${mm.taux_origine}.` : `Source : ${mm.source}.`}
                {mm.redondante && <span className="block text-brume">{mm.note}</span>}
              </p>
            ))}
            <p className="m-0">{tv.confiance.raison} {tv.regle}</p>
            {tv.manques.length > 0 && <p className="m-0 text-ambre">Manque : {tv.manques.join(" ; ")}.</p>}
            {r.depuis_trois_valeurs && r.raison_ancien_calcul && <p className="m-0 text-brume">La fourchette ci-dessus vient des trois valeurs : {r.raison_ancien_calcul.charAt(0).toLowerCase() + r.raison_ancien_calcul.slice(1)}</p>}
          </div>
        </section>
      )}

      {/* Les méthodes croisées, en tableau, chacune avec son poids. */}
      <section className="flex flex-col gap-2.5">
        <Titre detail={!r.valeurs_grille && tv?.valeurs ? `confiance ${tv.confiance.niveau}` : null}>
          {r.valeurs_grille ? `L'ancien calcul, sur la grille de taux, pour comparer · ${euros(r.valeurs_grille.moyenne)}` : "Les méthodes croisées"}
        </Titre>
        {croisees.length > 0 && <TableMethodes avecPoids lignes={croisees} />}
        <div className="flex flex-col gap-1 text-[12.5px] leading-[1.55] text-ardoise">
          {m.capitalisation && (
            <p className="m-0">
              <span className="text-craie">{m.capitalisation.libelle} : </span>
              {euros(m.capitalisation.loyer)} de loyer annuel net, capitalisé à {pct(m.capitalisation.taux)}, de {pct(m.capitalisation.taux_bas)} à {pct(m.capitalisation.taux_haut)} pour la fourchette.
              {r.coefficient_valeur !== 1 ? ` Coefficient d'ajustement de ${virgule(r.coefficient_valeur)} appliqué.` : ""}
            </p>
          )}
          {m.vlm && (
            <p className="m-0">
              <span className="text-craie">{m.vlm.libelle} : </span>
              {m.vlm.source}, {m.vlm.detail} : {euros(m.vlm.m2.bas)} à {euros(m.vlm.m2.haut)} HT HC / m² / an, soit {euros(m.vlm.loyer.moyen)} de loyer de marché sur la surface pondérée, capitalisé à {pct(m.vlm.taux)}.
              {r.vlm?.ecart_facial_pct != null ? ` Le loyer facial est ${Math.abs(r.vlm.ecart_facial_pct)} % ${r.vlm.ecart_facial_pct >= 0 ? "au-dessus" : "en dessous"} du marché.` : ""}
              {m.vlm.facteurs?.map((f) => ` ${f.libelle} : ${f.pct} % sur la valeur locative.`).join("")}
            </p>
          )}
          {m.vlm?.alternatives?.length > 0 && (
            <p className="m-0 text-brume">
              {/* Deux sources peuvent diverger fortement : la lecture non retenue
                  reste visible, nommée, pour que l'écart se voie. */}
              Autre lecture, non retenue : {m.vlm.alternatives.map((a) => `${a.source}, ${a.detail} : ${euros(a.bas)} à ${euros(a.haut)} / m² / an`).join(" ; ")}.
              La lecture retenue est la plus spécifique au bien.
            </p>
          )}
          {m.dvf && (
            <p className="m-0">
              <span className="text-craie">{m.dvf.libelle} : </span>
              {m.dvf.prix_m2_pondere.toLocaleString("fr-FR")} € / m² pondéré par la surface, de {m.dvf.bas_m2.toLocaleString("fr-FR")} à {m.dvf.haut_m2.toLocaleString("fr-FR")} € pour la fourchette, sur {r.surface.totale} m² de surface totale.
            </p>
          )}
          {!m.dvf && e.marche?.dvf && (
            <p className="m-0 text-brume">
              Comparables DVF : {e.marche.dvf.n} vente{e.marche.dvf.n > 1 ? "s" : ""} à 500 m sur 36 mois, trop peu pour une méthode. Elles ne pèsent pas.
            </p>
          )}
        </div>
        {m.dvf && (
          <div className={`${CLASSE_CARTE} max-h-[220px] overflow-y-auto px-3.5`}>
            {m.dvf.ventes.map((v, i) => (
              <div key={i} className="flex min-h-[36px] items-center justify-between gap-3 border-b border-trait py-1 text-[13px] last:border-b-0 max-md:flex-col max-md:items-start max-md:gap-0.5">
                <span className="min-w-0 truncate text-encre max-md:max-w-full">{v.adresse || "Vente"} <span className="text-ardoise">· {quand(v.date)}{v.distance_m != null ? ` · ${v.distance_m} m` : ""}</span></span>
                <span className="flex-shrink-0 tabular-nums text-craie">{euros(v.prix)} <span className="text-ardoise">· {v.surface} m² · {v.prix_m2?.toLocaleString("fr-FR")} €/m²</span></span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-6">
        {/* Le taux, du plus large au plus fin : la bande, la place, les ajustements (absent quand seules les trois valeurs répondent). */}
        {t && (
          <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
            <Titre>Pourquoi ce taux</Titre>
            <div>
              <Ligne label={`${t.bande.libelle}${t.bande.interpolee ? " (bande interpolée)" : ""}`} valeur={`${pct(t.bande.bande[0])} à ${pct(t.bande.bande[1])}`} />
              {t.raisons.map((x, i) => <Ligne key={`r${i}`} label={x.libelle} />)}
              {t.raisons.length > 0 && <Ligne label="Place dans la bande d'après le quartier" valeur={`${Math.round(t.position * 100)} % → ${pct(t.base)}`} />}
              {t.facteurs.map((f, i) => <Ligne key={`f${i}`} label={f.libelle} droite={<Point points={f.points} />} />)}
              <Ligne fort dernier label={`Taux retenu${r.statut === "vacant" ? " · risque de vacance compris" : ""}`} valeur={pct(r.statut === "vacant" ? t.vacant : t.retenu)} />
            </div>
          </section>
        )}

        {/* La matrice d'ajustements sur la valeur, en cases colorées. */}
        <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
          <Titre>La matrice d&apos;ajustements</Titre>
          {!nbAjustements ? <p className="m-0 text-[13.5px] text-ardoise">Aucun ajustement sur la valeur : ni triple net, ni fin de bail proche, ni surloyer.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {r.coefficients.map((c, i) => <Ajustement key={`c${i}`} libelle={c.libelle} pct={c.pct} />)}
              {m.vlm?.facteurs?.map((f, i) => <Ajustement key={`v${i}`} libelle={`${f.libelle} (sur la valeur locative)`} pct={f.pct} />)}
            </div>
          )}
          {r.coefficients.length > 0 && <span className="text-[13px] tabular-nums text-craie">Coefficient sur les méthodes par le loyer : × {virgule(r.coefficient_valeur)}</span>}
          {r.taux_effort != null && <span className="text-[13px] text-craie">Taux d&apos;effort du locataire : {pct(r.taux_effort)} du chiffre d&apos;affaires</span>}
        </section>
      </div>

      <p className="m-0 text-[12.5px] leading-[1.6] text-brume">
        La fourchette retenue est la moyenne pondérée des méthodes disponibles : le loyer réel pèse la moitié quand il existe, le marché
        locatif et les ventes se partagent le reste. Les coefficients de la matrice retiennent le milieu des fourchettes d&apos;usage
        (triple net +7,5 %, fin de bail proche -7,5 %, restaurant sans extraction -12,5 % sur la valeur locative). La réserve et la cave
        pèsent 40 % de la surface de vente. Une estimation n&apos;est pas une expertise : elle situe, elle ne vaut pas avis de valeur.
      </p>

      <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" />
    </div>
  );
}

// ── Le formulaire, quatre étapes ───────────────────────────────────────────

// Les écrans des questions : la même carte, des champs de 36 px, les choix en filtres ronds.
function Question({ titre, sous, children }) {
  return (
    <div className={`${CLASSE_CARTE} max-w-[900px] p-5 max-md:p-4`}>
      <h2 className="m-0 text-[15px] font-medium text-encre">{titre}</h2>
      <p className="m-0 mt-1 mb-5 text-[13.5px] text-ardoise">{sous}</p>
      {children}
    </div>
  );
}

// L'étape vit dans la page depuis la planche Outils (10 nov. 2026) : « Revoir les réponses » est dans l'en-tête.
function Formulaire({ estimation: e, choix, grille, etape, setEtape, onCalculee, onQuitter }) {
  const [rep, setRep] = useState(() => e.reponses || { statut: "loue", ville: "grande", emplacement: "n1bis" });
  const poser = (cle, v) => setRep((r) => ({ ...r, [cle]: v }));
  const loue = rep.statut !== "vacant";
  const bande = bandeDe(grille, rep);
  const vlmConnue = !!(e.marche?.vlm_equimmox?.basse || e.marche?.vlm_dvf?.basse);

  const enregistrer = useMutation({
    mutationFn: () => base44.request("PATCH", `/api/kestimation/${e.id}`, { body: { reponses: rep } }),
    onSuccess: (r) => { onCalculee(r.estimation); setEtape(4); },
    onError: (err) => toast.error(err?.message || "Estimation impossible"),
  });

  const Options = ({ cle }) => <Pastilles label={choix?.[cle]?.libelle || cle} options={choix?.[cle]?.options || []} valeur={rep[cle]} onChange={(v) => poser(cle, v)} />;
  const champ = "h-9 w-full rounded-[10px] border border-bord-doux bg-fond px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:h-10 max-md:text-[16px]";

  if (etape === 0) return <Explication onCommencer={() => setEtape(1)} />;

  return (
    <div className="flex flex-col gap-[18px]">
      <Fil etape={etape} />

      {etape === 1 && (
        <Question titre="Statut d'occupation" sous="Un local loué s'estime d'abord par son loyer ; un local vacant par la valeur locative de marché, que l'outil est allé chercher.">
          <Champ label="Le local est"><Options cle="statut" /></Champ>
          {loue ? (
            <>
              <Champ label="Loyer annuel net (HT / HC)" obligatoire>
                <Nombre valeur={rep.loyer_annuel} onChange={(v) => poser("loyer_annuel", v)} unite="€ / an" placeholder="30 000" />
              </Champ>
              <div className="grid gap-4 md:grid-cols-2">
                <Champ label="Date de fin de bail" aide="Une fin de bail à moins de dix-huit mois sans accord de renouvellement est un risque de vacance.">
                  <input type="date" value={rep.fin_bail || ""} onChange={(ev) => poser("fin_bail", ev.target.value)} className={champ} />
                </Champ>
                <Champ label="Renouvellement"><Options cle="renouvellement" /></Champ>
              </div>
              <Champ label="Type de locataire" aide="Une enseigne nationale ou une franchise se capitalise à un taux plus bas : locataire institutionnel, bail long."><Options cle="locataire" /></Champ>
              <div className="grid gap-4 md:grid-cols-2">
                <Champ label="Taxe foncière"><Options cle="taxe_fonciere" /></Champ>
                <Champ label="Travaux de l'article 606" aide="Taxe foncière et article 606 au locataire : un bail triple net, qui vaut plus."><Options cle="travaux_606" /></Champ>
              </div>
              <Champ label="Retards de paiement ?"><Options cle="retards" /></Champ>
              <Champ label="Dernier chiffre d'affaires HT du locataire" aide="Facultatif. Il sert à mesurer le taux d'effort : un loyer qui prend plus de douze pour cent du chiffre d'affaires tient mal.">
                <Nombre valeur={rep.ca_ht} onChange={(v) => poser("ca_ht", v)} unite="€" placeholder="250 000" />
              </Champ>
            </>
          ) : (
            <p className="m-0 border-y border-trait py-3 text-[13.5px] leading-[1.6] text-craie">
              {vlmConnue
                ? "La valeur locative de marché du secteur a été lue : elle donnera le loyer que ce local rapporterait, sur sa surface, à l'étape suivante."
                : "Aucune valeur locative de marché n'a pu être lue pour cette adresse. Sans elle ni loyer, un local vacant ne peut s'estimer que par les ventes comparables, s'il y en a assez."}
            </p>
          )}
          <Boutons onRetour={onQuitter} onSuivant={() => setEtape(2)} desactive={loue && !String(rep.loyer_annuel || "").trim()} />
        </Question>
      )}

      {etape === 2 && (
        <Question titre="Le local" sous="Ses surfaces, sa vitrine, ses équipements, son état.">
          <div className="grid gap-4 md:grid-cols-3">
            <Champ label="Surface totale" obligatoire={!loue} aide={loue ? "Recommandée : elle sert aux comparables de vente et à la valeur locative." : "Nécessaire : la valeur locative se calcule dessus."}>
              <Nombre valeur={rep.surface_m2} onChange={(v) => poser("surface_m2", v)} unite="m²" placeholder="100" />
            </Champ>
            <Champ label="Surface de vente en RDC"><Nombre valeur={rep.surface_vente_m2} onChange={(v) => poser("surface_vente_m2", v)} unite="m²" placeholder="70" /></Champ>
            <Champ label="Réserve, cave" aide="Comptée à 40 % de la surface de vente."><Nombre valeur={rep.surface_reserve_m2} onChange={(v) => poser("surface_reserve_m2", v)} unite="m²" placeholder="30" /></Champ>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Champ label="Mètres linéaires de vitrine"><Nombre valeur={rep.vitrine_m} onChange={(v) => poser("vitrine_m", v)} unite="m" placeholder="6" /></Champ>
            <Champ label="Extraction" aide="Indispensable pour la restauration : sans elle, moins de preneurs possibles."><Options cle="extraction" /></Champ>
          </div>
          <Champ label="Local d'angle ?"><Options cle="angle" /></Champ>
          <div className="grid gap-4 md:grid-cols-2">
            <Champ label="Parking disponible ?"><Options cle="parking" /></Champ>
            <Champ label="Accessibilité PMR"><Options cle="pmr" /></Champ>
          </div>
          <Champ label="État général du bâtiment"><Options cle="etat_batiment" /></Champ>
          <Champ label="État général du local"><Options cle="etat_local" /></Champ>
          <Boutons onRetour={() => setEtape(1)} onSuivant={() => setEtape(3)} desactive={!loue && !String(rep.surface_m2 || "").trim()} />
        </Question>
      )}

      {etape === 3 && (
        <Question titre="L'emplacement" sous="La classe d'emplacement et le type de ville fixent la bande du taux de capitalisation ; le quartier place le taux dans sa bande.">
          <Champ label="Type de ville"><Options cle="ville" /></Champ>
          <Champ label="Classe d'emplacement" aide="N°1 : flux fort, enseignes. N°1 bis : à deux pas. N°2 : rue secondaire."><Options cle="emplacement" /></Champ>
          {grille?.length > 0 && (
            <div className="mb-4">
              <p className="m-0 mb-1 text-[12.5px] text-ardoise">La grille des taux de capitalisation</p>
              {grille.map((g) => (
                <div key={g.cle} className={`flex min-h-[36px] items-center justify-between gap-3 border-b border-trait py-1 text-[13.5px] last:border-b-0 ${bande?.cle === g.cle ? "text-menthe-texte" : "text-craie"}`}>
                  <span>{g.libelle}{g.interpolee ? " (interpolée)" : ""}{bande?.cle === g.cle ? " ← vos réponses" : ""}</span>
                  <span className="flex-shrink-0 tabular-nums">{pct(g.bande[0])} à {pct(g.bande[1])}</span>
                </div>
              ))}
            </div>
          )}
          <Boutons onRetour={() => setEtape(2)} onSuivant={() => enregistrer.mutate()} labelSuivant="Estimer" occupe={enregistrer.isPending} />
        </Question>
      )}

      {etape === 4 && e.resultat && <Resultat estimation={e} />}
      {etape === 4 && !e.resultat && <p className="m-0 text-[13.5px] text-ardoise">Le calcul n&apos;a pas abouti.{e.erreur_affinage ? ` ${e.erreur_affinage}` : ""}</p>}
    </div>
  );
}

// ── La page ────────────────────────────────────────────────────────────────

const ETAT_LIBELLE = (x) => (x.etat === "en_cours" ? `En cours, ${x.progression || 0} %` : x.etat === "echec" ? "Échouée" : x.valeur != null ? "Terminée" : "Réponses à donner");
const PAR = (email) => (email ? String(email).split("@")[0] : "—");
const CHAMP = "h-9 w-full rounded-[10px] border border-bord-doux bg-fond px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:h-10 max-md:text-[16px]";

/** Le lien de tête : « ← Outils », et la partie quand il y en a une. */
function FilAriane({ partie = null, onPartie = null }) {
  return (
    <div className="flex items-center gap-1 text-[13px] text-ardoise">
      <Link to={createPageUrl("KData")} className="text-ardoise no-underline hover:text-encre">← Outils</Link>
      {partie && <><span aria-hidden="true">·</span>
        {onPartie ? <button type="button" style={TRANSPARENT} onClick={onPartie} className="text-ardoise hover:text-encre">{partie}</button> : <span>{partie}</span>}</>}
    </div>
  );
}

// La page au dessin des pages de Klocka (10 nov. 2026, Jules : planche Outils) : la barre latérale de Layout, pas
// de barre du haut, donc toute la hauteur ; les marges et la largeur des Projets.
function Page({ children }) {
  return (
    <div className="min-h-screen px-5 py-[22px] text-encre md:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-[18px]">{children}</div>
    </div>
  );
}

export default function KEstimation() {
  const user = useUser();
  const qc = useQueryClient();
  // Une seule partie pour l'instant : on y entre directement depuis le menu
  // Apps, sans passer par un accueil de module qui n'aurait qu'une carte.
  const [partie, setPartie] = useState("murs");
  const [activite, setActivite] = useState("");
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  // L'adresse retenue dans la liste : le champ la contient, on ne repropose rien.
  const choisie = useRef("");
  const [ouverte, setOuverte] = useState(null);
  // L'étape du formulaire ; nulle, elle suit l'estimation (le résultat s'il existe, sinon l'explication).
  const [etape, setEtape] = useState(null);
  const [filtre, setFiltre] = useState("toutes");

  const { data } = useQuery({ queryKey: ["kestimation"], queryFn: () => base44.request("GET", "/api/kestimation"), enabled: user?.role === "admin" });
  const estimations = data?.estimations || [];
  const choix = data?.choix;
  const grille = data?.grille || [];

  const { data: detail } = useQuery({
    queryKey: ["kestimation", ouverte],
    queryFn: () => base44.request("GET", `/api/kestimation/${ouverte}`),
    enabled: !!ouverte,
    refetchInterval: (q) => (q.state.data?.estimation?.etat === "en_cours" ? 1500 : false),
  });
  const e = detail?.estimation;
  useEffect(() => {
    if (e && e.etat !== "en_cours") qc.invalidateQueries({ queryKey: ["kestimation"], exact: true });
  }, [e?.etat, qc]);
  useEffect(() => { setEtape(null); }, [ouverte]);

  useEffect(() => {
    const q = adresse.trim();
    if (q.length < 3 || q === choisie.current) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://data.geopf.fr/geocodage/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* BAN injoignable */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", "/api/kestimation", { body: { adresse, activite } }),
    onSuccess: (r) => { setOuverte(r.id); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kestimation"], exact: true }); },
    onError: (err) => toast.error(err?.message || "Lancement impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kestimation/${id}`),
    onSuccess: () => { setOuverte(null); qc.invalidateQueries({ queryKey: ["kestimation"], exact: true }); },
  });

  const titre = useMemo(() => e?.libelle || e?.adresse || "", [e]);

  // Ouverte depuis la file de K-Data : « ?id=… » désigne l'estimation à reprendre.
  const { search } = useLocation();
  const vuUrl = useRef("");
  useEffect(() => {
    if (vuUrl.current === search) return;
    const id = new URLSearchParams(search).get("id");
    if (!id) return;
    vuUrl.current = search;
    setOuverte(id);
  }, [search]);

  if (!user || user.role !== "admin") return null;

  // Une estimation ouverte : la lecture en cours, puis le formulaire et le résultat.
  if (ouverte && e) {
    const vlm = e.marche?.vlm_equimmox?.basse ? e.marche.vlm_equimmox : e.marche?.vlm_dvf;
    const etapeVue = etape ?? (e.resultat ? 4 : 0);
    const enCours = e.etat === "en_cours";
    const echec = e.etat === "echec";
    return (
      <Page>
        <div className="flex flex-col gap-1.5">
          <FilAriane partie="Estimation" onPartie={() => setOuverte(null)} />
          <TitrePage titre={titre} className="md:!pr-[112px]" actions={<>
            {!enCours && !echec && etapeVue === 4 && e.resultat && <BoutonOutil onClick={() => setEtape(1)}><ChevronLeft className="h-3.5 w-3.5" />Revoir les réponses</BoutonOutil>}
            <BoutonOutil onClick={() => { if (window.confirm("Supprimer cette estimation ?")) supprimer.mutate(e.id); }} className="hover:!border-alerte hover:!text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</BoutonOutil>
            <BoutonPrincipal onClick={() => setOuverte(null)}>Nouvelle estimation</BoutonPrincipal>
          </>} />
          <p className="m-0 text-[13.5px] text-ardoise">
            Murs de commerce{e.activite ? ` · ${e.activite}` : ""}
            {e.marche?.dvf?.n != null && <span> · {e.marche.dvf.n} vente{e.marche.dvf.n > 1 ? "s" : ""} de murs à 500 m sur 36 mois</span>}
            {vlm?.basse && <span> · valeur locative de {euros(vlm.basse)} à {euros(vlm.haute)} / m² / an</span>}
          </p>
        </div>
        {enCours && <EnCours estimation={e} />}
        {echec && (
          <div className={`${CLASSE_CARTE} flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3`}>
            <span className="min-w-0 flex-1 text-[14px] text-alerte">{e.erreur || "La lecture du marché n'a pas abouti."}</span>
            <BoutonOutil onClick={() => setOuverte(null)}>Revenir</BoutonOutil>
          </div>
        )}
        {!enCours && !echec && (
          <Formulaire estimation={e} choix={choix} grille={grille} etape={etapeVue} setEtape={setEtape}
            onCalculee={(estimation) => { qc.setQueryData(["kestimation", e.id], { estimation }); qc.invalidateQueries({ queryKey: ["kestimation"], exact: true }); }}
            onQuitter={() => setOuverte(null)} />
        )}
      </Page>
    );
  }

  // L'accueil du module : ses parties. Une seule pour l'instant.
  if (!partie) {
    return (
      <Page>
        <div className="flex flex-col gap-1.5">
          <FilAriane />
          <TitrePage titre="Estimation" className="md:!pr-[112px]" />
          <p className="m-0 text-[13.5px] text-ardoise">Estimer un bien commercial à partir de ce qu&apos;il rapporte, et de ce qu&apos;un investisseur exige pour l&apos;acheter.</p>
        </div>
        <button type="button" onClick={() => setPartie("murs")} className={`${CLASSE_CARTE} !bg-rail flex max-w-[900px] items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:border-bord-vif`}>
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-relief"><Calculator className="h-4 w-4 text-menthe" /></span>
          <span className="min-w-0">
            <span className="block text-[15px] text-encre">Estimation de murs commerciaux</span>
            <span className="block text-[13.5px] text-ardoise">Le loyer, la valeur locative de marché et les ventes comparables, croisés en une fourchette.</span>
          </span>
        </button>
      </Page>
    );
  }

  const lancerSiPret = (ev) => { ev.preventDefault(); if (!lancer.isPending && adresse.trim().length >= 5) lancer.mutate(); };
  const nbEnCours = estimations.filter((x) => x.etat === "en_cours").length;
  const visibles = filtre === "miennes" ? estimations.filter((x) => x.par && x.par === user?.email)
    : filtre === "en_cours" ? estimations.filter((x) => x.etat === "en_cours") : estimations;

  // Le départ : un type de commerce, une adresse, sur une ligne ; puis le tableau des estimations.
  return (
    <Page>
      <div className="flex flex-col gap-1.5">
        <FilAriane partie="Estimation" onPartie={() => setPartie(null)} />
        <TitrePage titre="Estimation de murs commerciaux" nombre={estimations.length || null} className="md:!pr-[112px]" />
        <p className="m-0 text-[13.5px] text-ardoise">Le loyer, la valeur locative de marché et les ventes comparables, croisés en une fourchette.</p>
      </div>

      <form onSubmit={lancerSiPret} className={`${CLASSE_CARTE} px-4 py-3.5`}>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 text-[12.5px] text-ardoise">Type de commerce
            <input value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant… ou vide pour tous" className={CHAMP} />
          </label>
          <div className="relative flex min-w-0 flex-[2_1_320px] flex-col gap-1.5">
            <label htmlFor="kestimation-adresse" className="text-[12.5px] text-ardoise">Adresse précise</label>
            <input id="kestimation-adresse" value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="48 rue Basfroi, 75011 Paris" autoComplete="off" className={CHAMP} />
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 m-0 mt-1 list-none overflow-hidden rounded-[14px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
                {suggestions.map((s) => <li key={s}><button type="button" style={TRANSPARENT} onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13.5px] text-craie hover:!bg-relief hover:text-encre">{s}</button></li>)}
              </ul>
            )}
          </div>
          <BoutonPrincipal type="submit" disabled={lancer.isPending || adresse.trim().length < 5} className="h-9">
            {lancer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Commencer l&apos;estimation
          </BoutonPrincipal>
        </div>
        <p className="m-0 mt-2.5 text-[12.5px] leading-[1.55] text-brume">
          La lecture du marché prend les ventes de murs à 500 m, les commerces autour, le niveau de vie de la zone, et la valeur
          locative déduite des ventes au taux de rendement. Rien n&apos;est payant ; Equimmox affinera après le formulaire.
        </p>
      </form>

      <section aria-labelledby="t-estimations" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 id="t-estimations" className="m-0 text-[15px] font-medium text-encre">Estimations réalisées</h2>
          <Filtres label="Filtres des estimations" valeur={filtre} onChange={setFiltre}
            options={[["toutes", "Toutes", estimations.length || null], ["miennes", "Les miennes"], ["en_cours", "En cours", nbEnCours || null]]} />
        </div>
        {!visibles.length ? <p className="m-0 text-[13.5px] text-brume">{estimations.length ? "Aucune dans ce filtre." : "Aucune pour l'instant."}</p> : (
          <div className={CLASSE_TABLEAU}>
            <table className={`${CLASSE_TABLE} min-w-[760px]`}>
              <colgroup><col /><col className="w-[180px]" /><col className="w-[140px]" /><col className="w-[160px]" /><col className="w-[130px]" /><col className="w-[110px]" /></colgroup>
              <thead><tr><th className={CLASSE_TH}>Adresse</th><th className={CLASSE_TH}>Activité</th><th className={CLASSE_TH}>Estimation</th><th className={CLASSE_TH}>État</th><th className={CLASSE_TH}>Par</th><th className={CLASSE_TH}>Date</th></tr></thead>
              <tbody>
                {visibles.map((x) => (
                  <tr key={x.id} onClick={() => setOuverte(x.id)} className="cursor-pointer hover:bg-relief">
                    <td className={CLASSE_TD} title={x.libelle || x.adresse}>{x.libelle || x.adresse}</td>
                    <td className={CLASSE_TD}>{x.activite}</td>
                    <td className={`${CLASSE_TD} tabular-nums`}>{x.valeur != null ? euros(x.valeur) : "—"}</td>
                    <td className={`${CLASSE_TD} ${classeCase(couleurStatut(ETAT_LIBELLE(x)))}`}>{ETAT_LIBELLE(x)}</td>
                    <td className={CLASSE_TD} title={x.par || ""}>{PAR(x.par)}</td>
                    <td className={`${CLASSE_TD} tabular-nums`}>{quand(x.fini_le || x.cree_le)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}
