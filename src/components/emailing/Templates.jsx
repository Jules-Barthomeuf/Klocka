import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, RotateCcw, Send, Trash2, X } from "lucide-react";
import { GABARITS, THEMES, rendreEmail } from "@/lib/email-design";
import { toast } from "@/components/ui/avis";
import EditeurEmail, { BoutonTester } from "./EditeurEmail";
import { req, useEnregistrement, useSansDefilement, bouton, boutonPlein, date } from "./commun";

// Les templates, de retour en onglet (9 oct. 2026) : alignés en vignettes, La
// Note et La Lettre en tête, chacun avec « Envoyer un test » (à soi par
// défaut, ou à l'adresse qu'on tape). Un clic sur un template de base l'ouvre
// en grand ; ceux qu'on a créés et les emails de la plateforme s'ouvrent dans
// l'éditeur.

const EXEMPLE = { prenom: "Marie", nom: "Durand", lien: "https://klocka.immo/Bienvenue", expediteur: "Jules" };

function Vignette({ t, onOuvrir, actions }) {
  const html = rendreEmail(t.design, EXEMPLE, { logo: "/icones/icone-192.png" }).html;
  return (
    // Pas d'overflow-hidden sur la carte : le champ d'adresse de « Envoyer un test » s'ouvre dessous.
    <div className="group rounded-[16px] border border-trait bg-rail">
      <button type="button" onClick={onOuvrir} className="block w-full overflow-hidden rounded-t-[16px]" style={{ background: "transparent" }}>
        <div className="pointer-events-none h-[220px] overflow-hidden bg-white">
          <iframe title={t.nom} srcDoc={html} className="h-[640px] w-[200%] origin-top-left scale-50 border-0" tabIndex={-1} />
        </div>
      </button>
      <div className="flex items-center gap-2 border-t border-trait px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-encre">{t.nom}</span>
          <span className="block text-[12px] text-ardoise">{GABARITS[t.design?.gabarit]?.nom || "Carte"} · {THEMES[t.design?.theme]?.nom || "Clair"}{t.cree_le ? ` · ${date(t.cree_le)}` : ""}</span>
        </span>
        {actions}
      </div>
    </div>
  );
}

