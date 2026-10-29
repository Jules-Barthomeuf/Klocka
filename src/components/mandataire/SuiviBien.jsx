import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Loader2, Mail, Phone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { euros } from "@/components/mandataire/kit";

// Le Suivi d'un bien dont l'avis est parti (27 oct. 2026, Jules) : l'onglet à gauche de l'Avis. Le bien et son prix
// d'accord, ce qu'il reste à faire (les relances posées par Haka), l'historique, puis la fiche du bien. Tout se remplit
// depuis le chat : ici on lit, on coche « Fait ».

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const jourHeure = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" })}${h !== "09:00" && h !== "10:00" ? ` · ${h}` : ""}`;
};
const ICONES = { appel: Phone, mail: Mail, rdv: CalendarClock };
const MOTS_HISTO = { echange: "Échange", restitution: "Réponse", etape: "Étape", visite: "Visite" };

const Titre = ({ children }) => <p className="m-0 mt-6 border-b border-trait pb-2 text-[11px] uppercase tracking-[.16em] text-brume first:mt-0">{children}</p>;
// Le tableau des infos de la fiche (29 oct. 2026, Jules) : deux colonnes égales et centrées, le libellé en `ardoise`, un
// trait entre les lignes et au milieu, dans le même cadre arrondi que « Tous les commerces ».
const Ligne = ({ mot, children, accent = false }) => (
  <div className="grid grid-cols-2 items-stretch border-t border-trait text-center first:border-t-0">
    <dt className="flex items-center justify-center px-4 py-3 text-[13px] text-ardoise">{mot}</dt>
    <dd className={`m-0 flex min-w-0 items-center justify-center border-l border-bord-doux px-4 py-3 text-[14px] ${accent ? "text-menthe" : "text-encre"}`}>{children}</dd>
  </div>
);

export default function SuiviBien({ proprietaireId }) {
  const queryClient = useQueryClient();
  // Sous « m-fiche » : ce que le chat rafraîchit après chaque réponse rafraîchit aussi le Suivi.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["m-fiche", "suivi", proprietaireId],
    queryFn: () => base44.request("GET", `/api/mandataire/proprietaires/${proprietaireId}/suivi`),
    enabled: !!proprietaireId,
  });
  const fait = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/mandataire/rappels/${id}/fait`, { body: {} }),
    onSuccess: () => ["m-fiche", "m-rappels", "m-proprietaires"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  if (isLoading) return <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (isError || !data?.bien) return <p className="m-0 px-6 py-10 text-center text-[14px] text-ardoise">Le suivi ne se charge pas.</p>;
  const b = data.bien;
  return (
    <div className="h-full overflow-y-auto">
      {/* Deux colonnes sur grand écran (27 oct. 2026, Jules : « pas tout sur la même colonne ») : le suivi à gauche,
          la fiche du bien à droite ; une seule au téléphone. */}
      <div className="grid gap-x-10 px-6 py-6 md:pr-[72px] lg:grid-cols-2">
        <div className="min-w-0">
        <dl className="m-0 overflow-hidden rounded-[12px] border border-bord-doux bg-surface/40">
          <Ligne mot="Où en est-on">{b.statut}</Ligne>
          <Ligne mot="Prix d'accord" accent={!!b.prix_accord}>{b.prix_accord ? euros(b.prix_accord) : <span className="text-brume">Pas encore</span>}</Ligne>
          {b.revision_prix_jours && <Ligne mot="Révision du prix">à {b.revision_prix_jours} jours, au mandat</Ligne>}
          {/* La valeur seule, sans la fourchette (29 oct. 2026, Jules). */}
          {b.valeur && <Ligne mot="Avis de valeur">{euros(b.valeur)}</Ligne>}
          {b.envoye_le && <Ligne mot="Envoyé au propriétaire">{jour(b.envoye_le)}</Ligne>}
          {b.prix_pense && <Ligne mot="Le propriétaire pensait à">{euros(b.prix_pense)}</Ligne>}
          {b.mandat && <Ligne mot="Mandat">{b.mandat.signe ? "Signé" : "En préparation"}</Ligne>}
          {/* « À faire » dans le tableau (29 oct. 2026, Jules) : une ligne par relance posée, « Fait » dans la case. */}
          {data.a_faire.length ? data.a_faire.map((r, i) => {
            const Icone = ICONES[r.canal] || Check;
            const passe = r.echeance && new Date(r.echeance) < new Date();
            return (
              <Ligne key={r.id} mot={i === 0 ? "À faire" : ""}>
                <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  <Icone className="h-4 w-4 flex-none text-ardoise" />
                  <span className="min-w-0">{r.quoi}</span>
                  <span className={`flex-none tabular-nums ${passe ? "text-ambre" : "text-ardoise"}`}>{jourHeure(r.echeance)}</span>
                  <button type="button" onClick={() => fait.mutate(r.id)} disabled={fait.isPending}
                    className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
                    <Check className="h-3.5 w-3.5" /> Fait
                  </button>
                </span>
              </Ligne>
            );
          }) : <Ligne mot="À faire"><span className="text-brume">Rien de prévu. Racontez la suite au chat.</span></Ligne>}
        </dl>
        {b.alerte && <p className="m-0 mt-2 text-[13px] text-ambre">{b.alerte}</p>}
        {data.faites.length > 0 && (
          <div className="mt-3">
            {data.faites.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-1.5 text-[13.5px] text-brume">
                <Check className="h-3.5 w-3.5 flex-none text-menthe" />
                <span className="min-w-0 flex-1 line-through decoration-brume/60">{r.quoi}</span>
                <span className="flex-none tabular-nums">{jour(r.fait_le)}</span>
              </div>
            ))}
          </div>
        )}

        <Titre>Historique</Titre>
        {data.historique.length ? data.historique.map((h, i) => (
          <div key={`${h.le}-${i}`} className="flex gap-4 border-b border-bord-doux py-2.5 text-[14px] last:border-b-0">
            <span className="w-16 flex-none tabular-nums text-ardoise">{jour(h.le)}</span>
            <span className="min-w-0 flex-1 text-encre">{h.texte}</span>
            {MOTS_HISTO[h.type] && <span className="flex-none text-[12px] text-brume">{MOTS_HISTO[h.type]}</span>}
          </div>
        )) : <p className="m-0 py-2.5 text-[13.5px] text-brume">Rien encore.</p>}

        </div>
        <div className="min-w-0 max-lg:mt-6">
          <Titre>La fiche</Titre>
          <div className="-mx-5 -mt-3">
            <FicheMandataire id={proprietaireId} sansChat sansPreparation sansHistorique />
          </div>
        </div>
      </div>
    </div>
  );
}
