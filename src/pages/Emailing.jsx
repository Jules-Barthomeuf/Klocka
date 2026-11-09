import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Moon, Plus, Search, Sun } from "lucide-react";
import { req } from "@/components/emailing/commun";
import Newsletters from "@/components/emailing/Newsletters";
import Campagnes from "@/components/emailing/Campagnes";
import Assets from "@/components/emailing/Assets";
import Templates from "@/components/emailing/Templates";
import Contacts from "@/components/emailing/Contacts";
import Statistiques from "@/components/emailing/Statistiques";
import Automatisations from "@/components/emailing/module/Automatisations";
import { AValider, ContactsScores, Expediteurs, Formulaires, ImporterVue, Oppositions, Reponses, Resultats, Scores, TableauDeBord, Webinaires } from "@/components/emailing/module/Pages";
import { boutonCrm, outilCrm } from "@/components/emailing/module/briques";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, definirCadreCrm, themeEffectif } from "@/lib/personnalisation";

// Le module Emailing (8 nov. 2026, Jules : « tout un module, relié au CRM, j'aime bien le design de notre CRM »). Le même
// cadre que /CRM : la bande du haut, le panneau de 236 px, les tableaux à filets. Tout envoi passe par le garde-fou :
// hors Render, rien ne part chez un vrai contact. Newsletters, campagnes, modèles, assets et listes sont les écrans
// d'avant, repris tels quels dans ce cadre.

const GROUPES = [
  ["Piloter", [["bord", "Tableau de bord"], ["valider", "À valider"]]],
  ["Envoyer", [["campagnes", "Campagnes"], ["newsletters", "Newsletters"], ["automatisations", "Automatisations"], ["prospection", "Prospection agents"], ["webinaires", "Webinaires"]]],
  ["Audience", [["contacts", "Contacts"], ["listes", "Listes et segments"], ["formulaires", "Formulaires et lead magnets"], ["scores", "Scores MQL et SQL"]]],
  ["Contenu", [["modeles", "Modèles"], ["assets", "Assets"]]],
  ["Retour", [["reponses", "Réponses"], ["statistiques", "Statistiques"]]],
  ["Réglages", [["expediteurs", "Expéditeurs et domaines"], ["oppositions", "Oppositions"]]],
];
const PAGES = GROUPES.flatMap(([, p]) => p.map(([v]) => v));

// L'action de l'en-tête des écrans repris : [libellé, demande, principal].
const ACTIONS = {
  campagnes: [["Nouvelle campagne", "nouvelle", true]],
  newsletters: [["Nouvelle newsletter", "nouvelle", true]],
  modeles: [["Nouveau modèle", "nouveau", true]],
  assets: [["Nouvel asset", "nouveau", true]],
  listes: [["Importer", "importer", false], ["Ajouter un contact", "ajouter", true]],
};
const TITRES = Object.fromEntries(GROUPES.flatMap(([, p]) => p));

