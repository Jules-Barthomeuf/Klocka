import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListeVilles } from "@/components/mandataire/VillesMandataire";
import { AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useUser } from "@/components/providers/UserProvider";

// L'administration de l'espace mandataire : chaque mandataire, ses villes, ses
// mentions d'avis de valeur, et l'alerte avant l'expiration de ses documents.

const API = "/api/mandataire/admin";

/**
 * @param integre  dans l'onglet Mandataires de la page Utilisateurs (24 oct. 2026, Jules : « manager les mandataires
 *                 depuis la partie Utilisateurs ») : sans titre ni marges de page, la fiche des mandataires d'abord.
 * @param focus    l'adresse d'un mandataire dont la fiche s'ouvre et se montre.
 */
// Les mandataires seuls (6 nov. 2026, Jules : « un truc plus simple ») : plus de titre, d'onglets ni de phrase
// d'explication ; plus de secteurs tracés, de Villes Klocka, de Prospections ni de Clients servis.
export default function AdminMandataires({ integre = false, focus = null }) {
  return (
    <div className={integre ? "" : "mx-auto max-w-[1100px] px-5 pb-16 pt-6 md:px-8"}>
      <Mandataires focus={focus} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mandataires : ses villes, ses mentions d'avis, et l'alerte avant l'expiration.
// ---------------------------------------------------------------------------

// Ce qui figure sur chacun de ses avis de valeur : saisi une fois ici, le
// mandataire ne le retape jamais.
const CHAMPS_AVIS = [
  ["nom_avis", "Nom sur les avis", "text"],
  ["qualite_avis", "Qualité", "text", "Agent commercial"],
  ["ville_rsac", "Ville du RSAC", "text"],
  ["carte_t", "Carte T : structure et n° CPI", "text"],
  ["email_avis", "Email sur les avis", "text"],
  ["ville_signature", "Ville de signature (« Fait à »)", "text"],
];

function Mandataires({ focus = null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-mandataires"], queryFn: () => base44.request("GET", `${API}/mandataires`) });
  // Venu d'une ligne de la page Utilisateurs : sa fiche se montre.
  useEffect(() => {
    if (!focus || !data) return;
    setTimeout(() => document.getElementById(`mandataire-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  }, [focus, data]);
  const [brouillons, setBrouillons] = useState({});
  const poser = useMutation({
    mutationFn: ({ email, champs }) => base44.request("POST", `${API}/mandataires/${encodeURIComponent(email)}`, { body: champs }),
    onSuccess: (_, { email }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] });
      setBrouillons((b) => ({ ...b, [email]: undefined }));
      toast.success("Fiche enregistrée");
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const moi = useMutation({
    mutationFn: (actif) => base44.request("POST", `${API}/moi`, { body: { actif } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const mandataires = data?.mandataires || [];
  const analystes = data?.analystes || [];
  const utilisateur = useUser();
  const dejaMoi = mandataires.some((m) => m.email === String(utilisateur?.email || "").toLowerCase());
  return (
    <div className="mt-5">
      <div className="flex justify-end">
        <button type="button" onClick={() => moi.mutate(!dejaMoi)} disabled={moi.isPending}
          className="rounded-full border border-trait px-3.5 py-1.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe disabled:opacity-50"
          style={{ background: "transparent" }}>
          {dejaMoi ? "Ne plus être mandataire" : "Être aussi mandataire"}
        </button>
      </div>
      {mandataires.length === 0 && <p className="m-0 mt-5 text-[13.5px] text-brume">Aucun compte mandataire pour l'instant.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {mandataires.map((m) => {
          const b = brouillons[m.email] || {};
          // Un champ date veut « AAAA-MM-JJ » : une valeur ISO complète se coupe.
          const enregistree = (c, type) => (type === "date" ? String(m[c] || "").slice(0, 10) : m[c] || "");
          const valeur = (c, type) => (b[c] !== undefined ? b[c] : enregistree(c, type));
          // Enregistrer n'apparaît que si une valeur diffère de la fiche : retaper l'ancienne ne compte pas.
          const modifies = Object.fromEntries(CHAMPS_AVIS.filter(([c, , type]) => b[c] !== undefined && b[c] !== enregistree(c, type)).map(([c]) => [c, b[c]]));
          const champSaisi = ([c, mot, type, indice]) => (
            <label key={c} className="text-[11.5px] uppercase tracking-[.1em] text-brume">
              {mot}
              {type === "analyste" ? (
                <select value={valeur(c, type)} onChange={(e) => setBrouillons((x) => ({ ...x, [m.email]: { ...b, [c]: e.target.value } }))}
                  className="mt-1 w-full rounded-champ border border-trait bg-surface px-2.5 py-1.5 text-[13.5px] normal-case tracking-normal text-encre outline-none max-md:text-[16px]">
                  <option value="">Aucun</option>
                  {analystes.map((a) => <option key={a.email} value={a.email}>{a.nom}</option>)}
                  {m[c] && !analystes.some((a) => a.email === m[c]) && <option value={m[c]}>{m[c]}</option>}
                </select>
              ) : (
                <input type={type} value={valeur(c, type)} placeholder={indice}
                  onChange={(e) => setBrouillons((x) => ({ ...x, [m.email]: { ...b, [c]: e.target.value } }))}
                  className="mt-1 w-full rounded-champ border border-trait bg-surface px-2.5 py-1.5 text-[13.5px] normal-case tracking-normal text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
              )}
            </label>
          );
          return (
            <div key={m.email} id={`mandataire-${m.email}`} className={`rounded-[16px] border bg-surface px-5 py-4 ${focus && focus === m.email ? "border-menthe" : "border-trait"}`}>
              <p className="m-0 text-[15px] text-encre">{m.nom || m.email}{m.admin && <span className="ml-2 text-[11px] uppercase tracking-[.14em] text-brume">admin</span>}</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{m.email}</p>
              {m.alertes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.alertes.map((a, i) => (
                    <p key={i} className="m-0 inline-flex items-center gap-1.5 text-[12.5px] text-alerte"><AlertTriangle className="h-3.5 w-3.5" /> {a}</p>
                  ))}
                </div>
              )}
              {/* Ses villes (6 nov. 2026, Jules : « je dois pouvoir charger des villes pour lui ») : prêtes avant qu'il arrive. */}
              <p className="m-0 mt-4 text-[11.5px] uppercase tracking-[.1em] text-menthe">Ses villes</p>
              <div className="mt-1.5"><ListeVilles email={m.email} vide="Aucune ville : ajoutez-en une, elle se prépare en fond." /></div>
              <p className="m-0 mt-4 text-[11.5px] uppercase tracking-[.1em] text-menthe">Sur ses avis de valeur</p>
              <div className="mt-2 grid grid-cols-2 gap-2">{CHAMPS_AVIS.map(champSaisi)}</div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {[["photo", "photo_url", "Photo"], ["signature", "signature_url", "Signature"]].map(([type, champ, mot]) => (
                  <label key={type} className="inline-flex cursor-pointer items-center gap-2.5 text-[12.5px] text-craie hover:text-encre">
                    {m[champ]
                      ? <img src={m[champ]} alt="" className={type === "photo" ? "h-10 w-10 rounded-full object-cover" : "h-10 max-w-[120px] rounded bg-white object-contain p-1"} />
                      : <span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-bord-vif text-[18px] text-brume">+</span>}
                    {m[champ] ? `Changer la ${mot.toLowerCase()}` : `Ajouter la ${mot.toLowerCase()}`}
                    <input type="file" accept="image/*" hidden onChange={async (e) => {
                      const f = e.target.files?.[0]; e.target.value = "";
                      if (!f) return;
                      const form = new FormData(); form.append("fichier", f);
                      try { await base44.request("POST", `${API}/mandataires/${encodeURIComponent(m.email)}/fichier?type=${type}`, { body: form, isForm: true }); queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] }); toast.success(`${mot} enregistrée`); }
                      catch (err) { toast.error(err?.message || "Envoi impossible"); }
                    }} />
                  </label>
                ))}
              </div>
              {Object.keys(modifies).length > 0 && (
                <button type="button" onClick={() => poser.mutate({ email: m.email, champs: modifies })} disabled={poser.isPending}
                  className="mt-3 rounded-full bg-menthe px-4 py-1.5 text-[12px] font-semibold text-fond hover:bg-menthe-survol disabled:opacity-50">
                  Enregistrer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
