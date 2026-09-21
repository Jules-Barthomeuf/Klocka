import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { emplacementDe } from "@/components/alx/alx-commun";
import { Section, Titre, Chiffres, Etoiles, Vide, fmt } from "@/components/ui/kit";

// L'emplacement du dossier, vu par ALX, en une ligne de bilan.
//
// La rue et sa ville, sa classe et son flux, puis six chiffres : le rang
// parmi les rues commerçantes de la ville, les vitrines, la longueur, la
// densité, le loyer de la rue, le prix au m² autour. Quand la ville a déjà
// été prospectée, c'est le classement d'ALX qui parle.

export default function MarcheEmplacement({ adresse }) {
  const { data: e, isLoading, isError } = useQuery({
    queryKey: ["alx-emplacement", adresse],
    queryFn: () => base44.request("GET", `/api/alx/emplacement?adresse=${encodeURIComponent(adresse)}`),
    enabled: !!adresse,
    staleTime: 3600000,
    retry: false,
  });

  if (!adresse) return null;
  if (isLoading) return <Section><Vide>ALX lit les rues de la ville sur OpenStreetMap…</Vide></Section>;
  if (isError || !e) return null;

  const emp = emplacementDe(e.classe);
  const flux = e.flux || null;
  const chiffres = [
    { libelle: "Rang dans la ville", valeur: e.rang ? `${e.rang}e / ${e.rues_commercantes}` : "—" },
    { libelle: "Vitrines", valeur: e.vitrines != null ? fmt(e.vitrines) : "—" },
    { libelle: "Longueur", valeur: e.longueur_m ? `${fmt(e.longueur_m)} m` : "—" },
    { libelle: "Densité", valeur: e.densite ? `${String(e.densite).replace(".", ",")} / 100 m` : "—" },
    { libelle: "Loyer de la rue", valeur: e.loyer ? `${fmt(Math.round(e.loyer[0]))}–${fmt(Math.round(e.loyer[1]))} €/m²/an` : "—" },
    { libelle: "Prix au m² autour", valeur: e.prix_m2 ? `${fmt(e.prix_m2)} €/m²` : "—" },
  ];

  return (
    <Section>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Titre sous={`, ${e.ville}`}>{e.rue}</Titre>
        {e.classe != null && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1">
            <span className="rounded-full border px-3.5 py-1.5 text-[12.5px]" style={{ borderColor: `${emp.teinte}59`, color: emp.teinte }}>Emplacement {emp.mot}</span>
            {flux && (
              <span className="flex items-center gap-2.5">
                <Etoiles note={flux.note} taille={15} title="flux estimé" />
                <span className="text-[12.5px] tabular-nums text-ardoise">piéton {flux.pieton ?? "—"} · voiture {flux.voiture ?? "—"} · estimé</span>
              </span>
            )}
          </div>
        )}
      </div>
      <Chiffres items={chiffres} className="mt-6" />
    </Section>
  );
}
