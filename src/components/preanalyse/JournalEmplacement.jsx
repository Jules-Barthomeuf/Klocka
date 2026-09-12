import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ton } from "@/components/preanalyse/journal-tons";

// L'emplacement : ce que l'étude d'implantation Data-B dit du lieu, au-delà
// du loyer. Le flux, le tronçon, la rue, les gens qui vivent là et ce qu'ils
// gagnent. Le résidentiel a son propre onglet — il vient d'une autre source.
//
// Les connecteurs rapportent tout cela depuis des semaines ; rien ne
// l'affichait. Ici chaque bloc lit la forme exacte que rend
// server/data-b-implantation.js, si bien qu'un vrai résultat s'y pose sans
// rien changer.
//
// Les revenus et les CSP+ se masquent d'un clic : devant un client, on choisit
// ce qu'on montre. Et quand les deux flux sont faibles, une ligne le signale
// et rappelle ce qui joue en sens inverse — sans rien réécrire : c'est vous
// qui décidez de l'argument.

const SEUIL_FLUX_FAIBLE = 2;
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));
const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toLocaleString("fr-FR")} %`);
const fourchette = (f) => (f ? `${fmt(f.min)} – ${fmt(f.max)}` : "—");

/** Cinq étoiles, les pleines en couleur. */
function Etoiles({ note, couleur = "#f7941d", taille = 13 }) {
  if (!note?.sur) return <span className="text-[#4e545e]">—</span>;
  return (
    <span className="inline-flex gap-[2px]" aria-label={`${note.note} sur ${note.sur}`} title={`${note.note} / ${note.sur}`}>
      {Array.from({ length: note.sur }, (_, i) => (
        <svg key={i} viewBox="0 0 100 100" width={taille} height={taille} aria-hidden>
          <polygon
            fill={i < note.note ? couleur : "#2c3139"}
            points="50 5 61.8 35.1 95 38.2 69 58.6 76.9 90 50 72.5 23.1 90 31 58.6 5 38.2 38.2 35.1"
          />
        </svg>
      ))}
    </span>
  );
}

function Intitule({ children }) {
  return <h4 className="m-0 mb-2 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">{children}</h4>;
}

function Tuile({ libelle, note, children, ton: nomTon = "menthe", onClick = null, actif = false, titre = null }) {
  const c = ton(nomTon);
  // Cliquable ou non, la tuile a la même forme : ce qui change est le curseur,
  // la bordure quand elle est ouverte, et le fait d'être un vrai bouton.
  const Balise = onClick ? "button" : "div";
  return (
    <Balise
      {...(onClick ? { type: "button", onClick, "aria-pressed": actif, title: titre } : {})}
      className={`rounded-[12px] bg-[#15181c] border px-4 py-3 min-w-0 text-left ${onClick ? "hover:bg-[#191d22] transition-colors" : ""}`}
      style={{ borderColor: actif ? c.bord : "#23272d" }}
    >
      <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.08em] text-[#6a7180]">{libelle}</span>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="font-mono tabular-nums text-[19px] leading-tight" style={{ color: c.texte }}>
          {note?.sur ? `${note.note} / ${note.sur}` : "—"}
        </span>
        <Etoiles note={note} />
      </div>
      {children && <div className="mt-2 text-[11.5px] leading-5 text-[#6a7180]">{children}</div>}
    </Balise>
  );
}

/** Une donnée en carte : libellé, chiffre, explication. */
function CarteDonnee({ libelle, valeur, detail = undefined, ton: nomTon = "menthe" }) {
  const c = ton(nomTon);
  return (
    <div className="rounded-[12px] bg-[#15181c] border border-[#23272d] px-4 py-3 min-w-0">
      <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.08em] text-[#6a7180]">{libelle}</span>
      <span className="block mt-1.5 text-[18px] leading-tight font-medium truncate" style={{ color: c.texte }}>
        {valeur}
      </span>
      {detail && <span className="block mt-1.5 text-[11px] leading-5 text-[#6a7180]">{detail}</span>}
    </div>
  );
}

