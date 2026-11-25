import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useLocation, useNavigate } from "react-router-dom";
import { ChartColumn, CircleUser, Lightbulb, LogOut, Mail, MapPin, Settings, ShieldCheck, TrendingUp } from "lucide-react";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { VERRE } from "@/lib/verre";
import { createPageUrl } from "@/utils";
import { GROUPE_PARAMETRES, masquesDe } from "@/lib/menu";

// La photo de profil en haut à droite (25 nov. 2026, Jules : « une photo de profil en haut à droite, la personne passe
// la souris dessus et a les menus accessibles comme dans les Paramètres »). Au survol (ou d'un clic, au doigt), un menu
// mène droit à chaque section des Paramètres (src/pages/Personnalisation.jsx, ouverte par l'adresse : #profil, #mails,
// #apparence…) ; depuis le même jour, une rangée des seules entrées du Compte, et « Voir plus » vers les Paramètres. Les
// sections suivent celles de la page, telles que la session des Paramètres les a posées le même jour.

const ICONES = { profil: CircleUser, mails: Mail, agent: MapPin, habilitations: ShieldCheck, suivi: ChartColumn, statistiques: TrendingUp, feedback: Lightbulb };

const initiales = (nom) => String(nom || "").trim().split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join("") || "?";

export function Avatar({ user, taille = 36 }) {
  const nom = user?.full_name || user?.email || "";
  return user?.picture
    ? <img src={user.picture} alt="" className="flex-none rounded-full object-cover" style={{ width: taille, height: taille }} draggable={false} />
    : <span className="grid flex-none place-items-center rounded-full bg-rail-actif text-[12.5px] font-medium text-encre" style={{ width: taille, height: taille }}>{initiales(nom)}</span>;
}

/** Les entrées du menu, selon qui regarde : [titre de groupe, [[clé, libellé, page, section]]]. */
export function entreesDuMenu({ user, vue }) {
  const admin = user?.role === "admin";
  const mandataire = vue === "mandataire";
  const equipe = admin && vue === "admin";
  const fermees = user?.pages_fermees || [];
  const compte = [
    ["profil", "Profil", "Personnalisation", "profil"],
    mandataire && ["agent", "Mes villes", "Personnalisation", "agent"],
    equipe && ["mails", "Mails", "Personnalisation", "mails"],
    ["apparence", "Apparence", "Personnalisation", "apparence"],
    mandataire && ["habilitations", "Habilitations", "Personnalisation", "habilitations"],
    // Statistiques, sortie de la barre de gauche, et le Feedback (25 nov. 2026, Jules : « mets feedback dans la carte compte »).
    equipe && !fermees.includes("Statistiques") && ["statistiques", "Statistiques", "Statistiques", null],
    equipe && !fermees.includes("Monitoring") && ["suivi", "Suivi", "Monitoring", null],
    // Toujours là : le champ s'ouvre dans la carte et envoie la remarque, sans passer par la page des remarques.
    ["feedback", "Feedback", equipe ? "AdminSuggestions" : "Feedback", null],
  ].filter(Boolean);
  const gestion = equipe && user?.gere_les_acces ? [
    ["acces", "Accès de l'équipe", "Personnalisation", "acces"],
    ["competences", "Compétences", "Personnalisation", "competences"],
    ["import", "Import des fiches", "Personnalisation", "import"],
    ["sources", "Sources", "Personnalisation", "sources"],
    ...GROUPE_PARAMETRES.entrees.filter((e) => !["Personnalisation", "Monitoring"].includes(e.cle) && !masquesDe(user?.email).includes(e.cle) && !fermees.includes(e.cle)).map((e) => [e.cle, e.label, e.cle, null]),
  ] : [];
  return [["Compte", compte], ["Gestion", gestion]].filter(([, l]) => l.length);
}

/**
 * Le Feedback dans la carte (25 nov. 2026, Jules : « le feedback dans la carte compte ; on passe dessus et ça ouvre juste
 * dessous un champ de texte qu'on remplit ») : la même entité que la page Feedback (Suggestion), rien d'automatique ;
 * Jules lit et change l'état à la main.
 */
