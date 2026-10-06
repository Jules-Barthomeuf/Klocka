import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { req, boutonContour, boutonPrincipal } from "@/components/emailing/commun";
import Campagnes from "@/components/emailing/Campagnes";
import Sequences from "@/components/emailing/Sequences";
import Contacts from "@/components/emailing/Contacts";
import Templates from "@/components/emailing/Templates";
import Statistiques from "@/components/emailing/Statistiques";

// La page Emailing, dessinée sur la maquette de Jules (6 oct. 2026) : le
// titre, l'expéditeur, l'action de l'onglet à droite, puis cinq onglets
// soulignés. Campagnes pour un envoi ponctuel, Séquences pour des emails
// espacés et automatiques, Contacts, Templates, Statistiques. Tout envoi
// passe par Resend, sous le garde-fou : hors Render, rien ne part chez un
// vrai contact. Une campagne ou un email ouvert prend toute la page.

const ONGLETS = [["campagnes", "Campagnes"], ["sequences", "Séquences"], ["contacts", "Contacts"], ["templates", "Templates"], ["statistiques", "Statistiques"]];
// L'action de l'en-tête, par onglet : [libellé, demande] ; Contacts en a deux.
const ACTIONS = {
  campagnes: [["Nouvelle campagne", "nouvelle", true]],
  sequences: [["Nouvelle séquence", "nouvelle", true]],
  contacts: [["Importer", "importer", false], ["Ajouter un contact", "ajouter", true]],
  templates: [["Nouveau template", "nouveau", true]],
};

export default function Emailing() {
  const [onglet, setOnglet] = useState(() => {
    try { return localStorage.getItem("k-emailing-onglet") || "campagnes"; } catch { return "campagnes"; }
  });
  const [campagneAOuvrir, setCampagneAOuvrir] = useState(null);
  // Le bouton de l'en-tête parle à l'onglet ouvert : une demande numérotée.
  const [demande, setDemande] = useState(null);
  const [detail, setDetail] = useState(false);
  const { data: etat } = useQuery({ queryKey: ["emailing-etat"], queryFn: () => req("GET", "/etat") });
  const choisir = (v) => {
    setOnglet(v);
    setCampagneAOuvrir(null);
    setDemande(null);
    setDetail(false);
    try { localStorage.setItem("k-emailing-onglet", v); } catch { /* l'onglet ne sera pas gardé */ }
  };
  const demander = (quoi) => setDemande({ quoi, n: Date.now() });
  const commun = { demande, onDetail: setDetail };
  return (
    <div className="min-h-screen text-encre">
      {!detail && (
        <div className="border-b border-trait px-10 pt-9 max-md:px-4 max-md:pt-6">
          <div className="flex flex-wrap items-end justify-between gap-6 max-md:gap-4">
            <div className="min-w-0">
              <h1 className="m-0 text-[28px] font-medium tracking-[-0.01em] max-md:text-[24px]">Emailing</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ardoise">
                {etat && !etat.resend ? <span className="text-alerte">Resend n'est pas configuré sur ce serveur</span> : (
                  <>
                    <span>Envoyé par</span><span className="text-craie">L'équipe Klocka</span><span className="break-all">equipe@notifications-klocka.com</span>
                    <span className="rounded-full border border-bord-doux px-2 py-px text-[11.5px]">via Resend</span>
                    {etat && !etat.reel && <span className="text-ambre">local : les envois vont à {etat.test_to || "l'admin qui agit"}</span>}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {(ACTIONS[onglet] || []).map(([mot, quoi, principal]) => (
                <button key={quoi} type="button" onClick={() => demander(quoi)} className={principal ? boutonPrincipal : boutonContour}>
                  {principal && <Plus className="h-3.5 w-3.5" />}{mot}
                </button>
              ))}
            </div>
          </div>
          {/* Les onglets en pilule, comme ceux de la page projet. */}
          <nav className="mt-[22px] mb-[22px] inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ONGLETS.map(([v, mot]) => (
              <button key={v} type="button" onClick={() => choisir(v)} aria-current={onglet === v ? "page" : undefined}
                className={`h-9 flex-none rounded-full border-0 px-4 text-[14px] transition-colors ${onglet === v ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}
                style={onglet === v ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </nav>
        </div>
      )}
      {onglet === "campagnes" && <Campagnes ouvrir={campagneAOuvrir} {...commun} />}
      {onglet === "sequences" && <Sequences {...commun} />}
      {onglet === "contacts" && <Contacts {...commun} />}
      {onglet === "templates" && <Templates onCampagne={(id) => { setOnglet("campagnes"); setCampagneAOuvrir(id); }} {...commun} />}
      {onglet === "statistiques" && <Statistiques />}
    </div>
  );
}