/** Un template de base en grand, au milieu de l'écran flouté. Échap ou un clic dehors referment. */
function ApercuTemplate({ t, onFermer }) {
  useSansDefilement(true);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const html = rendreEmail(t.design, EXEMPLE, { logo: "/icones/icone-192.png", desinscription: "#", apercu: t.apercu }).html;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-fond/55 p-6 backdrop-blur-md duration-200 animate-in fade-in-0 max-md:p-0" onMouseDown={onFermer}>
      <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t.nom}
        className="flex max-h-full w-full max-w-[760px] flex-col overflow-hidden rounded-[18px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:h-full max-md:rounded-none">
        <div className="flex items-center gap-3 border-b border-trait px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] text-encre">{t.nom}</div>
            {t.objet && <div className="truncate text-[12.5px] text-ardoise">{t.objet}</div>}
          </div>
          <BoutonTester email={t} libelle="Envoyer un test" />
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-rail p-5 max-md:p-3">
          <iframe title={t.nom} srcDoc={html} className="h-[72vh] w-full rounded-[12px] border border-trait bg-white max-md:h-full" />
        </div>
      </div>
    </div>,
    document.body,
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
      {/* md:pr-16 : la marge du bouton Rappel, fixé dans le coin. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-trait px-6 py-3 max-md:px-4 md:pr-16">
        <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre"><ArrowLeft className="h-3.5 w-3.5" />Templates</button>
        {plateforme ? <span className="text-[18px] text-encre">{t.nom}</span> : <input value={v.nom || ""} onChange={(e) => { const n = { ...v, nom: e.target.value }; setV(n); enregistrer(n); }} className="min-w-[200px] flex-1 bg-transparent text-[18px] text-encre outline-none max-md:min-w-0" />}
        <span className="text-[12px] text-brume">{sauve === "en_cours" ? "Enregistrement…" : sauve === "erreur" ? "Non enregistré" : "Enregistré"}</span>
        {plateforme && <span className="text-[12.5px] text-ardoise">{t.description}</span>}
        <span className="ml-auto" />
        {!plateforme && <BoutonTester email={v} libelle="Envoyer un test" />}
        {!plateforme && <button type="button" onClick={() => { enregistrer(v); toast.success("Template enregistré"); onFermer(); }} className={boutonPlein}>Enregistrer</button>}
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

export default function Templates({ demande = null, onDetail = null }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["emailing-templates"], queryFn: () => req("GET", "/templates") });
  const [ouvert, setOuvert] = useState(null);
  const [apercu, setApercu] = useState(null);
  // « Nouveau template » : une copie du template Klocka, ouverte dans l'éditeur.
  const nouveau = useMutation({
    mutationFn: () => { const base = data?.base?.[0]; return req("POST", "/templates", { nom: "Nouveau template", objet: base?.objet || "", apercu: base?.apercu || "", design: base?.design || { theme: "clair", blocs: [] } }); },
    onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: ["emailing-templates"] }); const t = r?.template || r; if (t?.id) setOuvert({ t, plateforme: false }); },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });
  useEffect(() => { if (demande?.quoi === "nouveau" && data) nouveau.mutate(); }, [demande?.n]);
  useEffect(() => { onDetail?.(!!ouvert); }, [ouvert]);
  const supprimer = useMutation({ mutationFn: (id) => req("DELETE", `/templates/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["emailing-templates"] }) });
  const testPlateforme = useMutation({ mutationFn: (cle) => req("POST", `/modeles/${cle}/test`), onSuccess: (r) => toast.success(`Test envoyé à ${r.a}`), onError: (e) => toast.error(e?.message || "Test impossible") });
  if (ouvert) return <EditeurTemplate t={ouvert.t} plateforme={ouvert.plateforme} onFermer={() => setOuvert(null)} />;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const tester = (t) => <BoutonTester email={t} libelle="Envoyer un test" plein />;
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 max-md:px-4 max-md:py-6">
      {apercu && <ApercuTemplate t={apercu} onFermer={() => setApercu(null)} />}
      <p className="m-0 mb-3 text-[15px] text-encre">Templates Klocka</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.base || []).map((t) => <Vignette key={t.id} t={t} onOuvrir={() => setApercu(t)} actions={tester(t)} />)}
      </div>
      <p className="m-0 mb-3 mt-10 text-[15px] text-encre">Vos templates</p>
      {(data?.enregistres || []).length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.enregistres.map((t) => (
            <Vignette key={t.id} t={t} onOuvrir={() => setOuvert({ t, plateforme: false })}
              actions={<>{tester(t)}<button type="button" onClick={() => { if (window.confirm(`Supprimer le template « ${t.nom} » ?`)) supprimer.mutate(t.id); }} aria-label="Supprimer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-alerte"><Trash2 className="h-3.5 w-3.5" /></button></>} />
          ))}
        </div>
      ) : <p className="m-0 text-[13.5px] text-brume">Aucun encore : « Nouveau template », en haut à droite.</p>}
      <div className="mt-12 rounded-[18px] border border-trait bg-rail p-5 max-md:p-4">
        <p className="m-0 text-[15px] text-encre">Emails de la plateforme</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">Les emails que Klocka envoie de lui-même, pas du marketing : pas de lien de désinscription, mais une adresse en bounce n'est jamais servie. Ils partent par Resend, et par Gmail si Resend refuse.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.plateforme || []).map((t) => <Vignette key={t.cle} t={{ ...t, id: t.cle }} onOuvrir={() => setOuvert({ t, plateforme: true })} actions={<button type="button" onClick={() => testPlateforme.mutate(t.cle)} disabled={testPlateforme.isPending && testPlateforme.variables === t.cle} className={`${bouton} h-8 text-[12.5px]`}>{testPlateforme.isPending && testPlateforme.variables === t.cle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Envoyer un test</button>} />)}
        </div>
      </div>
    </div>
  );
}
