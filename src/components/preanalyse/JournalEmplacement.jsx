import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Section, Chiffres, Lignes, Encart, Note, Etiquette, Etoiles, fmt, pct, TEINTE } from "@/components/preanalyse/marche-ui";

// L'étude d'implantation Data-B : ce que le lieu vaut au-delà du loyer. Le
// flux piéton et voiture, la commercialité du tronçon, la rue, les gens qui
// vivent là et ce qu'ils gagnent. Chaque bloc lit la forme exacte que rend
// server/data-b-implantation.js.
//
// Les revenus et les CSP+ se masquent d'un clic : devant un client, on choisit
// ce qu'on montre. Quand les deux flux sont faibles, une ligne le signale et
// rappelle ce qui joue en sens inverse.

const SEUIL_FLUX_FAIBLE = 2;
const fourchette = (f) => (f ? `${fmt(f.min)} – ${fmt(f.max)}` : "—");
const noteDe = (n) => (n?.sur ? `${n.note} / ${n.sur}` : "—");

export default function JournalEmplacement({ emplacement, premiere = false }) {
  const [revenusVisibles, setRevenusVisibles] = useState(true);
  const [listeVisible, setListeVisible] = useState(false);
  if (!emplacement) return null;

  const { flux_pieton: pieton, flux_voiture: voiture, rue, troncon, commerces_troncon: tc, demographie, revenu, zone_primaire: zone, en_tete } = emplacement;
  const fluxFaibles = (pieton?.note?.note ?? 5) <= SEUIL_FLUX_FAIBLE && (voiture?.note?.note ?? 5) <= SEUIL_FLUX_FAIBLE;
  const commerces = (tc?.numeros || []).filter((n) => !n.habitation).flatMap((n) => (n.commerces || []).map((k) => ({ ...k, numero: n.numero })));
  const teinteFlux = (n) => (n?.note != null && n.note <= SEUIL_FLUX_FAIBLE ? TEINTE.ambre : TEINTE.clair);
  const etoiles = (n) => (n?.sur ? <Etoiles note={n.note} sur={n.sur} taille={13} /> : null);

  const sousNotes = pieton?.note ? Object.entries(pieton.sous_notes || {}).map(([k, n]) => `${k} ${n?.note ?? "—"}/${n?.sur ?? 5}`).join(" · ") : null;

  return (
    <Section premiere={premiere} titre="Étude d'implantation · Data-B" aside={<span className="text-[12.5px] text-ardoise">{[emplacement.source, emplacement.quand].filter(Boolean).join(" · ")}</span>}>
      <Chiffres
        className="mt-4"
        items={[
          {
            libelle: "Flux piéton",
            valeur: noteDe(pieton?.note),
            teinte: teinteFlux(pieton?.note),
            extra: etoiles(pieton?.note),
            note: pieton?.note
              ? `${sousNotes ? `${sousNotes} · ` : ""}par heure ${fourchette(pieton.par_heure?.basse)} en creux, ${fourchette(pieton.par_heure?.haute)} en pointe · par jour ${fourchette(pieton.par_jour?.basse)} à ${fourchette(pieton.par_jour?.haute)}`
              : pieton?.indisponible ? "Data-B déclare le flux piéton indisponible à cette adresse." : "Data-B calcule ce flux à la demande : il n'était pas encore revenu. Relancez l'analyse.",
          },
          {
            libelle: "Flux voiture",
            valeur: noteDe(voiture?.note),
            teinte: teinteFlux(voiture?.note),
            extra: etoiles(voiture?.note),
            note: voiture?.note ? "la mesure Data-B, sur cinq" : voiture?.indisponible ? "Data-B déclare le flux voiture indisponible à cette adresse." : "Data-B calcule ce flux à la demande : il n'était pas encore revenu. Relancez l'analyse.",
          },
          {
            libelle: "Commercialité du tronçon",
            valeur: noteDe(troncon?.note),
            extra: etoiles(troncon?.note),
            note: [troncon?.libelle, rue ? `dans la rue, ${fmt(rue.commerces)} commerces sur ${fmt(rue.longueur_m)} m` : null].filter(Boolean).join(" · "),
            onClick: commerces.length ? () => setListeVisible((v) => !v) : null,
            title: listeVisible ? "Masquer les commerces du tronçon" : "Voir les commerces du tronçon et leur activité",
          },
        ]}
      />

      {fluxFaibles && (
        <Encart teinte="ambre" className="mt-5">
          <span className="font-medium" style={{ color: TEINTE.ambre }}>Flux faibles.</span> Piéton {pieton?.note?.note}/5 et voiture {voiture?.note?.note}/5. Ce qui joue en sens inverse, si vous choisissez de le mettre en avant : revenu moyen{" "}
          <span className="text-encre">{fmt(revenu?.revenu_moyen_annuel)} €/an</span>{en_tete?.revenu_vs_france != null ? ` (${pct(en_tete.revenu_vs_france)} vs France)` : ""}, {fmt(revenu?.csp_plus)} CSP+ dans la zone.
        </Encart>
      )}

      {listeVisible && (
        <div className="mt-6">
          <Etiquette>Les commerces de la rue · {commerces.length}</Etiquette>
          {commerces.length ? (
            <div className="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
              {commerces.map((k, i) => (
                <div key={`${k.enseigne}-${i}`} className="min-w-0 border-b border-trait py-2">
                  <span className="block truncate text-[13.5px] text-encre" title={k.enseigne}>{k.enseigne}</span>
                  <span className="block truncate text-[11px] text-ardoise" title={k.activite}>{k.activite}</span>
                </div>
              ))}
            </div>
          ) : (
            <Note className="mt-2">Data-B n'a listé aucun commerce sur ce tronçon.</Note>
          )}
          {rue?.familles?.length > 0 && <Note className="mt-3">La rue, par famille : {rue.familles.map((f) => `${f.n} ${f.famille}`).join(" · ")}.</Note>}
        </div>
      )}

      <div className="mt-7">
        <Etiquette>Démographie de la zone</Etiquette>
        <Chiffres
          className="mt-3"
          items={[
            { libelle: "Habitants", valeur: fmt(demographie?.habitants), note: demographie?.evolution ? `${pct(demographie.evolution.a_3_ans)} à 3 ans · ${pct(demographie.evolution.a_5_ans)} à 5 ans · ${pct(demographie.evolution.a_10_ans)} à 10 ans` : null },
            { libelle: "Logements à 5 min à pied", valeur: fmt(zone?.logements), teinte: TEINTE.texte, note: zone ? `${fmt(zone.appartements)} appartements · ${fmt(zone.maisons)} maisons` : null },
            { libelle: "Propriétaires", valeur: fmt(zone?.proprietaires), teinte: TEINTE.texte, note: "dans la zone à 5 minutes" },
            { libelle: "Commerces et entreprises", valeur: `${fmt(zone?.commerces)} · ${fmt(zone?.entreprises)}`, teinte: TEINTE.texte, note: "à 5 minutes à pied" },
          ]}
        />
      </div>

      <div className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <Etiquette>Revenu et CSP+</Etiquette>
          <button type="button" onClick={() => setRevenusVisibles((v) => !v)} aria-pressed={!revenusVisibles} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            {revenusVisibles ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {revenusVisibles ? "Masquer" : "Afficher"}
          </button>
        </div>
        {revenusVisibles ? (
          <Chiffres
            className="mt-3"
            items={[
              { libelle: "Revenu moyen annuel", valeur: `${fmt(revenu?.revenu_moyen_annuel)} €`, note: revenu?.revenu_evolution ? `${pct(revenu.revenu_evolution.a_3_ans)} à 3 ans · ${pct(revenu.revenu_evolution.a_5_ans)} à 5 ans` : null },
              { libelle: "Revenu du quartier", valeur: `${fmt(en_tete?.revenu_annuel_quartier)} €`, teinte: (en_tete?.revenu_vs_france ?? 0) < 0 ? TEINTE.ambre : TEINTE.texte, note: en_tete?.revenu_vs_france != null ? `${pct(en_tete.revenu_vs_france)} par rapport à la France · CSP majoritaire : ${en_tete.csp_majoritaire || "—"}` : null },
              { libelle: "CSP+", valeur: fmt(revenu?.csp_plus), teinte: TEINTE.texte, note: revenu?.csp_plus_evolution ? `${pct(revenu.csp_plus_evolution.a_3_ans)} à 3 ans · ${pct(revenu.csp_plus_evolution.a_5_ans)} à 5 ans · ${fmt(revenu.retraites)} retraités` : null },
              { libelle: "Taux de chômage", valeur: revenu?.taux_chomage != null ? `${fmt(revenu.taux_chomage, 2)} %` : "—", teinte: (revenu?.taux_chomage ?? 0) > 10 ? TEINTE.ambre : TEINTE.texte },
            ]}
          />
        ) : (
          <Note className="mt-3">Masqué pour cette présentation.</Note>
        )}
      </div>
    </Section>
  );
}
