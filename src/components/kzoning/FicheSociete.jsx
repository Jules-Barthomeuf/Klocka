import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2, Home, IdCard, Landmark, Users, Scale, ExternalLink, Phone, Globe, Mail, Clock, Accessibility } from "lucide-react";
import { base44 } from "@/api/base44Client";

// La fiche d'une société, en grand : on arrive par une devanture, on repart
// avec ce que l'État publie d'elle.
//
// Trois sources, toutes publiques et sans clé : OpenStreetMap pour la
// devanture (ce que le commerce affiche sur la rue), l'annuaire des
// entreprises pour l'identité, les établissements et les dirigeants, les
// comptes déposés pour les chiffres.
//
// Ce qu'aucune des trois ne donne ne s'invente pas. Le capital social, les
// fonds propres, la trésorerie ne figurent pas ici parce qu'ils ne figurent
// dans aucune source ouverte : mieux vaut une ligne absente qu'un chiffre
// inventé sur une page qui sert à décider.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const ONGLETS = [
  { cle: "general", nom: "Général", icone: Home },
  { cle: "identite", nom: "Identité juridique", icone: IdCard },
  { cle: "etablissements", nom: "Établissements", icone: Landmark },
  { cle: "dirigeants", nom: "Dirigeants", icone: Users },
  { cle: "finances", nom: "Finances", icone: Scale },
];

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const keuros = (n) => (n == null ? "—" : `${Math.round(n / 1000).toLocaleString("fr-FR")} K€`);
const nombre = (n) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));

// L'INSEE code l'effectif par tranche. Les libellés sont ceux de sa
// nomenclature ; « NN » veut dire non renseigné, pas zéro.
const EFFECTIFS = {
  NN: "Non renseigné", "00": "Aucun salarié", "01": "1 ou 2 salariés", "02": "3 à 5 salariés",
  "03": "6 à 9 salariés", 11: "10 à 19 salariés", 12: "20 à 49 salariés", 21: "50 à 99 salariés",
  22: "100 à 199 salariés", 31: "200 à 249 salariés", 32: "250 à 499 salariés", 41: "500 à 999 salariés",
  42: "1 000 à 1 999 salariés", 51: "2 000 à 4 999 salariés", 52: "5 000 à 9 999 salariés", 53: "10 000 salariés et plus",
};
export const effectif = (code) => EFFECTIFS[code] || (code ? `Code ${code}` : "—");

/** Une ligne d'un tableau de fiche : un intitulé à gauche, sa valeur à droite. */
function Ligne({ label, children, second = null }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-trait py-2.5">
      <span className="w-[210px] flex-shrink-0 text-[12.5px] text-ardoise">{label}</span>
      <span className="min-w-0 flex-1 text-[13.5px] font-medium text-encre">{children ?? "—"}</span>
      {second && <span className="flex-shrink-0 text-[12.5px] text-brume">{second}</span>}
    </div>
  );
}

/** Un chiffre du bandeau : sa valeur en grand, son intitulé, une précision. */
function Cartouche({ label, valeur, detail = null }) {
  return (
    <div className="rounded-[12px] border border-bord bg-surface px-4 py-3">
      <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.12em] text-brume">{label}</p>
      <p className="m-0 mt-1 text-[20px] font-medium tabular-nums text-encre">{valeur}</p>
      {detail && <p className="m-0 mt-0.5 text-[11.5px] text-menthe-texte">{detail}</p>}
    </div>
  );
}

