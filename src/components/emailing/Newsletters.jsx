import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";
import { toast } from "@/components/ui/avis";
import Calendrier from "@/components/ui/calendrier";
import EditeurEmail from "./EditeurEmail";
import { Interrupteur, Pastille, Pastilles, req, useEnregistrement, useReferentiel, useSansDefilement, boutonLigne, champ, pluriel, pourcent } from "./commun";

// Les newsletters (9 oct. 2026, plan de Jules) : à gauche les newsletters en
// cartes, à droite celle qu'on regarde. Ses réglages (listes, départ, rythme,
// heure), son entonnoir jusqu'au call, puis ses mails en cartes datées, comme
// une séquence : la date à droite du trait, la carte dessous avec son statut
// (Brouillon, Prêt, Envoyé). « Modifier » ouvre l'éditeur en pleine page. Seul
// un mail Prêt part, à sa date ; trois jours avant, un mail pas prêt donne une
// alerte. Tout s'enregistre au fil de la saisie.

const RYTHMES = [7, 14, 21, 28, 30];
const jourLong = (j) => (j ? new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase()) : "");
const heureLisible = (h) => String(h || "08:30").replace(/^0/, "").replace(":", " h ");
const STATUTS_MAIL = { brouillon: ["Brouillon", "border border-bord-doux text-ardoise"], pret: ["Prêt", "bg-menthe-pale text-sur-menthe-pale"], envoye: ["Envoyé", "bg-relief text-craie"] };

function StatutMail({ statut }) {
  const [mot, style] = STATUTS_MAIL[statut] || [statut, "bg-relief text-craie"];
  return <span className={`inline-flex flex-none items-center rounded-full px-2 py-[2px] text-[11.5px] ${style}`}>{mot}</span>;
}

/** Une date au calendrier, dans une petite fenêtre sous le bouton. */
function ChoixDate({ valeur, onChoisir, children, label }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-label={label} title={label} className="inline-flex items-center gap-1.5 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>{children}</button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-[85]" onClick={() => setOuvert(false)} />
          <div className="absolute left-0 top-full z-[90] mt-2 rounded-[14px] border border-bord-vif bg-surface-pleine p-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
            <Calendrier valeur={valeur || ""} min="2020-01-01" onChoisir={(d) => { onChoisir(d); setOuvert(false); }} label={label} />
          </div>
        </>
      )}
    </span>
  );
}

/** Le choix d'un template au moment d'ajouter un mail. */
function ChoixTemplate({ onChoisir, enCours }) {
  const [ouvert, setOuvert] = useState(false);
  const { data } = useQuery({ queryKey: ["emailing-templates"], queryFn: () => req("GET", "/templates"), enabled: ouvert });
  const tous = [...(data?.base || []), ...(data?.enregistres || [])];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert((x) => !x)} disabled={enCours}
        className="flex w-full items-center gap-[7px] rounded-[12px] border border-dashed border-bord-doux px-4 py-3 text-[13px] text-craie hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
        {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Ajouter un mail
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOuvert(false)} />
          <div className="absolute left-0 right-0 top-full z-[70] mt-2 flex flex-col rounded-[12px] border border-bord-doux bg-surface-pleine p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
            <span className="px-2.5 pb-1 pt-1.5 text-[11.5px] text-ardoise">À partir de</span>
            <button type="button" onClick={() => { setOuvert(false); onChoisir(null); }} className="rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-encre hover:bg-relief" style={{ background: "transparent" }}>Le mail précédent</button>
            {tous.map((t) => <button key={t.id} type="button" onClick={() => { setOuvert(false); onChoisir(t.id); }} className="rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>{t.nom}</button>)}
            {!data && <span className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-ardoise" /></span>}
          </div>
        </>
      )}
    </div>
  );
}

