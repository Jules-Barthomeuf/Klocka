import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import LogoKP from "@/components/mandataire/LogoKP";
import jetons from "@/design/jetons.json";

// Le bon de visite signé à distance (7 nov. 2026, Jules : « il faut qu'ils puissent signer directement depuis
// l'application »). Public, ouvert par le lien que le mandataire envoie (SMS, WhatsApp, mail), sans compte : le visiteur
// lit le bon, écrit son nom et signe au doigt. Le serveur garde le texte, son empreinte, l'heure et l'adresse IP
// (server/visites-acquereur.js), et prévient le mandataire.

const API = "/api/bon-visite";
// Un document : encre sur papier blanc, quel que soit le thème (le canvas ne lit pas les variables).
const PAPIER = jetons.couleurs_clair.fond;
const ENCRE = jetons.couleurs_clair.encre;

export default function SignerBon() {
  const jeton = new URLSearchParams(window.location.search).get("jeton") || "";
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [nom, setNom] = useState("");
  const [trace, setTrace] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  const canvas = useRef(null);
  const dessin = useRef(null);

  useEffect(() => {
    fetch(`${API}/${encodeURIComponent(jeton)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Ce lien ne s'ouvre pas.");
      setD(j); setNom(j.nom || ""); if (j.signe_le) setFait(true);
    }).catch((e) => setErreur(e.message));
  }, [jeton]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const k = window.devicePixelRatio || 1;
    c.width = r.width * k; c.height = r.height * k;
    const ctx = c.getContext("2d");
    ctx.scale(k, k);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = ENCRE;
  }, [d, fait]);
  const point = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const debut = (e) => { e.preventDefault(); canvas.current.setPointerCapture(e.pointerId); dessin.current = point(e); };
  const bouge = (e) => {
    if (!dessin.current) return;
    const ctx = canvas.current.getContext("2d");
    const [x, y] = point(e);
    ctx.beginPath(); ctx.moveTo(...dessin.current); ctx.lineTo(x, y); ctx.stroke();
    dessin.current = [x, y];
    setTrace(true);
  };
  const fin = () => { dessin.current = null; };
  const effacer = () => { const c = canvas.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setTrace(false); };
  const signer = async () => {
    setEnvoi(true);
    try {
      const r = await fetch(`${API}/${encodeURIComponent(jeton)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom: nom.trim(), signature: canvas.current.toDataURL("image/png") }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "La signature n'est pas partie.");
      setFait(true);
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };

  const lignes = d?.bon?.lignes?.map((l) => l.replace(/Je soussigné\(e\) [^,]*,/, `Je soussigné(e) ${nom.trim() || "…"},`)) || [];
  return (
    <div className="min-h-[100dvh] px-4 py-8" style={{ background: PAPIER, color: ENCRE }}>
      <div className="mx-auto max-w-[560px]">
        <LogoKP />
        {erreur && !d ? <p className="mt-10 text-[15px]">{erreur}</p> : !d ? <Loader2 className="mt-10 h-5 w-5 animate-spin" /> : fait ? (
          <div className="mt-10">
            <p className="m-0 inline-flex items-center gap-2 text-[20px]"><Check className="h-5 w-5" />Bon de visite signé</p>
            <p className="m-0 mt-3 text-[15px] leading-[1.6]">Merci{nom ? ` ${nom.trim()}` : ""}. {d.conseiller?.nom || "Votre conseiller"} est prévenu{d.conseiller?.telephone ? ` ; pour toute question : ${d.conseiller.telephone}` : ""}.</p>
            {/* Le bon signé lui-même, avec la signature : la copie que le visiteur reçoit par mail (8 nov. 2026). */}
            {d.signature && (
              <div className="mt-8 border-t pt-6" style={{ borderColor: `${ENCRE}22` }}>
                <h1 className="m-0 text-[22px] font-normal">{d.bon.titre}</h1>
                {lignes.map((l, i) => <p key={i} className="m-0 mt-4 text-[15px] leading-[1.65]">{l}</p>)}
                <p className="m-0 mt-5 text-[14px] opacity-70">Signé par {d.nom}{d.signe_le ? `, le ${new Date(d.signe_le).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
                <img src={d.signature} alt="Signature" className="mt-2 h-[120px]" />
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="m-0 mt-8 text-[24px] font-normal">{d.bon.titre}</h1>
            <p className="m-0 mt-1 text-[14px] opacity-70">À lire, puis à signer avec le doigt.</p>
            {lignes.map((l, i) => <p key={i} className="m-0 mt-4 text-[15px] leading-[1.65]">{l}</p>)}
            <label className="mt-7 block text-[13px] opacity-70">Nom et prénom</label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" className="mt-1.5 h-12 w-full rounded-[10px] border px-3 text-[16px] outline-none" style={{ borderColor: `${ENCRE}33`, background: "transparent", color: ENCRE }} />
            <div className="mt-5 flex items-center text-[13px]"><span className="opacity-70">Signature</span><span className="flex-1" />{trace && <button type="button" onClick={effacer} className="underline" style={{ background: "transparent", color: ENCRE }}>Effacer</button>}</div>
            <canvas ref={canvas} onPointerDown={debut} onPointerMove={bouge} onPointerUp={fin} onPointerCancel={fin}
              className="mt-1.5 h-[200px] w-full touch-none rounded-[12px] border" style={{ borderColor: `${ENCRE}33` }} aria-label="Zone de signature" />
            {erreur && <p className="m-0 mt-3 text-[14px]">{erreur}</p>}
            <button type="button" onClick={signer} disabled={envoi || !trace || !nom.trim()}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] disabled:opacity-40" style={{ background: ENCRE, color: PAPIER }}>
              {envoi ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}Signer le bon de visite
            </button>
            <p className="m-0 mt-4 text-[12px] leading-[1.55] opacity-60">Votre signature, l'heure et l'adresse de connexion sont gardées comme preuve de la signature du bon, et ne servent qu'à lui.</p>
          </>
        )}
      </div>
    </div>
  );
}