function ChampFeedback({ user, texte, setTexte, onEnvoye }) {
  const qc = useQueryClient();
  const envoyer = useMutation({
    mutationFn: () => base44.entities.Suggestion.create({
      contenu: texte.trim(), statut: "nouveau",
      page: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
      client_email: user?.email || null, client_name: user?.full_name || user?.email || null,
    }),
    onSuccess: () => { setTexte(""); qc.invalidateQueries({ queryKey: ["all-suggestions"] }); toast.success("Remarque envoyée"); onEnvoye?.(); },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });
  const pret = texte.trim().length > 0 && !envoyer.isPending;
  return (
    <div className="px-2.5 pb-2 pt-1 duration-150 animate-in fade-in slide-in-from-top-1">
      <div className="rounded-[12px] border border-trait px-3 pb-1.5 pt-2 transition-colors focus-within:border-bord-vif">
        <textarea autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} placeholder="Une remarque, un bug, une idée…" aria-label="Votre remarque"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (pret) envoyer.mutate(); } }}
          className="block w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.45] text-encre outline-none placeholder:text-brume" style={{ background: "transparent" }} />
        <div className="flex justify-end">
          <button type="button" onClick={() => envoyer.mutate()} disabled={!pret} aria-label="Envoyer la remarque" title="Envoyer"
            className="grid h-7 w-7 place-items-center rounded-full text-encre transition-colors hover:text-menthe disabled:opacity-30" style={{ background: "transparent" }}>
            {envoyer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * `vue` : la vue que montre l'appli (admin, client, mandataire) ; elle choisit les entrées du Compte.
 */
export default function MenuProfil({ user, vue = "admin", onDeconnexion = null }) {
  const { prefs, changer } = usePersonnalisation();
  const [ouvert, setOuvert] = useState(false);
  const [feedback, setFeedback] = useState(false);
  // Le brouillon reste si la carte se ferme (un clic ailleurs) : on le retrouve en revenant sur Feedback.
  const [brouillon, setBrouillon] = useState("");
  useEffect(() => { if (!ouvert) setFeedback(false); }, [ouvert]);
  // Le champ suit la souris (25 nov. 2026, Jules : « on passe la souris ça ouvre le feedback, on bouge la souris autre
  // part ça ferme le champ de texte ») : il se replie dès qu'elle quitte l'entrée Feedback et son champ.
  const replier = useRef(null);
  const fermer = useRef(null);
  const boite = useRef(null);
  const navigate = useNavigate();
  const adresse = useLocation();
  useEffect(() => { setOuvert(false); }, [adresse.pathname, adresse.hash]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    window.addEventListener("keydown", echap);
    window.addEventListener("pointerdown", dehors);
    return () => { window.removeEventListener("keydown", echap); window.removeEventListener("pointerdown", dehors); };
  }, [ouvert]);
  if (!user) return null;
  // Le survol ouvre ; la souris qui sort referme après un court instant, le temps de descendre dans le menu.
  const entrer = () => { clearTimeout(fermer.current); setOuvert(true); };
  const sortir = () => { clearTimeout(fermer.current); fermer.current = setTimeout(() => setOuvert(false), 180); };
  const aller = (page, section) => {
    setOuvert(false);
    navigate(`${createPageUrl(page)}${section ? `#${section}` : ""}`);
    // Déjà sur la page : l'onglet suit l'adresse par « hashchange », que la navigation du routeur ne déclenche pas.
    if (section) setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 0);
  };
  const groupes = entreesDuMenu({ user, vue });
  const ligne = "flex h-9 w-full items-center gap-3 whitespace-nowrap rounded-[9px] px-2.5 text-left text-[14px] text-craie transition-colors hover:bg-relief hover:text-encre focus-visible:bg-relief focus-visible:text-encre focus-visible:outline-none";
  return (
    <div ref={boite} className="relative" onMouseEnter={entrer} onMouseLeave={sortir}>
      {/* Un anneau toujours là, séparé de la photo par un fin espace (25 nov. 2026, Jules, sur une image : « un rond comme
          ça tout le temps, la photo un peu plus grande ») ; il s'éclaire au survol. */}
      <button type="button" onClick={() => setOuvert((o) => !o)} onFocus={entrer} aria-haspopup="menu" aria-expanded={ouvert} aria-label="Mon compte et les paramètres"
        className={`grid place-items-center rounded-full border-[1.5px] p-[3px] transition-colors ${ouvert ? "border-encre/70" : "border-bord-vif hover:border-encre/60"}`} style={{ background: "transparent" }}>
        <Avatar user={user} taille={40} />
      </button>
      {/* La carte sur le modèle de Jules (25 nov. 2026, une capture : « une carte un peu comme ça, ce ne sont pas les bons
          menus ») : la photo, le nom en gras et l'espace ; les entrées du Compte, une par ligne avec son icône ; l'apparence
          et le halo réglés sur place ; « Paramètres » pour le reste ; « Se déconnecter » en rouge, en bas. Sur du verre. */}
      {ouvert && (() => {
        const compte = (groupes.find(([titre]) => titre === "Compte")?.[1] || []).filter(([k]) => k !== "apparence");
        return (
          <div role="menu" className={`${VERRE} absolute right-0 top-[calc(100%+8px)] z-50 k-verre-menu w-[320px] max-w-[calc(100vw-32px)] p-2`}>
            <div className="flex items-center gap-3 px-2 pb-3 pt-1.5">
              <Avatar user={user} taille={40} />
              <div className="min-w-0">
                <p className="m-0 truncate text-[15px] font-semibold text-encre">{user.full_name || user.email}</p>
                <p className="m-0 truncate text-[13px] text-ardoise">{vue === "mandataire" ? "K Partners · Mandataire" : "Klocka · Équipe"}</p>
              </div>
            </div>
            <div className="border-t border-trait py-1">
              {compte.map(([k, mot, page, section]) => {
                const Icone = ICONES[k] || CircleUser;
                // Feedback : le survol ouvre le champ juste dessous ; le clic aussi (au doigt), sans quitter la page.
                // La souris qui s'en va le replie, après un court instant pour ne pas clignoter sur un bord.
                if (k === "feedback") return (
                  <div key={k} onMouseEnter={() => { clearTimeout(replier.current); setFeedback(true); }}
                    onMouseLeave={() => { clearTimeout(replier.current); replier.current = setTimeout(() => setFeedback(false), 120); }}>
                    <button type="button" role="menuitem" onClick={() => setFeedback(true)} aria-expanded={feedback} className={`${ligne} ${feedback ? "!text-encre" : ""}`} style={{ background: "transparent" }}>
                      <Icone className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} />{mot}
                    </button>
                    {feedback && <ChampFeedback user={user} texte={brouillon} setTexte={setBrouillon} onEnvoye={() => setOuvert(false)} />}
                  </div>
                );
                return (
                  <button key={k} type="button" role="menuitem" onClick={() => aller(page, section)} className={ligne} style={{ background: "transparent" }}>
                    <Icone className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} />{k === "profil" ? "Mon profil" : mot}
                  </button>
                );
              })}
              <button type="button" role="menuitem" onClick={() => aller("Personnalisation", null)} className={ligne} style={{ background: "transparent" }}>
                <Settings className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} />Paramètres
              </button>
            </div>
            {/* L'apparence, réglée sur place : elle s'applique et s'enregistre comme dans les Paramètres. */}
            <div className="flex items-center justify-between gap-3 border-t border-trait px-2.5 py-2.5">
              <span className="text-[14px] text-craie">Apparence</span>
              <div className="flex rounded-[10px] border border-trait p-0.5">
                {[["sombre", "Sombre"], ["clair", "Clair"], ["appareil", "Auto"]].map(([v, mot]) => (
                  <button key={v} type="button" onClick={() => changer({ mode: v })} aria-pressed={prefs.mode === v}
                    className={`h-7 rounded-[8px] px-2.5 text-[13px] transition-colors ${prefs.mode === v ? "bg-relief text-encre" : "text-ardoise hover:text-encre"}`} style={prefs.mode === v ? undefined : { background: "transparent" }}>{mot}</button>
                ))}
              </div>
            </div>
            {/* Le halo du fond, avec ou sans (25 nov. 2026, Jules), réglé sur place lui aussi. */}
            <div className="flex items-center justify-between gap-3 border-t border-trait px-2.5 py-2.5">
              <span className="text-[14px] text-craie">Halo</span>
              <button type="button" role="switch" aria-checked={!!prefs.halo} aria-label={prefs.halo ? "Retirer le halo" : "Mettre le halo"} onClick={() => changer({ halo: !prefs.halo })}
                className={`relative h-6 w-10 flex-none rounded-full transition-colors ${prefs.halo ? "bg-menthe" : "bg-relief"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-encre shadow transition-all ${prefs.halo ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            {onDeconnexion && (
              <div className="border-t border-trait pt-1">
                <button type="button" role="menuitem" onClick={onDeconnexion} className={`${ligne} !text-alerte`} style={{ background: "transparent" }}>
                  <LogOut className="h-4 w-4 flex-none" strokeWidth={1.7} />Se déconnecter
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
