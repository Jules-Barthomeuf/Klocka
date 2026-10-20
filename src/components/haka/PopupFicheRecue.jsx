import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useCompteHaka, usePropositions } from "@/components/haka/useFileHaka";
import ApercuFicheRecue from "@/components/haka/ApercuFicheRecue";

// La fenêtre qui s'ouvre d'elle-même quand une fiche commerciale arrive (20 oct. 2026, Jules : « je veux plus qu'on
// rentre une fiche automatiquement, ça met une pop-up, nouvelle fiche, la rentrer ? OUI NON »). Une fiche à la fois,
// la plus ancienne d'abord : la mienne, ou celle d'une boîte commune. « Plus tard » (la croix) la laisse dans la
// cloche et ne la remontre pas avant trente minutes, sur cet appareil.

const CLE = "klocka.fiches.plus-tard";
const PLUS_TARD_MS = 30 * 60 * 1000;
const lirePlusTard = () => { try { return JSON.parse(localStorage.getItem(CLE) || "{}") || {}; } catch { return {}; } };

export default function PopupFicheRecue() {
  const actif = !!useCompteHaka().data?.actif;
  const moi = usePropositions("moi");
  const commun = usePropositions("commun");
  const qc = useQueryClient();
  const [plusTard, setPlusTard] = useState(lirePlusTard);
  const [faites, setFaites] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  // Réévalue « Plus tard » chaque minute : une fiche reportée revient d'elle-même.
  const [, setTic] = useState(0);
  useEffect(() => { const t = setInterval(() => setTic((n) => n + 1), 60_000); return () => clearInterval(t); }, []);

  if (!actif) return null;
  const maintenant = Date.now();
  const fiches = [...(moi.data?.propositions || []), ...(commun.data?.propositions || [])]
    .filter((p, i, t) => p.type === "preanalyser_fiche" && t.findIndex((x) => x.id === p.id) === i)
    .filter((p) => !faites.has(p.id) && !((plusTard[p.id] || 0) > maintenant))
    .sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)));
  const p = fiches[0];
  if (!p) return null;

  const reporter = () => {
    const suivant = { ...lirePlusTard(), [p.id]: Date.now() + PLUS_TARD_MS };
    try { localStorage.setItem(CLE, JSON.stringify(suivant)); } catch { /* navigation privée */ }
    setPlusTard(suivant);
  };
  const trancher = async (choix, extra = {}) => {
    setEnCours(true);
    try {
      await base44.request("POST", `/api/haka/propositions/${p.id}/valider`, { body: { choix, ...extra } });
      setFaites((s) => new Set([...s, p.id]));
      toast.success(choix === "preanalyser" ? "C'est parti : Haka rentre la fiche et vous prévient quand la pré-analyse est prête." : "Noté : Haka ne la rentre pas, et retient pourquoi.");
      qc.invalidateQueries({ queryKey: ["haka"] });
    } catch (e) {
      toast.error(e?.message || "La réponse n'est pas partie");
    } finally {
      setEnCours(false);
    }
  };
  return <ApercuFicheRecue key={p.id} proposition={p} popup enCours={enCours} onFermer={reporter} onTrancher={trancher} />;
}