/** L'entonnoir de la newsletter, en bandeau : jusqu'au call, l'indicateur principal. */
function Entonnoir({ e, inscrits }) {
  const etapes = [["Inscrits", inscrits], ["Envoyés", e?.envoyes], ["Délivrés", e?.delivres], ["Ouverts", e?.ouverts], ["Cliqués", e?.cliques], ["Simulateur", e?.simulateur], ["Calls", e?.calls]];
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-[14px] border border-trait bg-rail max-md:grid-cols-4">
      {etapes.map(([mot, v], k) => (
        <div key={mot} className={`flex flex-col gap-0.5 px-3 py-3 ${k ? "border-l border-trait max-md:[&:nth-child(5)]:border-l-0" : ""} max-md:[&:nth-child(n+5)]:border-t`}>
          <span className={`text-[18px] tabular-nums ${mot === "Calls" ? "text-menthe" : "text-encre"}`}>{v ?? 0}</span>
          <span className="text-[11.5px] text-ardoise">{mot}</span>
        </div>
      ))}
    </div>
  );
}

/** Un mail ouvert dans l'éditeur, en pleine page. */
function MailOuvert({ n, mail, index, onChange, onFermer, avecAK = true }) {
  const test = useMutation({ mutationFn: () => req("POST", `/newsletters/${n.id}/mails/${mail.id}/test`), onSuccess: (r) => toast.success(`Test envoyé à ${r.a}`), onError: (e) => toast.error(e?.message || "Test impossible") });
  return (
    <div className="flex h-full min-h-[560px] flex-col max-md:h-auto max-md:min-h-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-trait px-6 py-3.5 max-md:gap-2 max-md:px-4">
        <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre max-md:h-9" style={{ background: "transparent" }}><ArrowLeft className="h-3.5 w-3.5" />La newsletter</button>
        <span className="text-[15px] text-encre">Mail {index + 1}</span>
        <span className="text-[12.5px] text-ardoise">{jourLong(mail.jour)} · {heureLisible(n.heure)}</span>
        <span className="ml-auto" />
        <span className="text-[12px] text-ardoise">{"{{lien_simulateur}}"} : le lien personnel du simulateur</span>
        <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className={boutonLigne}>{test.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}M'envoyer un test</button>
      </div>
      <div className="min-h-0 flex-1 max-md:flex-none">
        <EditeurEmail email={mail} avecAK={avecAK} onChange={onChange} />
      </div>
    </div>
  );
}