export default function JournalEmplacement({ emplacement }) {
  const [revenusVisibles, setRevenusVisibles] = useState(true);
  // La liste des commerces ne s'affiche que si on la demande. À l'arrivée,
  // l'emplacement tient en quatre blocs — flux, commercialité, démographie,
  // revenus — et se lit d'un écran. Dix-neuf enseignes en dessous noyaient ce
  // qu'on vient y chercher.
  const [listeVisible, setListeVisible] = useState(false);
  if (!emplacement) return null;

  const { flux_pieton: pieton, flux_voiture: voiture, rue, troncon, commerces_troncon: tc, demographie, revenu, zone_primaire: zone, en_tete } = emplacement;
  const fluxFaibles = (pieton?.note?.note ?? 5) <= SEUIL_FLUX_FAIBLE && (voiture?.note?.note ?? 5) <= SEUIL_FLUX_FAIBLE;
  // Les commerces du tronçon, à plat. Le découpage par numéro et par côté
  // disait surtout où s'arrête le tronçon ; ce qu'on veut savoir, c'est QUI est
  // dans la rue. Le type d'activité se lit en ouvrant « Commercialité ».
  const commerces = (tc?.numeros || [])
    .filter((n) => !n.habitation)
    .flatMap((n) => (n.commerces || []).map((k) => ({ ...k, numero: n.numero })));

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Intitule>Emplacement</Intitule>
        <span className="text-[11px] text-[#4e545e]">
          {emplacement.source}
          {emplacement.quand ? ` · ${emplacement.quand}` : ""}
        </span>
      </div>

      {/* Les trois notes ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tuile libelle="Flux piéton" note={pieton?.note} ton={(pieton?.note?.note ?? 0) <= SEUIL_FLUX_FAIBLE ? "ambre" : "menthe"}>
          {!pieton?.note && (
            <span>
              {pieton?.indisponible
                ? "Data-B déclare le flux piéton indisponible à cette adresse."
                : "Data-B calcule ce flux à la demande : il n’était pas encore revenu au moment de la lecture."}
            </span>
          )}
          {pieton?.note && (
            <>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(pieton.sous_notes || {}).map(([k, n]) => (
                  <span key={k} className="inline-flex items-center gap-1.5 capitalize">
                    {k} <Etoiles note={n} taille={9} />
                  </span>
                ))}
              </div>
              <div className="mt-1.5">
                Par heure : <span className="text-[#c6ccd3]">{fourchette(pieton.par_heure?.basse)}</span> en creux,{" "}
                <span className="text-[#c6ccd3]">{fourchette(pieton.par_heure?.haute)}</span> en pointe.
                <br />
                Par jour : {fourchette(pieton.par_jour?.basse)} à {fourchette(pieton.par_jour?.haute)} piétons.
              </div>
            </>
          )}
        </Tuile>
        <Tuile libelle="Flux voiture" note={voiture?.note} ton={voiture?.note && voiture.note.note <= SEUIL_FLUX_FAIBLE ? "ambre" : "menthe"}>
          {voiture?.note
            ? "La mesure Data-B, sur cinq. Rien d’autre n’est relevé sur le trafic."
            : voiture?.indisponible
              ? "Data-B déclare le flux voiture indisponible à cette adresse."
              : "Data-B calcule ce flux à la demande : il n’était pas encore revenu au moment de la lecture. Relancez l’analyse pour le récupérer."}
        </Tuile>
        <Tuile
          libelle="Commercialité du tronçon"
          note={troncon?.note}
          onClick={commerces.length ? () => setListeVisible((v) => !v) : null}
          actif={listeVisible}
          titre={listeVisible ? "Masquer les commerces du tronçon" : "Voir les commerces du tronçon et leur activité"}
        >
          {troncon?.libelle}
          {rue && (
            <>
              <br />
              Dans la rue : <span className="text-[#c6ccd3]">{fmt(rue.commerces)} commerces</span> sur {fmt(rue.longueur_m)} m.
            </>
          )}
          {commerces.length > 0 && (
            <>
              <br />
              <span className="text-[#96c0b8]">{listeVisible ? "Masquer" : "Voir"} les {commerces.length} commerces et leur activité</span>
            </>
          )}
        </Tuile>
      </div>

      {/* Le signal, quand les deux flux sont faibles : constaté, pas réécrit. */}
      {fluxFaibles && (
        <p className="m-0 rounded-[10px] border border-[rgba(217,164,65,.35)] bg-[rgba(217,164,65,.06)] px-4 py-3 text-[12.5px] leading-6 text-[#e4dcc9]">
          <span className="font-semibold text-[#d9a441]">Flux faibles.</span> Piéton {pieton?.note?.note}/5 et voiture{" "}
          {voiture?.note?.note}/5. Ce qui joue en sens inverse, si vous choisissez de le mettre en avant : revenu moyen{" "}
          <span className="font-medium text-[#f2f3f5]">{fmt(revenu?.revenu_moyen_annuel)} €/an</span>
          {en_tete?.revenu_vs_france != null ? ` (${pct(en_tete.revenu_vs_france)} vs France)` : ""}, {fmt(revenu?.csp_plus)} CSP+ dans la zone.
        </p>
      )}

      {/* Les gens d'abord, sur toute la largeur : démographie, revenus, CSP+.
          C'est ce qu'on cite devant un client, et c'est ce qui se lit le mieux
          en cartes alignées plutôt qu'en colonne étroite à côté du tronçon. */}
        {/* Les gens : démographie, revenus, propriétaires — en cartes, parce
            qu'on les lit d'un coup d'œil et qu'on en cite une ou deux devant
            un client, pas la liste entière. */}
        <div className="min-w-0 flex flex-col gap-6">
          <section>
            <Intitule>Démographie de la zone</Intitule>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <CarteDonnee
                libelle="Habitants"
                valeur={fmt(demographie?.habitants)}
                detail={demographie?.evolution ? `${pct(demographie.evolution.a_3_ans)} à 3 ans · ${pct(demographie.evolution.a_5_ans)} à 5 ans · ${pct(demographie.evolution.a_10_ans)} à 10 ans` : null}
              />
              <CarteDonnee
                libelle="Logements à 5 min à pied"
                valeur={fmt(zone?.logements)}
                detail={zone ? `${fmt(zone.appartements)} appartements · ${fmt(zone.maisons)} maisons` : null}
              />
              <CarteDonnee
                libelle="Propriétaires"
                valeur={fmt(zone?.proprietaires)}
                detail="dans la zone à 5 minutes — le nombre de copropriétaires de l’immeuble relève de Data Foncier"
              />
              <CarteDonnee
                libelle="Commerces et entreprises"
                valeur={`${fmt(zone?.commerces)} · ${fmt(zone?.entreprises)}`}
                detail="à 5 minutes à pied"
              />
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <Intitule>Revenu et CSP+</Intitule>
              <button
                type="button"
                onClick={() => setRevenusVisibles((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#6a7180] hover:text-[#c6ccd3] transition-colors"
                aria-pressed={!revenusVisibles}
              >
                {revenusVisibles ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {revenusVisibles ? "Masquer" : "Afficher"}
              </button>
            </div>
            {revenusVisibles ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <CarteDonnee
                  libelle="Revenu moyen annuel"
                  valeur={`${fmt(revenu?.revenu_moyen_annuel)} €`}
                  detail={revenu?.revenu_evolution ? `${pct(revenu.revenu_evolution.a_3_ans)} à 3 ans · ${pct(revenu.revenu_evolution.a_5_ans)} à 5 ans` : null}
                />
                <CarteDonnee
                  libelle="Revenu du quartier"
                  valeur={`${fmt(en_tete?.revenu_annuel_quartier)} €`}
                  detail={en_tete?.revenu_vs_france != null ? `${pct(en_tete.revenu_vs_france)} par rapport à la France · CSP majoritaire : ${en_tete.csp_majoritaire || "—"}` : null}
                  ton={(en_tete?.revenu_vs_france ?? 0) < 0 ? "ambre" : "menthe"}
                />
                <CarteDonnee
                  libelle="CSP+"
                  valeur={fmt(revenu?.csp_plus)}
                  detail={revenu?.csp_plus_evolution ? `${pct(revenu.csp_plus_evolution.a_3_ans)} à 3 ans · ${pct(revenu.csp_plus_evolution.a_5_ans)} à 5 ans · ${fmt(revenu.retraites)} retraités` : null}
                />
                <CarteDonnee
                  libelle="Taux de chômage"
                  valeur={revenu?.taux_chomage != null ? `${fmt(revenu.taux_chomage, 2)} %` : "—"}
                  ton={(revenu?.taux_chomage ?? 0) > 10 ? "ambre" : "menthe"}
                />
              </div>
            ) : (
              <p className="m-0 rounded-[12px] border border-dashed border-[#2c3139] px-4 py-5 text-center text-[11.5px] text-[#4e545e]">
                Masqué pour cette présentation.
              </p>
            )}
          </section>
        </div>

      {/* Puis le tronçon, numéro par numéro — une liste longue, qui a besoin
          de la largeur elle aussi. */}
        {/* Les commerces de la rue, derrière la tuile « Commercialité ». */}
        {listeVisible && (
        <div className="min-w-0">
          <Intitule>Les commerces de la rue · {commerces.length}</Intitule>
          {commerces.length ? (
            <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6">
              {commerces.map((k, i) => (
                <li key={`${k.enseigne}-${i}`} className="py-1.5 border-b border-[#1a1d22] min-w-0">
                  <span className="block text-[12.5px] leading-5 text-[#dfe3e8] truncate" title={k.enseigne}>
                    {k.enseigne}
                  </span>
                  <span className="block text-[11px] leading-4 text-[#6a7180] truncate" title={k.activite}>
                    {k.activite}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[12px] text-[#6a7180]">Data-B n’a listé aucun commerce sur ce tronçon.</p>
          )}
          {rue?.familles?.length > 0 && (
            <p className="m-0 mt-3 text-[11.5px] leading-5 text-[#6a7180]">
              La rue, par famille : {rue.familles.map((f) => `${f.n} ${f.famille}`).join(" · ")}.
            </p>
          )}
        </div>
        )}

    </section>
  );
}
