import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { euros } from "@/components/mandataire/kit";

// Le Suivi d'un bien dont l'avis est parti (27 oct. 2026, Jules), refait le 2 nov. 2026 (Jules, après l'avis produit
// « où j'en suis avec ce propriétaire, et qu'est-ce que je fais maintenant ? ») : dans l'ordre du travail, l'état en
// titre, le propriétaire sur une ligne, le prix en deux tuiles (l'avis, l'accord), puis l'historique
// depuis l'envoi, ce qu'il reste à faire en tête. Tout se remplit depuis le chat : ici on lit, on coche « Fait ».
// Révision du prix et mandat vont à l'étape Mandat ; les relances faites deviennent des lignes de l'historique.
// La carte « Prochaine action » est retirée le même jour : l'action à faire est la première ligne de l'historique.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
// L'heure seulement quand elle compte (un rendez-vous), pas l'heure posée par défaut.
const heure = (iso) => {
  if (!iso || !String(iso).includes("T")) return "";
  const h = new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return h !== "09:00" && h !== "10:00" ? ` · ${h}` : "";
};
const COURT = 5;

const Titre = ({ children }) => <p className="m-0 mt-6 border-b border-trait pb-2 text-[11px] uppercase tracking-[.16em] text-brume">{children}</p>;

const Tuile = ({ mot, children, accent = false }) => (
  <div className="min-w-0 border-l border-bord-doux px-3 py-3 text-center first:border-l-0">
    <p className="m-0 text-[11px] uppercase tracking-[.12em] text-brume">{mot}</p>
    <p className={`m-0 mt-1 truncate text-[17px] tabular-nums ${accent ? "text-menthe" : "text-encre"}`}>{children}</p>
  </div>
);

const telDe = (t) => String(t || "").replace(/[^\d+]/g, "");

export default function SuiviBien({ proprietaireId }) {
  const queryClient = useQueryClient();
  const [tout, setTout] = React.useState(false);
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
  const tel = telDe(b.telephone);
  // L'état en titre : « Où en est-on » et « Envoyé au propriétaire » ne font qu'une ligne.
  const etat = b.statut === "Estimation envoyée" && b.envoye_le
    ? `Avis envoyé le ${jour(b.envoye_le)} · en attente de sa réponse`
    : [b.statut, b.envoye_le && `avis envoyé le ${jour(b.envoye_le)}`].filter(Boolean).join(" · ");
  // L'historique depuis l'envoi de l'avis, les relances faites comprises, le plus récent en tête.
  const depuis = b.envoye_le || "";
  const histo = [
    ...data.historique.filter((h) => !depuis || String(h.le) >= depuis),
    ...data.faites.map((r) => ({ le: r.fait_le, texte: r.quoi, type: "fait" })),
  ].sort((x, y) => String(y.le).localeCompare(String(x.le)));
  const vus = tout ? histo : histo.slice(0, COURT);

  const BoutonFait = ({ r }) => (
    <button type="button" onClick={() => fait.mutate(r.id)} disabled={fait.isPending}
      className={`inline-flex flex-none items-center justify-center gap-1.5 rounded-full border border-trait text-craie hover:text-encre h-8 px-3 text-[12.5px]`} style={{ background: "transparent" }}>
      <Check className="h-3.5 w-3.5" /> Fait
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6">
        <p className="m-0 text-[17px] text-encre">{etat}</p>
        {b.alerte && <p className="m-0 mt-1 text-[13px] text-ambre">{b.alerte}</p>}

        {/* Le propriétaire et de quoi le joindre, sur une ligne. */}
        {(b.proprietaire || b.telephone || b.email) && (
          <p className="m-0 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ardoise">
            {b.proprietaire && <span className="text-encre">{b.proprietaire}</span>}
            {b.telephone && <a href={`tel:${tel}`} className="tabular-nums text-encre hover:text-pervenche">{b.telephone}</a>}
            {b.email && <a href={`mailto:${b.email}`} className="min-w-0 truncate text-encre hover:text-pervenche">{b.email}</a>}
          </p>
        )}

        {/* Le prix en deux tuiles : l'avis et l'accord. « Il pensait à » est retiré le 7 nov. 2026 (Jules). En location,
            l'avis est un loyer annuel : la tuile le dit, pour ne pas le lire comme un prix. */}
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[12px] border border-bord-doux bg-surface/40">
          <Tuile mot={b.location ? "Loyer de l'avis" : "Avis"}>{b.valeur ? `${euros(b.valeur)}${b.location ? " /an" : ""}` : <span className="text-brume">-</span>}</Tuile>
          <Tuile mot={b.location ? "Loyer d'accord" : "Accord"} accent={!!b.prix_accord}>{b.prix_accord ? `${euros(b.prix_accord)}${b.location ? " /an" : ""}` : <span className="text-[14px] text-brume">Pas encore</span>}</Tuile>
        </div>

        <Titre>Historique{depuis ? " depuis l'envoi" : ""}</Titre>
        {/* Ce qu'il reste à faire en tête de l'historique, en pervenche (ambre si la date est passée), l'un sous l'autre
            avec ce qui a été fait (2 nov. 2026, Jules : « pour voir directement quoi faire »). */}
        {data.a_faire.map((r) => {
          const passe = r.echeance && new Date(r.echeance) < new Date();
          return (
            <div key={r.id} className="flex items-center gap-4 border-b border-bord-doux py-2.5 text-[14px]">
              <span className={`w-16 flex-none tabular-nums ${passe ? "text-ambre" : "text-pervenche"}`}>{jour(r.echeance) || "Bientôt"}</span>
              <span className={`min-w-0 flex-1 ${passe ? "text-ambre" : "text-pervenche"}`}>À faire : {r.quoi}{heure(r.echeance)}</span>
              <BoutonFait r={r} />
            </div>
          );
        })}
        {vus.length ? vus.map((h, i) => (
          <div key={`${h.le}-${i}`} className="flex gap-4 border-b border-bord-doux py-2.5 text-[14px] last:border-b-0">
            <span className="w-16 flex-none tabular-nums text-ardoise">{jour(h.le)}</span>
            <span className="min-w-0 flex-1 text-encre">{h.type === "fait" ? `Fait : ${h.texte}` : h.texte}</span>
          </div>
        )) : !data.a_faire.length && <p className="m-0 py-2.5 text-[13.5px] text-brume">Rien encore. Racontez la suite au chat.</p>}
        {histo.length > COURT && (
          <button type="button" onClick={() => setTout((v) => !v)} className="mt-2 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            {tout ? "Moins" : `Tout voir (${histo.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
