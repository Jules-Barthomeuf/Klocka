import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import SequenceActions from "@/components/prospection/SequenceActions";
import { lignesDuRecu } from "@/components/prospection/ToutPrepare";
import { ListeFiches } from "@/components/fiche-dossier/CarteNote";
import { ouvrirFiche } from "@/lib/fiche-dossier";

// Un échange raconté à l'assistant (24 nov. 2026, Jules : « on prend des notes, par dictée ou par écrit dans
// l'assistant : x m'a rappelé, il a des fiches à m'envoyer, il veut un mail, voici son adresse ; et ça propose des
// actions pareil »). L'outil noter_appel a identifié l'agent et lu le récit comme un appel ; ses actions (contact Twenty
// CRM, mail « Suite à notre échange », relance) s'affichent ici, sous la réponse, au dessin de l'écran d'après l'appel,
// et se valident ici. Rien ne part sans Valider.

const API = "/api/prospection/rappels";
const MA = "/api/prospection/mode-appel";
const MODIFIABLES = [["interlocuteur", "Interlocuteur"], ["telephone", "Téléphone"], ["email", "Email"]];
const jourLong = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const nouvelleCle = () => `recit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function ActionsDuRecit({ rappelId }) {
  const queryClient = useQueryClient();
  const lu = useQuery({ queryKey: ["rappel-recit", rappelId], queryFn: () => base44.request("GET", `${API}/${rappelId}`), enabled: !!rappelId, staleTime: Infinity, retry: false });
  const rappel = lu.data?.rappel || null;
  const appel = rappel?.appel || null;
  const [coches, setCoches] = useState(() => new Set());
  const [mail, setMail] = useState(null);
  const [relanceLe, setRelanceLe] = useState(null);
  const [relance2Le, setRelance2Le] = useState(null);
  const [ligneMonday, setLigneMonday] = useState(null);
  const [edits, setEdits] = useState({});
  const [recu, setRecu] = useState(null);
  const cle = useRef(nouvelleCle());
  const pose = useRef(null);
  useEffect(() => {
    if (!appel || pose.current === appel.id) return;
    pose.current = appel.id;
    const props = appel.propositions || [];
    setCoches(new Set(props.filter((p) => p.coche !== false).map((p) => p.id)));
    const pm = props.find((p) => p.type === "mail");
    setMail(pm ? { a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele } : null);
  }, [appel]);
  const issue = appel?.issue_tapee || appel?.issue || null;

  const valider = useMutation({
    mutationFn: () => {
      const compris = appel.compris?.champs || {};
      const corrections = MODIFIABLES.filter(([k]) => edits[k] != null && String(edits[k]).trim() !== String(compris[k]?.valeur ?? "")).map(([k, libelle]) => ({ cle: k, libelle, valeur: String(edits[k]).trim() }));
      return base44.request("POST", `${MA}/appels/${appel.id}/valider`, { body: {
        choix: [...coches], mail: coches.has("mail") ? mail : null, relance_le: relanceLe, relance2_le: relance2Le, monday_ligne: ligneMonday,
        monday_cases: edits?.monday && Object.keys(edits.monday).length ? edits.monday : null, sans_twenty: !!edits?.sans_twenty, note: String(edits?.note || "").trim(),
        cle: cle.current, session_id: null, issue, corrections,
      } });
    },
    onSuccess: (r) => {
      setRecu(r.recu || {});
      base44.request("POST", `${API}/${rappelId}/terminer`).catch(() => {});
      ["relances", "relances-prises", "rappels-en-cours"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(e?.message || "Validation impossible"),
  });

  if (lu.isLoading) return <p className="m-0 mt-4 flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Je prépare les actions…</p>;
  if (lu.isError || !rappel) return null;
  if (recu || rappel.etat === "valide") {
    const lignes = lignesDuRecu(recu, { issue, dateRelance: relanceLe || appel?.propositions?.find((p) => p.type === "relance")?.prochaine?.le || null, jourLong });
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-3.5">
        <span className="text-[13px] text-ardoise">C'est validé{rappel.agent?.nom ? ` pour ${rappel.agent.nom}` : ""}.</span>
        {lignes.map((l) => (
          <span key={l.nom} className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2.5 text-[14px]">
            <Check className="mt-0.5 h-4 w-4 text-menthe" strokeWidth={2.2} />
            <span className="min-w-0 text-craie"><span className="text-encre">{l.nom}</span> · {l.resultat}</span>
          </span>
        ))}
      </div>
    );
  }
  // Refaite plus bas avec une précision (24 nov. 2026) : ses actions disparaissent, une ligne le dit.
  if (rappel.etat === "remplace") return <p className="m-0 mt-4 text-[13px] text-ardoise">Note refaite plus bas avec la précision.</p>;
  if (rappel.rien_de_nouveau) return null;
  if (!appel) return null;
  // La fiche de la personne, sous les actions (25 nov. 2026, Jules : « on a actions et fiches, normal »).
  const agent = rappel.agent?.id ? { cle: `agent:${rappel.agent.id}`, genre: "agent", nom: rappel.agent.nom || "L'agent", detail: rappel.agent.agence || null } : null;
  const fiches = agent ? (
    <div className="mt-5">
      <p className="m-0 mb-2 px-1 text-[13.5px] text-ardoise">Fiches</p>
      <ListeFiches fiches={[agent]} onVoir={(f) => ouvrirFiche(f.cle, { nom: f.nom })} />
    </div>
  ) : null;
  return (
    <div className="mt-4">
      <SequenceActions sobre appel={appel} agence={{ nom: rappel.agent?.agence || rappel.agence?.nom || appel.agence }} issue={issue} coches={coches} setCoches={setCoches} mail={mail} setMail={setMail}
        relanceLe={relanceLe} setRelanceLe={setRelanceLe} relance2Le={relance2Le} setRelance2Le={setRelance2Le} ligneMonday={ligneMonday} setLigneMonday={setLigneMonday}
        edits={edits} setEdits={setEdits} onLancer={() => valider.mutate()} envoi={valider.isPending} fiches={fiches} />
    </div>
  );
}
