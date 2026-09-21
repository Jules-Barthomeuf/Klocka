import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Search, Play, Loader2, ChevronLeft, ChevronRight, Trash2, Check, X, Clock, Calculator } from "lucide-react";
import { base44 } from "@/api/base44Client";
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
// L'habit est celui des cartes du tableau de bord K-Data : bg-surface, filet
// trait, rayon de 18, sans flou.

const CARTE = "rounded-[18px] border border-trait bg-surface";
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

function Fil({ etape }) {
  return (
    <div className="mb-7 flex flex-wrap items-center gap-2">
      {ETAPES_FORM.map((nom, i) => {
        const n = i + 1;
        const fait = n < etape;
        const ici = n === etape;
        return (
          <React.Fragment key={nom}>
            {i > 0 && <span className="h-px w-5 bg-trait" />}
            <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[.12em] ${ici ? "bg-menthe/[0.12] text-menthe-texte" : fait ? "text-menthe-texte" : "text-brume"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${ici || fait ? "border-menthe/50" : "border-bord"}`}>
                {fait ? <Check className="h-3 w-3" /> : n}
              </span>
              {nom}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Champ({ label, obligatoire = false, children, aide = null }) {
  return (
    <div className="mb-4">
      <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">
        {label}{obligatoire && <span className="text-menthe-texte"> *</span>}
      </label>
      {children}
      {aide && <p className="m-0 mt-1 text-[11px] text-brume">{aide}</p>}
    </div>
  );
}

/** Un nombre avec son unité collée au champ. */
function Nombre({ valeur, onChange, unite, placeholder = "" }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
      <input
        type="text" inputMode="decimal" value={valeur ?? ""} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full bg-transparent text-[14px] tabular-nums text-encre outline-none placeholder:text-brume"
      />
      <span className="flex-shrink-0 text-[13px] text-ardoise">{unite}</span>
    </div>
  );
}

/** Le choix en pastilles : c'est la forme du formulaire d'origine. */
function Pastilles({ options, valeur, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const actif = valeur === o.valeur;
        return (
          <button
            key={o.valeur} type="button" onClick={() => onChange(o.valeur)}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${actif ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:border-bord-doux hover:text-encre"}`}
          >
            {o.nom}
          </button>
        );
      })}
    </div>
  );
}

