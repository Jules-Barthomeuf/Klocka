import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RotateCcw, Send, Trash2 } from "lucide-react";
import { THEMES, rendreEmail } from "@/lib/email-design";
import { toast } from "@/components/ui/avis";
import EditeurEmail from "./EditeurEmail";
import { req, useEnregistrement, bouton, boutonPlein, date } from "./commun";

// Les templates : le template Klocka de base dans ses trois designs, ceux
// qu'on a enregistrés depuis un email, et, à part, les emails de la
// plateforme (l'invitation d'un client), retouchés dans le même éditeur.

const EXEMPLE = { prenom: "Marie", nom: "Durand", lien: "https://klocka.immo/Bienvenue", expediteur: "Jules" };

function Vignette({ t, onOuvrir, actions }) {
  const html = rendreEmail(t.design, EXEMPLE, { logo: "/icones/icone-192.png" }).html;
  return (
    <div className="group overflow-hidden rounded-[16px] border border-trait bg-rail">
      <button type="button" onClick={onOuvrir} className="block w-full" style={{ background: "transparent" }}>
        <div className="pointer-events-none h-[220px] overflow-hidden bg-white">
          <iframe title={t.nom} srcDoc={html} className="h-[640px] w-[200%] origin-top-left scale-50 border-0" tabIndex={-1} />
        </div>
      </button>
      <div className="flex items-center gap-2 border-t border-trait px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-encre">{t.nom}</span>
          <span className="block text-[12px] text-ardoise">{THEMES[t.design?.theme]?.nom || "Clair"}{t.cree_le ? ` · ${date(t.cree_le)}` : ""}</span>
        </span>
        {actions}
      </div>
    </div>
  );
}