export default function Emailing() {
  const [params, setParams] = useSearchParams();
  const page = PAGES.includes(params.get("p")) ? params.get("p") : "bord";
  const [demande, setDemande] = useState(null);
  const [detail, setDetail] = useState(false);
  const [vueCrm, setVueCrm] = useState(false);
  const [recherche, setRecherche] = useState("");
  const { prefs, changer: changerPrefs } = usePersonnalisation();
  const clair = themeEffectif(prefs) === CLAIR;
  const { data: etat } = useQuery({ queryKey: ["emailing-etat"], queryFn: () => req("GET", "/etat") });
  const { data: compteurs } = useQuery({ queryKey: ["em-compteurs"], queryFn: () => req("GET", "/m/tableau"), refetchInterval: 60000 });
  useEffect(() => {
    document.documentElement.classList.add("k-cadre-crm");
    definirCadreCrm(true);
    return () => { document.documentElement.classList.remove("k-cadre-crm"); definirCadreCrm(false); };
  }, []);
  const aller = (v, plus = {}) => { setDemande(null); setDetail(false); setParams({ p: v, ...plus }); };
  const commun = { demande, onDetail: setDetail };
  const repris = !!ACTIONS[page] || ["statistiques", "listes"].includes(page);
  const nombre = { valider: compteurs?.a_valider, reponses: compteurs?.reponses_a_traiter };
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col bg-rail max-md:h-auto">
      {createPortal(<span className="pointer-events-none fixed left-[15px] top-0 z-[45] flex h-12 items-center max-md:hidden"><span className="logo-kp logo-kp-theme text-[24px] tracking-[-0.03em]" role="img" aria-label="Emailing">mail<span className="logo-kp-trait" style={{ width: "0.4em", marginLeft: "0.17em" }} aria-hidden="true" /></span></span>, document.body)}
      <header className="relative flex h-12 flex-none items-center gap-4 px-4">
        <form onSubmit={(e) => { e.preventDefault(); aller("contacts", recherche ? { q: recherche } : {}); }} className="mx-auto flex h-8 w-full max-w-[480px] items-center gap-2.5 rounded-full bg-relief px-4 focus-within:ring-1 focus-within:ring-bord-doux max-md:hidden">
          <Search className="h-4 w-4 flex-none text-ardoise" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un contact…" aria-label="Rechercher un contact" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
        </form>
        <button type="button" onClick={() => changerPrefs({ mode: clair ? "sombre" : "clair" })} aria-label={clair ? "Passer en mode sombre" : "Passer en mode clair"} className="absolute right-4 grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:hidden" style={{ background: "transparent" }}>
          {clair ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </header>
      <div className="k-crm-contenu flex min-h-0 flex-1 overflow-hidden rounded-tl-[16px] bg-fond max-md:flex-col max-md:rounded-none">
        <nav aria-label="Pages de l'emailing" className="flex w-[236px] flex-none flex-col overflow-y-auto border-r border-trait px-3 pb-6 pt-3 max-md:w-auto max-md:flex-row max-md:gap-1.5 max-md:overflow-x-auto max-md:border-b max-md:border-r-0 max-md:pb-3">
          {GROUPES.map(([g, liste]) => (
            <React.Fragment key={g}>
              <p className="m-0 px-2.5 pb-1 pt-3 text-[12px] uppercase tracking-[.04em] text-brume max-md:hidden">{g}</p>
              {liste.map(([v, mot]) => (
                <button key={v} type="button" onClick={() => aller(v)} aria-current={page === v ? "page" : undefined} className={`flex h-9 w-full items-center justify-between gap-2 rounded-[8px] px-2.5 text-left text-[14px] transition-colors max-md:w-auto max-md:flex-none max-md:whitespace-nowrap ${page === v ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`} style={page === v ? undefined : { background: "transparent" }}>
                  <span className="truncate">{mot}</span>{nombre[v] > 0 && <span className="flex-none text-[12px] text-ardoise">{nombre[v]}</span>}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {etat && !etat.reel && <p className="m-0 border-b border-trait px-10 py-1.5 text-[12.5px] text-ambre max-md:px-4">Serveur local : les envois vont à {etat.test_to || "l'admin qui agit"}, jamais à un vrai contact.</p>}
          {repris && !detail && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-10 pb-1 pt-6 max-md:px-4 max-md:pt-4">
              <h1 className="m-0 text-[20px] font-medium text-encre">{TITRES[page]}</h1>
              <div className="flex gap-2">
                {page === "listes" && <button type="button" className={outilCrm} onClick={() => setVueCrm(true)}>Depuis une vue du CRM</button>}
                {(ACTIONS[page] || []).map(([mot, quoi, principal]) => <button key={quoi} type="button" className={principal ? boutonCrm : outilCrm} onClick={() => setDemande({ quoi, n: Date.now() })}>{principal && <Plus className="h-4 w-4" />}{mot}</button>)}
              </div>
            </div>
          )}
          {page === "bord" && <TableauDeBord aller={aller} />}
          {page === "valider" && <AValider />}
          {page === "campagnes" && <Campagnes {...commun} />}
          {page === "newsletters" && <Newsletters {...commun} />}
          {page === "automatisations" && <Automatisations key="d" nature="diffusion" onDetail={setDetail} />}
          {page === "prospection" && <Automatisations key="p" nature="prospection" onDetail={setDetail} />}
          {page === "webinaires" && <Webinaires />}
          {page === "contacts" && <ContactsScores />}
          {page === "listes" && <Contacts {...commun} />}
          {page === "formulaires" && <Formulaires />}
          {page === "scores" && <Scores />}
          {page === "modeles" && <Templates {...commun} />}
          {page === "assets" && <Assets {...commun} />}
          {page === "reponses" && <Reponses />}
          {page === "statistiques" && <><Resultats /><Statistiques /></>}
          {page === "expediteurs" && <Expediteurs />}
          {page === "oppositions" && <Oppositions />}
        </main>
      </div>
      {vueCrm && <ImporterVue onFermer={() => setVueCrm(false)} />}
    </div>
  );
}
