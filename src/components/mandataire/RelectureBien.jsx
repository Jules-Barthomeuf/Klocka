import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

/**
 * La fiche à relire d'un bien qu'on fait entrer (4 nov. 2026, Jules : « il faut qu'il le relise, et s'il y a des choses
 * fausses, qu'il puisse tout modifier facilement, ou me dire exactement ce qu'il faut modifier ») : une liste en lignes,
 * chaque valeur se corrige d'un clic (Entrée enregistre, Échap annule). Le chat corrige aussi : la liste se relit.
 */
const TYPES = [["murs_commerce", "Murs commerciaux"], ["fonds_commerce", "Fonds de commerce"], ["bureaux", "Bureaux"], ["murs_et_fonds", "Murs et fonds"]];
const jour = (v) => (String(v || "").match(/^\d{4}-\d{2}-\d{2}/) || [])[0] || "";
const date = (v) => (jour(v) ? jour(v).split("-").reverse().join("/") : "");
const euros = (n) => (Number(n) > 0 ? `${Math.round(Number(n)).toLocaleString("fr-FR")} €` : "");

/** Pure : les lignes de la fiche, avec leur valeur lue et ce qu'on envoie pour la corriger. */
export function lignesDeRelecture(p) {
  const b = p?.biens || {};
  const r = b.repris || {};
  const m = p?.mandat_importe || {};
  const visite = (b.jalons || []).find((j) => j.quoi === "visite");
  const prix = b.prix_accord || m.prix || r.prix || null;
  const lignes = [
    { cle: "adresse", mot: "Adresse", valeur: p?.adresse || "", envoi: (v) => ({ adresse: v }) },
    { cle: "ville", mot: "Ville", valeur: p?.ville || "", envoi: (v) => ({ ville: v }) },
    { cle: "type_bien", mot: "Type", valeur: p?.type_bien || "", lu: TYPES.find(([k]) => k === p?.type_bien)?.[1] || "", choix: TYPES, envoi: (v) => ({ type_bien: v }) },
    { cle: "proprietaire", mot: "Propriétaire", valeur: p?.nom || "", envoi: (v) => ({ proprietaire: v }) },
    { cle: "telephone", mot: "Téléphone", valeur: p?.telephone || "", envoi: (v) => ({ telephone: v }) },
    { cle: "email", mot: "Mail", valeur: p?.email || "", envoi: (v) => ({ email: v }) },
    { cle: "prix", mot: "Prix", valeur: prix ? String(prix) : "", lu: euros(prix), nombre: true, envoi: (v) => ({ prix: v }) },
    { cle: "loyer_annuel", mot: "Loyer annuel", valeur: r.loyer_annuel ? String(r.loyer_annuel) : "", lu: euros(r.loyer_annuel), nombre: true, envoi: (v) => ({ loyer_annuel: v }) },
    { cle: "surface", mot: "Surface", valeur: r.surface ? String(r.surface) : "", lu: r.surface ? `${r.surface} m²` : "", nombre: true, envoi: (v) => ({ surface: v }) },
    { cle: "visite_le", mot: "Visite", valeur: jour(visite?.le), lu: date(visite?.le), date: true, envoi: (v) => ({ visite_le: v }) },
  ];
  // Le mandat, quand il y en a un (lu, raconté, ou le bien au mandat).
  if (p?.mandat_importe || ["mandat", "dataroom", "marche", "offre", "vente", "analyse"].includes(b.validee)) {
    lignes.push(
      { cle: "signe_le", mot: "Mandat signé le", valeur: jour(m.signe_le), lu: date(m.signe_le), date: true, envoi: (v) => ({ mandat: { signe_le: v } }) },
      { cle: "echeance", mot: "Échéance", valeur: jour(m.echeance), lu: date(m.echeance), date: true, envoi: (v) => ({ mandat: { echeance: v } }) },
      { cle: "exclusif", mot: "Exclusif", valeur: m.exclusif === true ? "oui" : m.exclusif === false ? "non" : "", lu: m.exclusif === true ? "Oui" : m.exclusif === false ? "Non, simple" : "", choix: [["oui", "Oui"], ["non", "Non, simple"]], envoi: (v) => ({ mandat: { exclusif: v === "oui" ? true : v === "non" ? false : null } }) },
      { cle: "enseigne", mot: "Signé chez", valeur: m.enseigne || "", lu: m.enseigne || (p?.mandat_importe ? "K Partners" : ""), envoi: (v) => ({ mandat: { enseigne: v } }) },
    );
  }
  return lignes;
}

function Ligne({ l, pid, relire }) {
  const [edite, setEdite] = useState(null);
  const enregistrer = useMutation({
    mutationFn: (v) => base44.request("PATCH", `/api/mandataire/proprietaires/${pid}/infos`, { body: l.envoi(v) }),
    onSuccess: () => { setEdite(null); relire(); },
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const valider = () => (edite === l.valeur ? setEdite(null) : enregistrer.mutate(l.nombre ? String(edite).replace(/[^\d]/g, "") : edite));
  const lu = l.lu ?? l.valeur;
  const champ = "min-w-0 flex-1 rounded-champ border border-trait bg-surface px-2.5 py-1 text-[14px] text-encre outline-none focus:border-bord-vif max-md:text-[16px]";
  return (
    <li className="flex min-h-[40px] items-center gap-4 border-b border-trait py-1.5">
      <span className="w-[128px] flex-none text-[13px] text-ardoise">{l.mot}</span>
      {edite != null ? (
        <span className="flex min-w-0 flex-1 items-center gap-2" onKeyDown={(e) => { if (e.key === "Escape") setEdite(null); }}>
          {l.choix ? (
            <select autoFocus value={edite} onChange={(e) => enregistrer.mutate(e.target.value)} onBlur={() => setEdite(null)} className={champ} aria-label={l.mot}>
              <option value="">—</option>
              {l.choix.map(([k, m]) => <option key={k} value={k}>{m}</option>)}
            </select>
          ) : (
            <input autoFocus type={l.date ? "date" : "text"} inputMode={l.nombre ? "numeric" : undefined} value={edite} onChange={(e) => setEdite(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") valider(); }} onBlur={valider} className={champ} aria-label={l.mot} />
          )}
          {enregistrer.isPending && <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-ardoise" />}
        </span>
      ) : (
        <button type="button" onClick={() => setEdite(l.valeur)} title="Corriger" className={`min-w-0 flex-1 truncate text-left text-[14px] ${lu ? "text-encre" : "text-brume"} hover:text-menthe`} style={{ background: "transparent" }}>
          {lu || "À compléter"}
        </button>
      )}
    </li>
  );
}

export default function RelectureBien({ proprietaire }) {
  const queryClient = useQueryClient();
  const relire = () => ["m-proprietaires", "m-fiche", "m-documents-bien"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  if (!proprietaire?.id) return null;
  return (
    <section className="border-b border-bord-vif py-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">La fiche à relire</p>
        <span className="text-[12.5px] text-ardoise">Un clic corrige, ou dites-le à l'assistant</span>
      </div>
      <ul className="m-0 mt-3 list-none p-0">
        {lignesDeRelecture(proprietaire).map((l) => <Ligne key={l.cle} l={l} pid={proprietaire.id} relire={relire} />)}
      </ul>
    </section>
  );
}