function EditeurTemplate({ t, plateforme, onFermer }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState(t);
  const [sauve, setSauve] = useState("ok");
  const enregistrer = useEnregistrement(async (x) => {
    setSauve("en_cours");
    try {
      await req("PATCH", plateforme ? `/modeles/${t.cle}` : `/templates/${t.id}`, { nom: x.nom, objet: x.objet, apercu: x.apercu, design: x.design });
      setSauve("ok");
      queryClient.invalidateQueries({ queryKey: ["emailing-templates"] });
    } catch (e) { setSauve("erreur"); toast.error(e?.message || "Enregistrement impossible"); }
  });
  const test = useMutation({ mutationFn: () => req("POST", `/modeles/${t.cle}/test`), onSuccess: (r) => toast.success(`Test envoyé à ${r.a}`), onError: (e) => toast.error(e?.message || "Test impossible") });
  const retablir = useMutation({ mutationFn: () => req("DELETE", `/modeles/${t.cle}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["emailing-templates"] }); toast.success("Modèle d'origine rétabli"); onFermer(); } });
  return (
    <div className="flex h-[100dvh] min-h-[640px] flex-col max-md:h-[calc(100dvh-var(--k-haut-mobile)-var(--k-bas-mobile))]">
      <div className="flex flex-wrap items-center gap-3 border-b border-trait px-6 py-3 max-md:px-4">
        <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre"><ArrowLeft className="h-3.5 w-3.5" />Templates</button>
        {plateforme ? <span className="text-[18px] text-encre">{t.nom}</span> : <input value={v.nom || ""} onChange={(e) => { const n = { ...v, nom: e.target.value }; setV(n); enregistrer(n); }} className="min-w-[200px] flex-1 bg-transparent text-[18px] text-encre outline-none max-md:min-w-0" />}
        <span className="text-[12px] text-brume">{sauve === "en_cours" ? "Enregistrement…" : sauve === "erreur" ? "Non enregistré" : "Enregistré"}</span>
        {plateforme && <span className="text-[12.5px] text-ardoise">{t.description}</span>}
        <span className="ml-auto" />
        {plateforme && <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className={bouton}>{test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}M'envoyer un test</button>}
        {plateforme && t.modifie_le && <button type="button" onClick={() => { if (window.confirm("Revenir au modèle d'origine ? Vos retouches seront perdues.")) retablir.mutate(); }} className={bouton}><RotateCcw className="h-3.5 w-3.5" />Modèle d'origine</button>}
      </div>
      {/* Au téléphone, l'éditeur passe en une colonne : cette zone défile. */}
      <div className="min-h-0 flex-1 max-md:overflow-y-auto">
        <EditeurEmail email={v} onChange={(x) => { const n = { ...v, ...x }; setV(n); enregistrer(n); }} desinscription={!plateforme} variables={plateforme ? t.variables : null} />
      </div>
    </div>
  );
}

export default function Templates({ onCampagne, demande = null, onDetail = null }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["emailing-templates"], queryFn: () => req("GET", "/templates") });
  const [ouvert, setOuvert] = useState(null);
  // « Nouveau template » : une copie du template Klocka, ouverte dans l'éditeur.
  const nouveau = useMutation({
    mutationFn: () => { const base = data?.base?.[0]; return req("POST", "/templates", { nom: "Nouveau template", objet: base?.objet || "", apercu: base?.apercu || "", design: base?.design || { theme: "clair", blocs: [] } }); },
    onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: ["emailing-templates"] }); const t = r?.template || r; if (t?.id) setOuvert({ t, plateforme: false }); },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });
  useEffect(() => { if (demande?.quoi === "nouveau" && data) nouveau.mutate(); }, [demande?.n]);
  useEffect(() => { onDetail?.(!!ouvert); }, [ouvert]);
  const supprimer = useMutation({ mutationFn: (id) => req("DELETE", `/templates/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["emailing-templates"] }) });
  const campagne = useMutation({ mutationFn: (template) => req("POST", "/campagnes", { template }), onSuccess: (c) => onCampagne?.(c.id) });
  if (ouvert) return <EditeurTemplate t={ouvert.t} plateforme={ouvert.plateforme} onFermer={() => setOuvert(null)} />;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const utiliser = (t) => <button type="button" onClick={() => campagne.mutate(t.id)} className={`${boutonPlein} h-8 text-[12.5px]`}>Utiliser</button>;
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 max-md:px-4 max-md:py-6">
      <p className="m-0 mb-3 text-[15px] text-encre">Template Klocka</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.base || []).map((t) => <Vignette key={t.id} t={t} onOuvrir={() => campagne.mutate(t.id)} actions={utiliser(t)} />)}
      </div>
      <p className="m-0 mb-3 mt-10 text-[15px] text-encre">Vos templates</p>
      {(data?.enregistres || []).length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.enregistres.map((t) => (
            <Vignette key={t.id} t={t} onOuvrir={() => setOuvert({ t, plateforme: false })}
              actions={<>{utiliser(t)}<button type="button" onClick={() => { if (window.confirm(`Supprimer le template « ${t.nom} » ?`)) supprimer.mutate(t.id); }} aria-label="Supprimer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-alerte"><Trash2 className="h-3.5 w-3.5" /></button></>} />
          ))}
        </div>
      ) : <p className="m-0 text-[13.5px] text-brume">Aucun encore : dans l'éditeur d'une campagne, « Enregistrer comme template ».</p>}
      <div className="mt-12 rounded-[18px] border border-trait bg-rail p-5 max-md:p-4">
        <p className="m-0 text-[15px] text-encre">Emails de la plateforme</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">Les emails que Klocka envoie de lui-même, pas du marketing : pas de lien de désinscription, mais une adresse en bounce n'est jamais servie. Ils partent par Resend, et par Gmail si Resend refuse.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.plateforme || []).map((t) => <Vignette key={t.cle} t={{ ...t, id: t.cle }} onOuvrir={() => setOuvert({ t, plateforme: true })} actions={<button type="button" onClick={() => setOuvert({ t, plateforme: true })} className={`${bouton} h-8 text-[12.5px]`}>Modifier</button>} />)}
        </div>
      </div>
    </div>
  );
}