function VueNewsletter({ id, onMail, onSupprimee, onAtelier = null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["emailing-newsletter", id], queryFn: () => req("GET", `/newsletters/${id}`) });
  const { data: stats } = useQuery({ queryKey: ["emailing-newsletter-stats", id], queryFn: () => req("GET", `/newsletters/${id}/stats`), refetchInterval: 60_000 });
  const { data: ref } = useReferentiel();
  const [n, setN] = useState(null);
  const [sauve, setSauve] = useState("ok");
  useEffect(() => { if (data && (!n || n.id !== data.id)) setN(data); }, [data]);
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["emailing-newsletters"] }); queryClient.invalidateQueries({ queryKey: ["emailing-newsletter", id] }); };
  const enregistrer = useEnregistrement(async (v) => {
    setSauve("en_cours");
    try {
      const r = await req("PATCH", `/newsletters/${id}`, { nom: v.nom, listes: v.listes, depart: v.depart, rythme_jours: v.rythme_jours, heure: v.heure, expediteur_nom: v.expediteur_nom, repondre_a: v.repondre_a, mails: v.mails.map((m) => ({ id: m.id, objet: m.objet, apercu: m.apercu, design: m.design, date: m.date || null })) });
      // Les dates se recalculent côté serveur : on reprend ses mails, en gardant ce qu'on tape.
      setN((x) => (x ? { ...x, inscrits: r.newsletter.inscrits, mails: x.mails.map((m) => { const s0 = r.newsletter.mails.find((y) => y.id === m.id); return s0 ? { ...m, jour: s0.jour, date_calculee: s0.date_calculee, instant: s0.instant, en_retard: s0.en_retard } : m; }) } : x));
      setSauve("ok");
      queryClient.invalidateQueries({ queryKey: ["emailing-newsletters"] });
    } catch (e) { setSauve("erreur"); toast.error(e?.message || "Enregistrement impossible"); }
  });
  const changer = (patch) => setN((x) => { const v = { ...x, ...patch }; enregistrer(v); return v; });
  const statut = useMutation({
    mutationFn: (v) => req("POST", `/newsletters/${id}/statut`, { statut: v }),
    onSuccess: (r) => { setN(r.newsletter); rafraichir(); toast.success(r.newsletter.statut === "active" ? "Newsletter active : les mails prêts partiront à leur date" : "Newsletter en pause"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const statutMail = useMutation({
    mutationFn: ({ mid, v }) => req("POST", `/newsletters/${id}/mails/${mid}/statut`, { statut: v }),
    onSuccess: (r) => { setN(r.newsletter); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ajouter = useMutation({ mutationFn: (template_id) => req("POST", `/newsletters/${id}/mails`, { template_id }), onSuccess: (r) => { setN(r.newsletter); rafraichir(); } });
  const retirer = useMutation({ mutationFn: (mid) => req("DELETE", `/newsletters/${id}/mails/${mid}`), onSuccess: (r) => { setN(r.newsletter); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const supprimer = useMutation({ mutationFn: () => req("DELETE", `/newsletters/${id}`), onSuccess: () => { toast.success("Newsletter supprimée"); onSupprimee(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  if (!n) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const statsMail = Object.fromEntries((stats?.mails || []).map((m) => [m.id, m]));
  const listes = (ref?.listes || []).map((l) => [l.id, l.nom, l.abonnes]);
  const basculer = (on) => {
    if (on && !window.confirm(`Activer « ${n.nom} » ? Chaque mail Prêt partira à sa date, à ${heureLisible(n.heure)}, à tous les inscrits encore actifs.`)) return;
    statut.mutate(on ? "active" : "pause");
  };
  return (
    <div className="max-w-[720px] min-w-0">
      <div className="flex items-center justify-between gap-4">
        <input value={n.nom} onChange={(e) => changer({ nom: e.target.value })} aria-label="Nom de la newsletter" className="min-w-0 flex-1 bg-transparent text-[20px] tracking-[-0.01em] text-encre outline-none" />
        {onAtelier && <button type="button" onClick={onAtelier} className="inline-flex h-9 flex-none items-center gap-1.5 rounded-[8px] bg-encre px-3.5 text-[13.5px] font-medium text-fond hover:opacity-90"><Sparkles className="h-3.5 w-3.5" />Ouvrir l'éditeur</button>}
        <label className="flex flex-none cursor-pointer items-center gap-2.5 text-[13px] text-craie">
          {n.statut === "active" ? "Active" : n.statut === "pause" ? "En pause" : "Brouillon"}
          <Interrupteur actif={n.statut === "active"} onChange={basculer} libelle="Activer la newsletter" />
        </label>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ardoise">
        <span>{sauve === "en_cours" ? "Enregistrement…" : sauve === "erreur" ? "Non enregistré" : "Enregistré"}</span>
        <span>{pluriel(n.inscrits || 0, "inscrit actif", "inscrits actifs")}</span>
        <button type="button" onClick={() => { if (window.confirm(`Supprimer « ${n.nom} » ? Les mails partis restent partis ; les suivants ne partiront pas.`)) supprimer.mutate(); }} className="inline-flex items-center gap-1 hover:text-alerte max-md:h-9" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
      </div>

      <div className="mt-[22px]"><Entonnoir e={stats?.entonnoir} inscrits={n.inscrits} /></div>

      {/* Les réglages : la cohorte et le calendrier. */}
      <div className="mt-4 flex flex-col gap-4 rounded-[14px] border border-trait bg-rail px-[18px] py-4">
        <div>
          <p className="m-0 mb-2 text-[11.5px] uppercase tracking-[.04em] text-ardoise">Listes</p>
          <Pastilles options={listes} valeur={n.listes || []} onChange={(v) => changer({ listes: v })} vide="Aucune liste : importez-en une dans Contacts." />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-craie">
          <span className="flex items-center gap-2">Départ
            <ChoixDate valeur={n.depart} onChoisir={(d) => changer({ depart: d })} label="Date de départ">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3 text-[13px] text-encre"><CalendarDays className="h-3.5 w-3.5 text-ardoise" />{jourLong(n.depart)}</span>
            </ChoixDate>
          </span>
          <label className="flex items-center gap-2">Rythme
            <select value={n.rythme_jours} onChange={(e) => changer({ rythme_jours: Number(e.target.value) })} className="h-8 rounded-full border border-bord-doux bg-surface px-2.5 text-[13px] text-encre outline-none max-md:h-9 max-md:text-[16px]">
              {[...new Set([...RYTHMES, n.rythme_jours])].sort((a, b) => a - b).map((j) => <option key={j} value={j}>tous les {j} jours</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">à
            <input type="time" value={n.heure} onChange={(e) => e.target.value && changer({ heure: e.target.value })} className="h-8 rounded-full border border-bord-doux bg-surface px-2.5 text-[13px] text-encre outline-none [color-scheme:dark] max-md:h-9 max-md:text-[16px]" />
            <span className="text-ardoise">heure de Paris</span>
          </label>
        </div>
      </div>

      {/* Les mails : la date à droite du trait, la carte dessous. */}
      {n.mails.map((m, i) => {
        const st = statsMail[m.id];
        const envoye = m.statut === "envoye";
        return (
          <React.Fragment key={m.id}>
            <div className="flex items-center pl-[22px]">
              <span className="h-11 w-px flex-none bg-bord-doux" />
              <span className="ml-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-craie">
                {envoye ? <span>Parti le {jourLong(String(m.envoye_le).slice(0, 10))}</span> : (
                  <ChoixDate valeur={m.jour} onChoisir={(d) => changer({ mails: n.mails.map((x) => (x.id === m.id ? { ...x, date: d === m.date_calculee ? null : d } : x)) })} label="Changer la date de ce mail">
                    <CalendarDays className="h-3.5 w-3.5 text-ardoise" />{jourLong(m.jour)} · {heureLisible(n.heure)}
                  </ChoixDate>
                )}
                {!envoye && m.date && <button type="button" onClick={() => changer({ mails: n.mails.map((x) => (x.id === m.id ? { ...x, date: null } : x)) })} className="p-0 text-[12px] text-ardoise underline-offset-2 hover:text-encre hover:underline" style={{ background: "transparent" }}>date fixée à la main · revenir au rythme</button>}
              </span>
            </div>
            <div className={`flex items-center justify-between gap-4 rounded-[14px] border bg-rail px-[18px] py-4 ${m.en_retard ? "border-ambre/50" : "border-trait"}`}>
              <div className="min-w-0">
                <p className="m-0 flex items-center gap-2 text-[12px] text-ardoise">Mail {i + 1}<StatutMail statut={m.statut} /></p>
                <p className={`m-0 mt-1 truncate text-[14.5px] ${m.objet ? "text-encre" : "text-brume"}`}>{m.objet || "Sans objet"}</p>
                {envoye && st && (
                  <p className="m-0 mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-craie">
                    <span>{st.envoyes.toLocaleString("fr-FR")} envoyés</span><span>{pourcent(st.taux_ouverture)} ouvertures</span><span>{pourcent(st.taux_clic)} clics</span>{st.desinscrits > 0 && <span>{pluriel(st.desinscrits, "désinscription")}</span>}
                  </p>
                )}
                {m.en_retard && <p className="m-0 mt-2 text-[12.5px] text-ambre">Date passée de plus de 48 h : il ne part pas seul. Changez sa date.</p>}
              </div>
              <div className="flex flex-none items-center gap-1">
                {!envoye && (
                  <>
                    <button type="button" onClick={() => { if (window.confirm(`Retirer le mail ${i + 1} ?`)) retirer.mutate(m.id); }} aria-label={`Retirer le mail ${i + 1}`} title="Retirer"
                      className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-alerte max-md:h-9 max-md:w-9" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={statutMail.isPending} onClick={() => statutMail.mutate({ mid: m.id, v: m.statut === "pret" ? "brouillon" : "pret" })} className={`${boutonLigne} ${m.statut === "pret" ? "" : "border-menthe/50 text-menthe"}`}>{m.statut === "pret" ? "Repasser en brouillon" : "Marquer prêt"}</button>
                    <button type="button" onClick={() => onMail(n, m.id)} className={`${boutonLigne} text-encre`}>Modifier</button>
                  </>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      <div className="pl-[22px]"><span className="block h-6 w-px bg-bord-doux" /></div>
      <ChoixTemplate onChoisir={(t) => ajouter.mutate(t)} enCours={ajouter.isPending} />

      <div className="mt-[22px] border-t border-trait pt-[18px] text-[12.5px] leading-[1.6] text-ardoise">
        <p className="m-0">Un contact sort de la newsletter quand il prend un call, se désinscrit, fait un bounce ou se plaint. S'il répond, il reste inscrit et vous êtes prévenu.</p>
        <p className="m-0 mt-1">Trois jours avant chaque date, si le mail n'est pas prêt, une alerte arrive ici et par mail.</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Nom de l'expéditeur
          <input value={n.expediteur_nom || ""} onChange={(e) => changer({ expediteur_nom: e.target.value })} className={`${champ} h-9 text-[13px]`} />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Les réponses arrivent sur
          <input value={n.repondre_a || ""} onChange={(e) => changer({ repondre_a: e.target.value })} placeholder="vous@klocka.immo" className={`${champ} h-9 text-[13px]`} />
        </label>
      </div>
    </div>
  );
}

/**
 * L'atelier d'une newsletter (9 oct. 2026), en plein écran, au modèle de la
 * page Offres : à gauche le chat d'AK, à la place de la barre de navigation
 * (on lui dit ce qu'on veut, il prépare les mails à partir des templates et
 * des assets, et sa chaîne de raisonnement se déroule en direct) ; à droite
 * la newsletter. Pendant qu'AK travaille, ses étapes y remplacent les cartes ;
 * dès qu'il a fini, la newsletter modifiée revient.
 */
function Atelier({ id: id0 = null, mailId: mail0 = null, onFermer }) {
  const queryClient = useQueryClient();
  const [id, setId] = useState(id0);
  const [version, setVersion] = useState(0);
  const [mail, setMail] = useState(null); // { n, mailId }
  const [conversation, setConversation] = useState(false);
  const [travail, setTravail] = useState(null);
  const [maj, setMaj] = useState(false);
  const ouvert = useRef(false);
  const idCourant = useRef(id0);
  idCourant.current = id;
  useSansDefilement(true);
  useEffect(() => {
    document.documentElement.classList.add("k-sans-barre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, []);
  // Ouvert sur un mail (« Modifier » d'une carte) : l'éditeur de ce mail d'emblée.
  const { data: n0 } = useQuery({ queryKey: ["emailing-newsletter", id], queryFn: () => req("GET", `/newsletters/${id}`), enabled: !!id });
  useEffect(() => { if (mail0 && n0 && !ouvert.current) { ouvert.current = true; setMail({ n: n0, mailId: mail0 }); } }, [n0]);
  const rafraichir = (nid) => { queryClient.invalidateQueries({ queryKey: ["emailing-newsletters"] }); if (nid) { queryClient.invalidateQueries({ queryKey: ["emailing-newsletter", nid] }); queryClient.invalidateQueries({ queryKey: ["emailing-newsletter-stats", nid] }); } };
  // Pendant que le chat travaille, ses étapes à droite ; puis la newsletter, relue.
  const enCours = !!travail?.enCours;
  useEffect(() => {
    if (enCours) { setMaj(true); return undefined; }
    rafraichir(idCourant.current);
    setVersion((v) => v + 1);
    const t = setTimeout(() => setMaj(false), 700);
    return () => clearTimeout(t);
  }, [enCours]);
  // AK a écrit ou réécrit une newsletter : c'est elle qu'on montre.
  const surReponse = useCallback((r) => {
    const nid = (r?.actions || []).map((a) => a?.resultat?.newsletter_id).filter(Boolean).at(-1);
    if (!nid) return;
    rafraichir(nid);
    setMail(null);
    setId(nid);
    setVersion((v) => v + 1);
  }, []);
  const creer = useMutation({ mutationFn: () => req("POST", "/newsletters", { nom: "Nouvelle newsletter" }), onSuccess: (n) => { rafraichir(); setId(n.id); } });
  const enregistrerMail = useEnregistrement(async ({ nid, mails }) => {
    try {
      await req("PATCH", `/newsletters/${nid}`, { mails: mails.map((m) => ({ id: m.id, objet: m.objet, apercu: m.apercu, design: m.design, date: m.date || null })) });
      rafraichir(nid);
    } catch (e) { toast.error(e?.message || "Enregistrement impossible"); }
  });
  const fermerMail = () => { queryClient.setQueryData(["emailing-newsletter", mail.n.id], (d) => (d ? { ...d, mails: mail.n.mails } : d)); rafraichir(mail.n.id); setMail(null); setVersion((v) => v + 1); };
  const contexte = useMemo(() => ({ mode: "newsletter", newsletter_id: id || null }), [id]);
  return (
    <div className="fixed inset-0 z-[60] grid h-[100dvh] grid-cols-[minmax(360px,440px)_minmax(0,1fr)] overflow-hidden bg-fond duration-300 animate-in fade-in-0 max-md:flex max-md:flex-col">
      {/* Le chat, comme dans Offres : la barre sombre en haut (« ← Emailing », sur la ligne du nom de la
          newsletter à droite), « On commence ! » au milieu tant qu'on n'a rien dit, le champ en bas ; puis la
          conversation sur toute la hauteur. Le chat garde sa place dans l'arbre d'un état à l'autre. */}
      <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col px-5 max-md:h-[50dvh]">
        <div className="k-barre-apercu -mx-5 flex h-14 flex-none items-center px-5">
          <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}><ArrowLeft className="h-4 w-4" />Emailing</button>
        </div>
        {!conversation && (
          <div className="grid flex-1 place-items-center px-4 text-center">
            {/* Un balayage de lumière traverse le texte à l'ouverture, comme « Tout préparé » du mode appel. */}
            <p className="k-reflet m-0 text-[26px] font-normal tracking-[-0.01em]">On commence !</p>
          </div>
        )}
        <div className={conversation ? "min-h-0 flex-1" : "flex-none pb-5"}>
          <ChatDashboard espace="newsletter" onConversation={setConversation} onReponse={surReponse} barreApercu={conversation} sansBarreHaut onTravail={setTravail} contexte={contexte} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col border-l border-bord-doux max-md:flex-1 max-md:border-l-0 max-md:border-t">
        <div className="k-barre-apercu flex h-14 flex-none items-center gap-3 px-5">
          <span className="min-w-0 truncate text-[14px] text-encre">{n0?.nom || (id ? "" : "Nouvelle newsletter")}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {maj && id ? (
            <MiseAJourDocument surtitre="Mise à jour de la newsletter" titre="La newsletter s'adapte" etapes={travail?.etapes || []} enCours={enCours} />
          ) : maj ? (
            <MiseAJourDocument surtitre="Nouvelle newsletter" titre="AK prépare les mails" etapes={travail?.etapes || []} enCours={enCours} />
          ) : mail ? (
            <MailOuvert n={mail.n} mail={mail.n.mails.find((x) => x.id === mail.mailId)} index={mail.n.mails.findIndex((x) => x.id === mail.mailId)} avecAK={false}
              onFermer={fermerMail}
              onChange={(v) => setMail((x) => {
                const mails = x.n.mails.map((y) => (y.id === x.mailId ? { ...y, ...v } : y));
                enregistrerMail({ nid: x.n.id, mails });
                return { ...x, n: { ...x.n, mails } };
              })} />
          ) : id ? (
            <div className="px-10 pb-20 pt-8 duration-500 animate-in fade-in-0 slide-in-from-bottom-2 max-md:px-4 max-md:pt-5">
              <VueNewsletter key={`${id}-${version}`} id={id} onMail={(nl, mailId) => setMail({ n: nl, mailId })} onSupprimee={onFermer} />
            </div>
          ) : (
            <div className="grid h-full place-items-center px-10 text-center">
              <div className="flex max-w-[44ch] flex-col items-center gap-4">
                <p className="m-0 text-[14px] leading-[1.6] text-ardoise">La newsletter se prépare ici dès que vous l'avez décrite au chat : ses mails datés au rythme choisi, à retoucher carte par carte, puis à marquer prêts.</p>
                <button type="button" onClick={() => creer.mutate()} disabled={creer.isPending} className={boutonLigne}>{creer.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Commencer sans AK</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Newsletters({ demande = null }) {
  const queryClient = useQueryClient();
  const [choisie, setChoisie] = useState(null);
  const [atelier, setAtelier] = useState(null); // { id, mailId } : l'atelier en plein écran
  const { data, isLoading } = useQuery({ queryKey: ["emailing-newsletters"], queryFn: () => req("GET", "/newsletters") });
  const liste = data?.newsletters || [];
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["emailing-newsletters"] });
  // « Nouvelle newsletter » ouvre l'atelier : AK la prépare, ou on commence sans lui.
  useEffect(() => { if (demande?.quoi === "nouvelle") setAtelier({ id: null, mailId: null }); }, [demande?.n]);
  useEffect(() => { if (!choisie && liste.length) setChoisie(liste[0].id); }, [liste.length]);
  const supprimer = useMutation({ mutationFn: (id) => req("DELETE", `/newsletters/${id}`), onSuccess: (_r, id) => { toast.success("Newsletter supprimée"); if (choisie === id) setChoisie(null); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });

  const vueAtelier = atelier && <Atelier id={atelier.id} mailId={atelier.mailId} onFermer={() => { setAtelier(null); rafraichir(); queryClient.invalidateQueries({ queryKey: ["emailing-newsletter"] }); }} />;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!liste.length) return <>{vueAtelier}<p className="py-14 text-center text-[14px] text-brume">Aucune newsletter encore : « Nouvelle newsletter », en haut à droite.</p></>;
  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] items-start gap-7 px-10 pb-20 pt-7 max-lg:grid-cols-1 max-md:px-4 max-md:pt-5">
      {vueAtelier}
      <div className="flex flex-col gap-2 max-lg:flex-row max-lg:overflow-x-auto max-lg:pb-1">
        {liste.map((n) => (
          <div key={n.id} role="button" tabIndex={0} onClick={() => setChoisie(n.id)} onKeyDown={(e) => { if (e.key === "Enter") setChoisie(n.id); }}
            className={`group relative flex cursor-pointer flex-col gap-2 rounded-[12px] border p-3.5 text-left transition-colors max-lg:min-w-[240px] ${n.id === choisie ? "border-bord-vif bg-relief" : "border-trait bg-rail hover:border-bord-doux"}`}>
            <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[14px] text-encre">{n.nom}</span><Pastille statut={n.statut} /></span>
            <span className="text-[12.5px] text-ardoise">{pluriel(n.mails?.length || 0, "mail")} · {pluriel(n.inscrits || 0, "inscrit")} · {pluriel(n.calls || 0, "call")}</span>
            {n.prochain?.instant && n.statut === "active" && <span className="text-[12px] text-craie">Prochain : {jourLong(String(n.prochain.instant).slice(0, 10))}{n.prochain.statut !== "pret" ? <span className="text-ambre"> · pas prêt</span> : null}</span>}
            <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Supprimer « ${n.nom} » ? Les mails partis restent partis ; les suivants ne partiront pas.`)) supprimer.mutate(n.id); }} aria-label={`Supprimer ${n.nom}`} title="Supprimer"
              className="absolute bottom-2.5 right-2.5 grid h-7 w-7 place-items-center rounded-full text-ardoise opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      {choisie && <VueNewsletter key={choisie} id={choisie} onAtelier={() => setAtelier({ id: choisie, mailId: null })} onMail={(nl, mailId) => setAtelier({ id: nl.id, mailId })} onSupprimee={() => { setChoisie(null); rafraichir(); }} />}
    </div>
  );
}