function Boutons({ onRetour, onSuivant, labelSuivant = "Continuer", occupe = false, desactive = false }) {
  return (
    <div className="mt-7 flex items-center gap-2 border-t border-trait pt-5">
      <button onClick={onRetour} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-bord px-4 text-[12px] uppercase tracking-[.12em] text-ardoise hover:text-encre">
        <ChevronLeft className="h-3.5 w-3.5" />Retour
      </button>
      <button onClick={onSuivant} disabled={desactive || occupe}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-menthe px-5 text-[12px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
        {occupe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{labelSuivant}
        {!occupe && <ChevronRight className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── L'écran de chargement, le même geste que pour une expertise ────────────

function Chargement({ estimation: e }) {
  const affinage = !!e?.reponses;
  return (
    <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">{affinage ? "Affinage de l'estimation" : "Lecture du marché"}</p>
      <h2 className="mt-2 mb-1 text-[24px] font-light text-encre">{e?.libelle || e?.adresse}</h2>
      <p className="m-0 text-[13px] text-ardoise">{e?.activite}</p>
      <div className="mx-auto mt-8 h-3 w-full overflow-hidden rounded-full bg-relief">
        <div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.max(4, e?.progression || 0)}%` }} />
      </div>
      <p className="m-0 mt-2 text-[12px] tabular-nums text-brume">{e?.progression || 0} %</p>
      <ul className="mx-auto mt-8 m-0 max-w-[520px] list-none space-y-2 p-0 text-left">
        {(e?.etapes || []).map((s) => (
          <li key={s.cle} className="flex items-start gap-3 text-[13px]">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-bord">
              {s.etat === "faite" ? <Check className="h-3 w-3 text-vert" /> : s.etat === "ratee" ? <X className="h-3 w-3 text-alerte" /> : s.etat === "en_cours" ? <Loader2 className="h-3 w-3 animate-spin text-menthe" /> : <Clock className="h-3 w-3 text-brume" />}
            </span>
            <span className="min-w-0">
              <span className={`block ${s.etat === "a_faire" ? "text-brume" : "text-encre"}`}>{s.nom}</span>
              {s.detail && <span className="block text-[11.5px] text-ardoise">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 mb-0 text-[11.5px] leading-[1.6] text-brume">
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
    <div className={`${CARTE} p-7 max-md:p-4`}>
      <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">Comprendre le fonctionnement de l&apos;estimation</h2>
      <div className="mt-4 space-y-3 text-[13.5px] leading-[1.75] text-craie">
        <p className="m-0">
          Des murs de commerce ne valent pas par leur mètre carré comme un logement : ils valent par le loyer qu&apos;ils rapportent, ou
          rapporteraient, et par le risque que ce loyer s&apos;arrête. L&apos;outil confronte trois regards et en retient une fourchette.
        </p>
      </div>
      <ol className="m-0 mt-5 list-none space-y-2 p-0">
        {methodes.map(([titre, texte], i) => (
          <li key={titre} className="flex items-start gap-3 rounded-[12px] border border-trait bg-relief px-4 py-3 text-[13px] text-craie">
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-menthe/50 text-[11px] text-menthe-texte">{i + 1}</span>
            <span><span className="block font-medium text-encre">{titre}</span><span className="block leading-[1.6]">{texte}</span></span>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-4 rounded-[12px] border border-trait bg-relief p-4 text-[13px] leading-[1.7] text-craie">
        <span className="font-medium text-encre">Lecture :</span> plus le taux de capitalisation exigé est faible, plus les investisseurs acceptent de payer
        cher les murs. Un taux élevé traduit du risque, donc une valeur plus faible. Un bail triple net, une enseigne nationale,
        une fin de bail proche : chaque ajustement est nommé et chiffré à l&apos;écran.
      </p>
      <button onClick={onCommencer}
        className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe">
        <Play className="h-4 w-4" />Commencer l&apos;estimation
      </button>
    </div>
  );
}

// ── Le résultat ────────────────────────────────────────────────────────────

function Fourchette({ titre, m, poids, accent = false }) {
  return (
    <div className={`overflow-hidden rounded-[12px] border ${accent ? "border-menthe/40" : "border-bord"}`}>
      <div className="flex items-center justify-between bg-relief px-3 py-1.5">
        <p className="m-0 text-[11px] uppercase tracking-[.08em] text-brume">{titre}</p>
        {poids != null && <span className="text-[10.5px] tabular-nums text-menthe-texte">poids {Math.round(poids * 100)} %</span>}
      </div>
      <div className="grid grid-cols-3 divide-x divide-trait">
        {[["basse", m.basse], ["moyenne", m.moyenne], ["haute", m.haute]].map(([k, v]) => (
          <div key={k} className="px-2 py-3 text-center">
            <p className="m-0 text-[9.5px] uppercase tracking-[.08em] text-brume">{k}</p>
            <p className={`m-0 mt-0.5 text-[14px] font-semibold tabular-nums ${k === "moyenne" ? "text-encre" : "text-ardoise"}`}>{euros(v)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ligne({ label, valeur, points = null, pctVal = null }) {
  const n = points ?? pctVal;
  const bon = n != null && (points != null ? n < 0 : n > 0);
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-trait py-2 text-[13px]">
      <span className="min-w-0 text-craie">{label}</span>
      <span className="flex flex-shrink-0 items-center gap-2">
        {valeur != null && <span className="tabular-nums text-encre">{valeur}</span>}
        {n != null && (
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums ${bon ? "bg-vert/15 text-vert" : "bg-alerte/15 text-alerte"}`}>
            {n > 0 ? "+" : ""}{String(n).replace(".", ",")}{points != null ? " pt" : " %"}
          </span>
        )}
      </span>
    </div>
  );
}

function Resultat({ estimation: e }) {
  const r = e.resultat;
  const m = r.methodes || {};
  const t = r.taux;
  const nMethodes = Object.keys(m).length;

  return (
    <div className={`${CARTE} p-7 max-md:p-4`}>
      <p className="alx-mont m-0 mb-3 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">
        Fourchette retenue · {r.statut === "vacant" ? "local vacant" : "local loué"} · {nMethodes} méthode{nMethodes > 1 ? "s" : ""} croisée{nMethodes > 1 ? "s" : ""}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {[["Estimation basse", r.valeurs.basse], ["Estimation moyenne", r.valeurs.moyenne], ["Estimation haute", r.valeurs.haute]].map(([titre, valeur], i) => (
          <div key={titre} className={`overflow-hidden rounded-[12px] border ${i === 1 ? "border-menthe/40" : "border-bord"}`}>
            <p className="m-0 bg-relief px-3 py-1.5 text-center text-[11px] uppercase tracking-[.08em] text-brume">{titre}</p>
            <p className={`m-0 py-4 text-center text-[24px] font-semibold tabular-nums ${i === 1 ? "text-menthe-texte" : "text-encre"}`}>{euros(valeur)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Taux retenu", pct(t.retenu)],
          ["Loyer de référence", r.loyer_annuel ? `${euros(r.loyer_annuel)} / an` : r.vlm?.loyer ? `${euros(r.vlm.loyer.moyen)} / an (marché)` : "—"],
          ["Surface", r.surface?.totale ? `${r.surface.totale} m²${r.surface.ponderee !== r.surface.totale ? ` · ${r.surface.ponderee} m² pondérés` : ""}` : "Non renseignée"],
          ["Prix au m²", r.prix_m2 != null ? `${r.prix_m2.toLocaleString("fr-FR")} €` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[12px] border border-trait bg-relief px-4 py-3">
            <p className="m-0 text-[11px] uppercase tracking-[.08em] text-brume">{k}</p>
            <p className="m-0 mt-1 text-[15px] font-medium tabular-nums text-encre">{v}</p>
          </div>
        ))}
      </div>

      {/* Les trois méthodes, côte à côte, chacune avec son poids. */}
      <h3 className="alx-mont mt-8 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Les méthodes croisées</h3>
      <div className="grid gap-3">
        {m.capitalisation && (
          <div>
            <Fourchette titre={m.capitalisation.libelle} m={m.capitalisation} poids={r.poids.capitalisation} accent />
            <p className="m-0 mt-1.5 text-[11.5px] leading-[1.6] text-ardoise">
              {euros(m.capitalisation.loyer)} de loyer annuel net, capitalisé à {pct(m.capitalisation.taux)} — de {pct(m.capitalisation.taux_bas)} à {pct(m.capitalisation.taux_haut)} pour la fourchette.
              {r.coefficient_valeur !== 1 ? ` Coefficient d'ajustement de ${String(r.coefficient_valeur).replace(".", ",")} appliqué.` : ""}
            </p>
          </div>
        )}
        {m.vlm && (
          <div>
            <Fourchette titre={m.vlm.libelle} m={m.vlm} poids={r.poids.vlm} accent={!m.capitalisation} />
            <p className="m-0 mt-1.5 text-[11.5px] leading-[1.6] text-ardoise">
              {m.vlm.source}, {m.vlm.detail} : {euros(m.vlm.m2.bas)} à {euros(m.vlm.m2.haut)} HT HC / m² / an, soit {euros(m.vlm.loyer.moyen)} de loyer de marché sur la surface pondérée, capitalisé à {pct(m.vlm.taux)}.
              {r.vlm?.ecart_facial_pct != null ? ` Le loyer facial est ${Math.abs(r.vlm.ecart_facial_pct)} % ${r.vlm.ecart_facial_pct >= 0 ? "au-dessus" : "en dessous"} du marché.` : ""}
              {m.vlm.facteurs?.map((f) => ` ${f.libelle} : ${f.pct} % sur la valeur locative.`).join("")}
            </p>
            {m.vlm.alternatives?.length > 0 && (
              <p className="m-0 mt-1 text-[11.5px] leading-[1.6] text-brume">
                {/* Deux sources peuvent diverger fortement : la lecture non retenue
                    reste visible, nommée, pour que l'écart se voie. */}
                Autre lecture, non retenue : {m.vlm.alternatives.map((a) => `${a.source}, ${a.detail} : ${euros(a.bas)} à ${euros(a.haut)} / m² / an`).join(" ; ")}.
                La lecture retenue est la plus spécifique au bien.
              </p>
            )}
          </div>
        )}
        {m.dvf && (
          <div>
            <Fourchette titre={m.dvf.libelle} m={m.dvf} poids={r.poids.dvf} />
            <p className="m-0 mt-1.5 text-[11.5px] leading-[1.6] text-ardoise">
              {m.dvf.prix_m2_pondere.toLocaleString("fr-FR")} € / m² pondéré par la surface, de {m.dvf.bas_m2.toLocaleString("fr-FR")} à {m.dvf.haut_m2.toLocaleString("fr-FR")} € pour la fourchette, sur {r.surface.totale} m² de surface totale.
            </p>
            <div className="mt-2 max-h-[200px] overflow-y-auto rounded-[10px] border border-trait bg-relief px-3">
              {m.dvf.ventes.map((v, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 border-b border-trait py-1.5 text-[12px] last:border-b-0">
                  <span className="min-w-0 truncate text-craie">{v.adresse || "Vente"} <span className="text-brume">· {quand(v.date)}{v.distance_m != null ? ` · ${v.distance_m} m` : ""}</span></span>
                  <span className="flex-shrink-0 tabular-nums text-encre">{euros(v.prix)} <span className="text-brume">· {v.surface} m² · {v.prix_m2?.toLocaleString("fr-FR")} €/m²</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!m.dvf && e.marche?.dvf && (
          <p className="m-0 text-[11.5px] text-brume">
            Comparables DVF : {e.marche.dvf.n} vente{e.marche.dvf.n > 1 ? "s" : ""} à 500 m sur 36 mois, trop peu pour une méthode. Elles ne pèsent pas.
          </p>
        )}
      </div>

      {/* Le taux, du plus large au plus fin : la bande, la place, les ajustements. */}
      <h3 className="alx-mont mt-8 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Pourquoi ce taux</h3>
      <div className="rounded-[12px] border border-trait bg-relief px-4 py-3">
        <div className="flex items-baseline justify-between border-b border-trait py-2 text-[13px]">
          <span className="text-craie">{t.bande.libelle}{t.bande.interpolee ? " (bande interpolée)" : ""}</span>
          <span className="tabular-nums text-encre">{pct(t.bande.bande[0])} à {pct(t.bande.bande[1])}</span>
        </div>
        {t.raisons.map((x, i) => <Ligne key={`r${i}`} label={x.libelle} valeur={null} pctVal={null} points={null} />)}
        {t.raisons.length > 0 && (
          <div className="flex items-baseline justify-between border-b border-trait py-2 text-[13px]">
            <span className="text-craie">Place dans la bande d&apos;après le quartier</span>
            <span className="tabular-nums text-encre">{Math.round(t.position * 100)} % → {pct(t.base)}</span>
          </div>
        )}
        {t.facteurs.map((f, i) => <Ligne key={`f${i}`} label={f.libelle} points={f.points} />)}
        <div className="flex items-baseline justify-between py-2 text-[13px]">
          <span className="font-medium text-encre">Taux retenu{r.statut === "vacant" ? " · risque de vacance compris" : ""}</span>
          <span className="font-semibold tabular-nums text-menthe-texte">{pct(r.statut === "vacant" ? t.vacant : t.retenu)}</span>
        </div>
      </div>

      {/* La matrice d'ajustements sur la valeur. */}
      <h3 className="alx-mont mt-8 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">La matrice d&apos;ajustements</h3>
      <div className="rounded-[12px] border border-trait bg-relief px-4 py-3">
        {!r.coefficients.length && !(m.vlm?.facteurs?.length) && <p className="m-0 py-1 text-[13px] text-ardoise">Aucun ajustement sur la valeur : ni triple net, ni fin de bail proche, ni surloyer.</p>}
        {r.coefficients.map((c, i) => <Ligne key={`c${i}`} label={c.libelle} pctVal={c.pct} />)}
        {m.vlm?.facteurs?.map((f, i) => <Ligne key={`v${i}`} label={`${f.libelle} (sur la valeur locative)`} pctVal={f.pct} />)}
        {r.coefficients.length > 0 && (
          <div className="flex items-baseline justify-between py-2 text-[13px]">
            <span className="font-medium text-encre">Coefficient sur les méthodes par le loyer</span>
            <span className="font-semibold tabular-nums text-menthe-texte">× {String(r.coefficient_valeur).replace(".", ",")}</span>
          </div>
        )}
      </div>

      {r.taux_effort != null && (
        <p className="m-0 mt-3 text-[12px] text-ardoise">Taux d&apos;effort du locataire : {pct(r.taux_effort)} du chiffre d&apos;affaires.</p>
      )}

      <p className="mt-5 mb-0 text-[11px] italic leading-[1.6] text-brume">
        La fourchette retenue est la moyenne pondérée des méthodes disponibles : le loyer réel pèse la moitié quand il existe, le marché
        locatif et les ventes se partagent le reste. Les coefficients de la matrice retiennent le milieu des fourchettes d&apos;usage
        (triple net +7,5 %, fin de bail proche -7,5 %, restaurant sans extraction -12,5 % sur la valeur locative). La réserve et la cave
        pèsent 40 % de la surface de vente. Une estimation n&apos;est pas une expertise : elle situe, elle ne vaut pas avis de valeur.
      </p>

      <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" className="mt-4" />
    </div>
  );
}

// ── Le formulaire, quatre étapes ───────────────────────────────────────────

function Formulaire({ estimation: e, choix, grille, onCalculee, onQuitter }) {
  const [etape, setEtape] = useState(e.resultat ? 4 : 0);
  const [rep, setRep] = useState(() => e.reponses || { statut: "loue", ville: "grande", emplacement: "n1bis" });
  const poser = (cle, v) => setRep((r) => ({ ...r, [cle]: v }));
  const loue = rep.statut !== "vacant";
  const bande = bandeDe(grille, rep);
  const vlmConnue = !!(e.marche?.vlm_datab?.rue?.basse || e.marche?.vlm_datab?.quartier?.basse || e.marche?.vlm_datab?.ville?.basse);

  const enregistrer = useMutation({
    mutationFn: () => base44.request("PATCH", `/api/kestimation/${e.id}`, { body: { reponses: rep } }),
    onSuccess: (r) => { onCalculee(r.estimation); setEtape(4); },
    onError: (err) => toast.error(err?.message || "Estimation impossible"),
  });

  const Options = ({ cle }) => <Pastilles options={choix?.[cle]?.options || []} valeur={rep[cle]} onChange={(v) => poser(cle, v)} />;
  const champ = "h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe";

  if (etape === 0) return <Explication onCommencer={() => setEtape(1)} />;

  return (
    <div className={`${CARTE} p-7 max-md:p-4`}>
      <Fil etape={etape} />

      {etape === 1 && (
        <>
          <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">Statut d&apos;occupation</h2>
          <p className="m-0 mb-6 text-[13px] text-ardoise">Un local loué s&apos;estime d&apos;abord par son loyer ; un local vacant par la valeur locative de marché, que l&apos;outil est allé chercher.</p>
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
            <p className="m-0 rounded-[12px] border border-trait bg-relief px-4 py-3 text-[13px] leading-[1.6] text-craie">
              {vlmConnue
                ? "La valeur locative de marché du secteur a été lue : elle donnera le loyer que ce local rapporterait, sur sa surface, à l'étape suivante."
                : "Aucune valeur locative de marché n'a pu être lue pour cette adresse. Sans elle ni loyer, un local vacant ne peut s'estimer que par les ventes comparables, s'il y en a assez."}
            </p>
          )}
          <Boutons onRetour={onQuitter} onSuivant={() => setEtape(2)} desactive={loue && !String(rep.loyer_annuel || "").trim()} />
        </>
      )}

      {etape === 2 && (
        <>
          <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">Le local</h2>
          <p className="m-0 mb-6 text-[13px] text-ardoise">Ses surfaces, sa vitrine, ses équipements, son état.</p>
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
        </>
      )}

      {etape === 3 && (
        <>
          <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">L&apos;emplacement</h2>
          <p className="m-0 mb-6 text-[13px] text-ardoise">La classe d&apos;emplacement et le type de ville fixent la bande du taux de capitalisation ; le quartier place le taux dans sa bande.</p>
          <Champ label="Type de ville"><Options cle="ville" /></Champ>
          <Champ label="Classe d'emplacement" aide="N°1 : flux fort, enseignes. N°1 bis : à deux pas. N°2 : rue secondaire."><Options cle="emplacement" /></Champ>
          {grille?.length > 0 && (
            <div className="mb-4 rounded-[12px] border border-trait bg-relief p-3">
              <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">La grille des taux de capitalisation</p>
              {grille.map((g) => (
                <div key={g.cle} className={`flex items-baseline justify-between gap-3 border-b border-trait py-1.5 text-[12.5px] last:border-b-0 ${bande?.cle === g.cle ? "text-menthe-texte" : "text-ardoise"}`}>
                  <span>{g.libelle}{g.interpolee ? " (interpolée)" : ""}{bande?.cle === g.cle ? " ← vos réponses" : ""}</span>
                  <span className="flex-shrink-0 tabular-nums">{pct(g.bande[0])} à {pct(g.bande[1])}</span>
                </div>
              ))}
            </div>
          )}
          <Boutons onRetour={() => setEtape(2)} onSuivant={() => enregistrer.mutate()} labelSuivant="Estimer" occupe={enregistrer.isPending} />
        </>
      )}

      {etape === 4 && e.resultat && (
        <>
          <Resultat estimation={e} />
          <div className="mt-5 flex items-center gap-2">
            <button onClick={() => setEtape(1)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-bord px-4 text-[12px] uppercase tracking-[.12em] text-ardoise hover:text-encre">
              <ChevronLeft className="h-3.5 w-3.5" />Revoir les réponses
            </button>
          </div>
        </>
      )}
      {etape === 4 && !e.resultat && <p className="m-0 text-[13px] text-ardoise">Le calcul n&apos;a pas abouti.{e.erreur_affinage ? ` ${e.erreur_affinage}` : ""}</p>}
    </div>
  );
}

// ── La page ────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    const q = adresse.trim();
    if (q.length < 3 || q === choisie.current) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
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

  // Une estimation ouverte : chargement, puis formulaire.
  if (ouverte && e) {
    if (e.etat === "en_cours") return <div className="min-h-screen pt-2"><Chargement estimation={e} /></div>;
    if (e.etat === "echec") return (
      <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
        <p className="m-0 text-[15px] text-alerte">{e.erreur || "La lecture du marché n'a pas abouti."}</p>
        <button onClick={() => setOuverte(null)} className="mt-6 text-[12.5px] text-ardoise hover:text-encre">Revenir</button>
      </div>
    );
    const vlm = e.marche?.vlm_datab?.rue || e.marche?.vlm_datab?.quartier;
    return (
      <div className="mx-auto min-h-screen max-w-[900px] px-4 pb-20 pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setOuverte(null)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre">
            <ChevronLeft className="h-4 w-4" />Toutes les estimations
          </button>
          <button onClick={() => { if (window.confirm("Supprimer cette estimation ?")) supprimer.mutate(e.id); }}
            className="inline-flex items-center gap-1.5 text-[12px] text-brume hover:text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
        </div>
        <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Estimation des murs commerciaux</p>
        <h1 className="mt-2 mb-1 text-[26px] font-light tracking-[-0.01em] text-encre">{titre}</h1>
        <p className="m-0 mb-6 text-[13px] text-ardoise">
          {e.activite}
          {e.marche?.dvf?.n != null && <span> · {e.marche.dvf.n} vente{e.marche.dvf.n > 1 ? "s" : ""} de murs à 500 m sur 36 mois</span>}
          {vlm?.basse && <span> · valeur locative de {euros(vlm.basse)} à {euros(vlm.haute)} / m² / an</span>}
        </p>
        <Formulaire estimation={e} choix={choix} grille={grille}
          onCalculee={(estimation) => { qc.setQueryData(["kestimation", e.id], { estimation }); qc.invalidateQueries({ queryKey: ["kestimation"], exact: true }); }}
          onQuitter={() => setOuverte(null)} />
      </div>
    );
  }

  // L'accueil du module : ses parties. Une seule pour l'instant.
  if (!partie) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
        <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Data</p>
        <h1 className="mt-2 mb-2 text-[30px] font-light tracking-[-0.01em] text-encre">Estimation</h1>
        <p className="m-0 mb-7 max-w-[620px] text-[13.5px] leading-[1.7] text-ardoise">
          Estimer un bien commercial à partir de ce qu&apos;il rapporte, et de ce qu&apos;un investisseur exige pour l&apos;acheter.
        </p>
        <button onClick={() => setPartie("murs")} className={`${CARTE} group block w-full p-[22px] text-left transition-colors hover:border-menthe/40`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-trait bg-relief">
            <Calculator className="h-5 w-5 text-menthe" />
          </span>
          <span className="mt-4 block text-[17px] font-medium text-encre">Estimation de murs commerciaux</span>
          <span className="mt-1 block text-[13px] leading-[1.6] text-ardoise">
            Le loyer, la valeur locative de marché et les ventes comparables, croisés en une fourchette.
          </span>
        </button>
      </div>
    );
  }

  // Le départ : un type de commerce, une adresse.
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
      <button onClick={() => setPartie(null)} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre">
        <ChevronLeft className="h-4 w-4" />Estimation
      </button>
      <h1 className="mt-2 mb-6 text-[30px] font-light tracking-[-0.01em] text-encre">Estimation de murs commerciaux</h1>

      <div className={`${CARTE} p-5`}>
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Type de commerce</label>
        <input value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant, opticien… ou vide pour tous les commerces"
          className="mb-4 h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Adresse précise</label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
            <Search className="h-4 w-4 flex-shrink-0 text-brume" />
            <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="48 rue Basfroi, 75011 Paris"
              className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-fond p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
            </ul>
          )}
        </div>
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.6] text-brume">
          La lecture du marché prend les ventes de murs à 500 m, les commerces autour, le niveau de vie de la zone, et la valeur
          locative déduite des ventes au taux de rendement. Rien n&apos;est payant ; Equimmox affinera après le formulaire.
        </p>
        <button onClick={() => lancer.mutate()} disabled={lancer.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Commencer l&apos;estimation
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Estimations réalisées</h2>
      {!estimations.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {estimations.map((x) => (
            <li key={x.id}>
              <button onClick={() => setOuverte(x.id)} className="flex w-full items-center gap-4 border-b border-trait py-3 text-left hover:bg-surface">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${x.etat === "terminee" ? "bg-vert" : x.etat === "echec" ? "bg-alerte" : "bg-menthe animate-pulse"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-encre">{x.libelle || x.adresse}</span>
                  <span className="block text-[11.5px] text-brume">{x.activite} · {x.etat === "en_cours" ? `${x.progression} %` : quand(x.fini_le || x.cree_le)}</span>
                </span>
                {x.valeur != null && <span className="flex-shrink-0 text-[13px] font-medium tabular-nums text-menthe-texte">{euros(x.valeur)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
