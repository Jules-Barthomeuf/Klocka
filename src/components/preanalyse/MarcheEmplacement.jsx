import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Etiquette, Etoiles, Nombre, TEINTES, emplacementDe } from "@/components/alx/alx-commun";

// L'emplacement du dossier, vu par ALX.
//
// Le marché disait jusqu'ici ce que valent les loyers et les fonds AUTOUR de
// l'adresse, sans jamais dire ce que vaut la rue elle-même dans sa ville. ALX
// sait le faire pour rien : OpenStreetMap donne les vitrines de chaque rue de
// la commune, Data-B le loyer de la rue, et le rang dit le reste. Quand la
// ville a déjà été prospectée, c'est son classement qui parle : le dossier et
// la prospection ne peuvent pas se contredire.

const nombre = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));

/** Ce que le rang veut dire, en une phrase. */
function phrase(e) {
  if (!e?.connue) return "OpenStreetMap ne connaît pas encore de vitrine sur cette rue : le relevé ne dit rien de son emplacement.";
  const emp = emplacementDe(e.classe);
  const part = e.rang && e.rues_commercantes ? Math.round((e.rang / e.rues_commercantes) * 100) : null;
  const rang = e.rang ? `${e.rang}e rue commerçante de ${e.ville} sur ${e.rues_commercantes}${part ? `, dans les ${part} % du haut` : ""}` : `rue peu commerçante de ${e.ville}`;
  const densite = e.densite ? `${e.densite} vitrine${e.densite > 1 ? "s" : ""} par 100 m` : null;
  return `${rang}. ${e.vitrines} vitrine${e.vitrines > 1 ? "s" : ""}${e.longueur_m ? ` sur ${nombre(e.longueur_m)} m` : ""}${densite ? ` (${densite})` : ""}. ${emp.classe ? `Emplacement ${emp.mot} : ${emp.detail}.` : ""}`;
}

export default function MarcheEmplacement({ adresse }) {
  const { data: e, isLoading, isError } = useQuery({
    queryKey: ["alx-emplacement", adresse],
    queryFn: () => base44.request("GET", `/api/alx/emplacement?adresse=${encodeURIComponent(adresse)}`),
    enabled: !!adresse,
    staleTime: 3600000,
    retry: false,
  });

  if (!adresse) return null;
  if (isLoading) {
    return (
      <section className="rounded-[16px] border border-white/[0.07] px-6 py-5">
        <Etiquette>L'emplacement</Etiquette>
        <div className="mt-2 text-[13.5px] text-[#8B938F]">ALX lit les rues de la ville sur OpenStreetMap…</div>
      </section>
    );
  }
  if (isError || !e) return null;

  const emp = emplacementDe(e.classe);
  const chiffres = [
    ["Rang dans la ville", e.rang ? `${e.rang}e / ${e.rues_commercantes}` : "—"],
    ["Vitrines", e.vitrines != null ? nombre(e.vitrines) : "—"],
    ["Longueur", e.longueur_m ? `${nombre(e.longueur_m)} m` : "—"],
    ["Densité", e.densite ? `${String(e.densite).replace(".", ",")} / 100 m` : "—"],
    ["Loyer de la rue", e.loyer ? `${nombre(Math.round(e.loyer[0]))}–${nombre(Math.round(e.loyer[1]))} €/m²/an` : "—"],
    ["Prix au m² autour", e.prix_m2 ? `${nombre(e.prix_m2)} €/m²` : "—"],
  ];

  return (
    <section className="rounded-[16px] border border-white/[0.07] px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <Etiquette>L'emplacement · ALX</Etiquette>
          <div className="mt-2 text-[20px] font-light tracking-[-.02em] text-[#F3F7F5]">{e.rue}<span className="text-[#8B938F]">, {e.ville}</span></div>
        </div>
        {e.classe != null && (
          <div className="flex items-center gap-3">
            <span className="alx-mont rounded-full border px-3 py-1 text-[12px] font-medium" style={{ borderColor: emp.teinte, color: emp.teinte }}>Emplacement {emp.mot}</span>
            {e.flux && <Etoiles note={e.flux.note} taille={15} title={`flux ${e.flux_mesure ? "mesuré chez Data-B" : "estimé"} : piéton ${e.flux.pieton ?? "—"}/5, voiture ${e.flux.voiture ?? "—"}/5`} />}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3.5 md:grid-cols-3 xl:grid-cols-6">
        {chiffres.map(([mot, val]) => (
          <div key={mot}>
            <Etiquette className="!text-[9px]">{mot}</Etiquette>
            <div className="mt-1"><Nombre taille={14.5} teinte="#F3F7F5">{val}</Nombre></div>
          </div>
        ))}
      </div>

      <p className="m-0 mt-4 text-[13.5px] leading-[1.6] text-[#C3CBC7]">{phrase(e)}</p>

      {(e.enseignes || []).length > 0 && (
        <p className="m-0 mt-2 text-[12.5px] leading-[1.6] text-[#8B938F]">Dans la rue : {e.enseignes.slice(0, 10).join(" · ")}</p>
      )}

      <p className="m-0 mt-3 text-[11.5px] text-[#5A6762]">
        {e.par_alx ? `Classement ALX de ${e.ville}` : e.classe_source ? `Classe d'après le ${e.classe_source}` : "Classe inconnue"}
        {e.loyer_source ? ` · loyer ${e.loyer_source}` : ""}
        {e.prix_m2_source ? ` · prix ${e.prix_m2_source}` : ""}
        {` · vitrines OpenStreetMap, relevé du ${new Date(e.releve_le).toLocaleDateString("fr-FR")}`}
        {e.flux ? ` · flux ${e.flux_mesure ? "mesuré" : "estimé"}` : ""}
      </p>
      {e.classe != null && !e.par_alx && (
        <p className="m-0 mt-1 text-[11.5px]" style={{ color: TEINTES.muet }}>
          {e.ville} n'a pas été prospectée par ALX : lancez-la pour classer toutes ses rues et trouver les propriétaires.
        </p>
      )}
    </section>
  );
}