function Onglet({ onglet, s, commerce, metier }) {
  if (onglet === "general") {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(280px,420px)]">
        <section>
          <h3 className="m-0 mb-3 text-[17px] font-medium text-encre">Fiche express</h3>
          <Ligne label="Raison sociale">{s.raison_sociale}</Ligne>
          {s.nom !== s.raison_sociale && <Ligne label="Autre nom connu">{s.nom}</Ligne>}
          {s.sigle && <Ligne label="Sigle">{s.sigle}</Ligne>}
          <Ligne label="Activité" second={`NAF ${s.activite_code}`}>{metier || s.activite_code}</Ligne>
          <Ligne label="Adresse">{s.siege?.adresse}</Ligne>

          {/* Ce que la devanture affiche sur la rue, d'après OpenStreetMap :
              l'annuaire des entreprises ne porte ni horaires ni téléphone. */}
          {commerce?.horaires && <Ligne label="Horaires"><span className="inline-flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-brume" />{commerce.horaires}</span></Ligne>}
          {commerce?.telephone && (
            <Ligne label="Téléphone">
              <a href={`tel:${commerce.telephone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-2 hover:text-menthe-texte">
                <Phone className="h-3.5 w-3.5 text-brume" />{commerce.telephone}
              </a>
            </Ligne>
          )}
          {commerce?.email && (
            <Ligne label="Email">
              <a href={`mailto:${commerce.email}`} className="inline-flex items-center gap-2 hover:text-menthe-texte">
                <Mail className="h-3.5 w-3.5 text-brume" />{commerce.email}
              </a>
            </Ligne>
          )}
          {commerce?.site && (
            <Ligne label="Présence en ligne">
              <a href={commerce.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-menthe-texte">
                <Globe className="h-3.5 w-3.5 text-brume" />{commerce.site.replace(/^https?:\/\//, "")}
              </a>
            </Ligne>
          )}
          {commerce?.pmr && (
            <Ligne label="Accessibilité">
              <span className="inline-flex items-center gap-2"><Accessibility className="h-3.5 w-3.5 text-brume" />{commerce.pmr === "yes" ? "Accessible" : commerce.pmr === "limited" ? "Partiellement adapté" : "Non accessible"}</span>
            </Ligne>
          )}
        </section>

        {/* Google Maps, sur l'adresse du siège. */}
        <section>
          <h3 className="m-0 mb-3 text-[17px] font-medium text-encre">Sur place</h3>
          {CLE_MAPS && s.siege?.lat != null ? (
            <iframe
              title="Vue de la rue"
              className="h-[260px] w-full rounded-[12px] border border-bord"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${s.siege.lat},${s.siege.lon}&heading=0&pitch=0&fov=90`}
            />
          ) : (
            <p className="m-0 text-[12.5px] text-brume">Vue indisponible : le siège n&apos;a pas de coordonnées.</p>
          )}
          {s.siege && (
            <a
              href={`https://www.google.com/maps?q=${s.siege.lat},${s.siege.lon}`}
              target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre"
            >
              Afficher dans Google Maps <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </section>
      </div>
    );
  }

  if (onglet === "identite") {
    return (
      <section className="max-w-[900px]">
        <h3 className="m-0 mb-3 text-[17px] font-medium text-encre">Identité juridique</h3>
        <Ligne label="SIREN">{s.siren}</Ligne>
        <Ligne label="SIRET (siège)">{s.siret}</Ligne>
        <Ligne label="Raison sociale">{s.raison_sociale}</Ligne>
        {s.nom !== s.raison_sociale && <Ligne label="Autre nom connu">{s.nom}</Ligne>}
        {s.sigle && <Ligne label="Sigle">{s.sigle}</Ligne>}
        <Ligne label="Forme juridique" second={s.forme ? null : `code ${s.forme_code}`}>{s.forme || `Code ${s.forme_code}`}</Ligne>
        <Ligne label="Code NAF / APE" second={metier || null}>{s.activite_code}</Ligne>
        <Ligne label="Date de création de la société">{s.creation}</Ligne>
        {s.siege?.creation && <Ligne label="Date de création du siège">{s.siege.creation}</Ligne>}
        <Ligne label="Effectif de l'établissement">{effectif(s.siege?.effectif)}</Ligne>
        <Ligne label="Effectif de l'entreprise">{effectif(s.effectif_societe)}</Ligne>
        <Ligne label="Catégorie">{s.categorie}</Ligne>
        <Ligne label="État">{s.active ? "Active" : "Cessée"}</Ligne>
        <p className="mt-4 mb-0 text-[11px] leading-[1.6] text-brume">
          Le capital social ne figure pas dans l&apos;annuaire ouvert des entreprises : il n&apos;est donc pas affiché plutôt qu&apos;approché.
        </p>
      </section>
    );
  }

  if (onglet === "etablissements") {
    if (!s.etablissements.length) return <p className="m-0 text-[13px] text-brume">Aucun établissement listé par l&apos;annuaire.</p>;
    return (
      <section>
        <h3 className="m-0 mb-3 text-[17px] font-medium text-encre">
          {s.etablissements_ouverts} ouvert{s.etablissements_ouverts > 1 ? "s" : ""} sur {s.etablissements_total}
        </h3>
        <ul className="m-0 list-none p-0">
          {s.etablissements.map((e, i) => (
            <li key={e.siret} className="flex items-center gap-4 border-b border-trait py-3">
              <span className="alx-mont flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-bord text-[11px] text-ardoise">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-medium text-encre">{e.enseigne || s.raison_sociale}</span>
                  {e.siege && <span className="alx-mont rounded-full border border-menthe/40 px-2 py-0.5 text-[10px] uppercase tracking-[.1em] text-menthe-texte">Siège social</span>}
                  {!e.actif && <span className="alx-mont rounded-full border border-trait px-2 py-0.5 text-[10px] uppercase tracking-[.1em] text-brume">Fermé</span>}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-brume">{e.adresse}</span>
              </span>
              <span className="flex-shrink-0 text-[11px] tabular-nums text-brume">{e.siret}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (onglet === "dirigeants") {
    if (!s.dirigeants.length) return <p className="m-0 text-[13px] text-brume">Aucun dirigeant publié.</p>;
    return (
      <section className="max-w-[900px]">
        <h3 className="m-0 mb-3 text-[17px] font-medium text-encre">Dirigeants et mandataires</h3>
        <ul className="m-0 list-none p-0">
          {s.dirigeants.map((d, i) => (
            <li key={i} className="flex items-center gap-4 border-b border-trait py-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-bord text-[12px] text-menthe-texte">
                {(d.nom || "?").charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-encre">{d.nom || "Nom non publié"}</span>
                <span className="block text-[12px] text-brume">
                  {d.qualite}
                  {d.morale ? " · personne morale" : d.annee_naissance ? ` · né en ${d.annee_naissance}` : ""}
                </span>
              </span>
              {d.siren && (
                <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${d.siren}`} target="_blank" rel="noreferrer"
                  className="flex-shrink-0 text-[11px] text-ardoise hover:text-encre">SIREN {d.siren}</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (onglet === "finances") {
    if (!s.comptes.length) {
      return <p className="m-0 text-[13px] text-brume">Aucun compte déposé n&apos;est publié pour cette société.</p>;
    }
    const [dernier, precedent] = s.comptes;
    const tendance = precedent?.chiffre_affaires && dernier?.chiffre_affaires
      ? Math.round(((dernier.chiffre_affaires - precedent.chiffre_affaires) / precedent.chiffre_affaires) * 100)
      : null;
    const LIGNES = [
      ["Chiffre d'affaires", "chiffre_affaires"],
      ["Résultat net", "resultat_net"],
      ["Excédent brut d'exploitation", "excedent_brut"],
      ["Résultat d'exploitation", "resultat_exploitation"],
      ["Marge brute", "marge_brute"],
    ];
    return (
      <section>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartouche label={`Chiffre d'affaires ${dernier.exercice}`} valeur={euros(dernier.chiffre_affaires)}
            detail={tendance != null ? `${tendance >= 0 ? "+" : ""}${tendance} % vs N-1` : null} />
          <Cartouche label={`Résultat ${dernier.exercice}`} valeur={euros(dernier.resultat_net)} />
          <Cartouche label="Exercices publiés" valeur={s.comptes.length} detail={`depuis ${s.comptes[s.comptes.length - 1].exercice}`} />
          <Cartouche label="Autonomie financière" valeur={dernier.autonomie_financiere != null ? `${Math.round(dernier.autonomie_financiere)} %` : "—"} />
        </div>

        <h3 className="m-0 mb-3 text-[17px] font-medium text-encre">Comptes déposés</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="alx-mont border-b border-bord py-2 pr-4 text-left text-[10.5px] uppercase tracking-[.12em] text-brume">Indicateur</th>
                {s.comptes.map((c) => (
                  <th key={c.exercice} className="alx-mont border-b border-bord px-3 py-2 text-right text-[10.5px] uppercase tracking-[.12em] text-brume">{c.exercice}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LIGNES.map(([label, cle]) => (
                <tr key={cle}>
                  <td className="border-b border-trait py-2 pr-4 text-ardoise">{label}</td>
                  {s.comptes.map((c) => (
                    <td key={c.exercice} className={`border-b border-trait px-3 py-2 text-right tabular-nums ${c[cle] < 0 ? "text-alerte" : "text-encre"}`}>
                      {keuros(c[cle])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 mb-0 text-[11px] leading-[1.6] text-brume">
          Source : comptes déposés au greffe, publiés par l&apos;INPI. Les postes de bilan (fonds propres, trésorerie,
          dettes) n&apos;y figurent pas : seuls le compte de résultat et les ratios sont ouverts.
        </p>
      </section>
    );
  }
  return null;
}

/**
 * La fiche plein écran d'une société.
 * @param {object} commerce le commerce cliqué (porte le SIRET et la devanture)
 * @param {() => void} onFermer
 */
export default function FicheSociete({ commerce, metier = null, onFermer }) {
  const [onglet, setOnglet] = useState("general");
  const { data, isLoading, error } = useQuery({
    queryKey: ["kzoning-societe", commerce.siret || commerce.nom],
    queryFn: () => base44.request("GET", `/api/kzoning/societe?${new URLSearchParams(
      commerce.siret ? { siret: commerce.siret } : { nom: commerce.nom || "" }
    )}`),
    enabled: !!(commerce.siret || commerce.nom),
    staleTime: 30 * 60 * 1000,
  });
  const s = data?.societe;

  return (
    // Un voile, pas un mur : la carte Google reste visible derrière, comme un
    // calque posé dessus. `bg-fond` plein masquait tout, cartes comprises.
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-fond/85 backdrop-blur-sm">
      {/* `pt-20` : la barre du haut de K-Data est fixe, la fiche doit passer
          dessous sans s'y glisser. */}
      <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-20 max-md:px-4">
        {/* Le bandeau : qui c'est, et les quatre chiffres qui situent. */}
        {/* `bg-surface`, quasi invisible sur le thème sombre, laissait la
            carte traverser bien au-delà du calque voulu. On s'aligne sur le
            panneau « Concurrence dans la zone », posé sur la même carte. */}
        <div className="rounded-[18px] border border-bord bg-fond/70 backdrop-blur-xl p-6 max-md:p-4">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 truncate text-[26px] font-medium tracking-[-0.01em] text-encre max-md:text-[19px]">
                {s?.nom || commerce.nom || "Commerce"}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-ardoise">
                {s && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
                      Société {s.active ? "active" : "cessée"}
                    </span>
                    <span className="rounded-full border border-trait px-2 py-0.5 tabular-nums">SIREN {s.siren}</span>
                    <span className="rounded-full border border-trait px-2 py-0.5">NAF {s.activite_code}</span>
                    {s.siege && <span>Siège : {s.siege.commune} ({s.siege.code_postal?.slice(0, 2)})</span>}
                  </>
                )}
                {!s && commerce.adresse && <span>{commerce.adresse}</span>}
              </div>
            </div>
            <button onClick={onFermer} className="flex-shrink-0 rounded-full border border-bord p-2 text-ardoise hover:text-encre" aria-label="Fermer">
              <X className="h-4 w-4" />
            </button>
          </div>

          {s && (
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Cartouche
                label={s.comptes[0] ? `Chiffre d'affaires ${s.comptes[0].exercice}` : "Chiffre d'affaires"}
                valeur={s.comptes[0] ? euros(s.comptes[0].chiffre_affaires) : "—"}
                detail={s.comptes[1]?.chiffre_affaires ? `${Math.round(((s.comptes[0].chiffre_affaires - s.comptes[1].chiffre_affaires) / s.comptes[1].chiffre_affaires) * 100)} % vs N-1` : null}
              />
              <Cartouche label="Effectif établissement" valeur={effectif(s.siege?.effectif)} detail={`Société : ${effectif(s.effectif_societe)}`} />
              <Cartouche label="Création" valeur={s.annee_creation} detail={s.creation} />
              <Cartouche label="Forme juridique" valeur={s.forme || `Code ${s.forme_code}`} detail={s.categorie} />
            </div>
          )}
        </div>

        {/* Les onglets */}
        <div className="mt-5 flex flex-wrap gap-2">
          {ONGLETS.map(({ cle, nom, icone: Icone }) => (
            <button
              key={cle}
              onClick={() => setOnglet(cle)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12.5px] transition-colors ${
                cle === onglet ? "border-menthe bg-menthe text-sur-menthe" : "border-bord bg-surface text-ardoise hover:text-encre"
              }`}
            >
              <Icone className="h-3.5 w-3.5" />{nom}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-[18px] border border-bord bg-fond/70 backdrop-blur-xl p-6 max-md:p-4">
          {isLoading && (
            <p className="m-0 flex items-center gap-2 text-[13px] text-brume">
              <Loader2 className="h-4 w-4 animate-spin" /> L&apos;annuaire des entreprises répond…
            </p>
          )}
          {error && <p className="m-0 text-[13px] text-alerte">{error.message || "La fiche n'a pas pu être chargée."}</p>}
          {!isLoading && !error && !commerce.siret && !commerce.nom && (
            <p className="m-0 text-[13px] text-brume">Ce local ne porte ni SIRET ni nom : rien à chercher dans l&apos;annuaire.</p>
          )}
          {s && <Onglet onglet={onglet} s={s} commerce={commerce} metier={metier} />}
        </div>
      </div>
    </div>
  );
}
