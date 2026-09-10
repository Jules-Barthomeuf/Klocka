import React, { useState } from "react";
import { Plus, X, Search, ChevronDown } from "lucide-react";

const fieldWrap = "bg-transparent border border-[#1e1e1e] rounded-[12px] px-4 py-3.5 transition-colors focus-within:border-[#3a3f4a]";
const fieldInput = "w-full bg-transparent border-none text-[#f2f3f5] outline-none placeholder:text-[#6a7180]";
const flabel = "text-[12px] text-[#9298a6] mb-2";

const STATUSES = [
  { value: "prospect", label: "Prospect" },
  { value: "analyse", label: "Analyse" },
  { value: "negociation", label: "Négociation" },
  { value: "financement", label: "Financement" },
  { value: "signe", label: "Signé" },
];

const ADMINS = [
  { email: "jules.b@klocka.immo", url: "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png" },
  { email: "alexis.p@klocka.immo", url: "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e5f3e9394_Capturedecran2026-02-18a163239.png" },
  { email: "maxime.p@klocka.immo", url: "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e92131b8c_Capturedecran2026-02-18a164304.png" },
  { email: "paul.dz@klocka.immo", url: "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/db402bc1f_Capturedecran2026-06-24a122246.png" },
];

const AVATAR_COLORS = ["#3A4560", "#4A3A56", "#3A564B", "#564A3A", "#4A4A56"];
const initials = (name = "") => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

// Ce qui décrit le projet lui-même. Les collaborateurs, les clients et les
// documents ont quitté cet onglet : ils vivent dans le panneau, visibles quelle
// que soit la section ouverte.
export default function ProjectFormInfoTab({ formData, setFormData }) {
  return (
    <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
      {/* Titre */}
      <div className={`${fieldWrap} col-span-2 max-md:col-span-1`}>
        <div className={`${flabel} text-[#9298a6]`}>Titre du projet</div>
        <input value={formData.titre} onChange={(e) => setFormData({ ...formData, titre: e.target.value })} placeholder="Nom du projet" className={`${fieldInput} text-[17px] font-semibold`} />
      </div>

      {/* Statut + Suivi client */}
      <>
        <div className={fieldWrap}>
          <div className={flabel}>Statut du projet</div>
          <div className="relative">
            <select
              value={formData.statut || "prospect"}
              onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
              className={`${fieldInput} text-[15px] appearance-none cursor-pointer pr-8`}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value} className="bg-[#0f1114]">
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#6a7180] absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <div className={fieldWrap}>
          <div className={flabel}>Suivi client</div>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[#f2f3f5]">
              <input
                type="checkbox"
                checked={!!formData.suivi_message_envoye}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    suivi_message_envoye: e.target.checked,
                    // Décocher le message remet le retour client à zéro.
                    ...(e.target.checked ? {} : { suivi_retour_client: null }),
                  })
                }
                className="w-4 h-4 accent-[#96c0b8]"
              />
              Message envoyé au client
            </label>
            {formData.suivi_message_envoye && (
              <div className="flex items-center gap-1.5 text-[13px]">
                <span className="text-[#9298a6]">Retour :</span>
                {["oui", "non"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        suivi_retour_client: formData.suivi_retour_client === v ? null : v,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg border text-[12px] transition-colors ${
                      formData.suivi_retour_client === v
                        ? v === "oui"
                          ? "bg-[#96c0b8]/25 border-[#96c0b8] text-[#c3ddd6]"
                          : "bg-red-500/20 border-red-400/60 text-red-300"
                        : "border-[#f2f3f5]/15 text-[#9298a6] hover:border-[#f2f3f5]/30"
                    }`}
                  >
                    {v === "oui" ? "Oui" : "Non"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </>

      {/* Adresse + Surface */}
      <>
        <div className={fieldWrap}>
          <div className={flabel}>Adresse</div>
          <input value={formData.adresse_complete} onChange={(e) => setFormData({ ...formData, adresse_complete: e.target.value })} placeholder="Adresse complète" className={`${fieldInput} text-[16px]`} />
        </div>
        <div className={fieldWrap}>
          <div className={flabel}>Surface m²</div>
          <input type="number" value={formData.surface_m2 || ""} onChange={(e) => setFormData({ ...formData, surface_m2: parseFloat(e.target.value) || 0 })} placeholder="—" className={`${fieldInput} text-[16px]`} />
        </div>
      </>

    </div>
  );
}

// Les collaborateurs, les clients et les documents ne dépendent d'aucune
// section : la maquette les garde sous les yeux quel que soit l'onglet ouvert.
// Ils vivent donc dans le panneau, pas dans l'onglet « Bien ».

export function CarteCollaborateurs({ formData, setFormData }) {
  return (
    <div className={fieldWrap}>
      <div className={flabel}>Collaborateurs</div>
      <div className="flex items-center gap-2.5 flex-wrap">
        {ADMINS.map((admin) => {
          const selected = formData.admin_principal === admin.email;
          return (
            <button key={admin.email} type="button" onClick={() => setFormData({ ...formData, admin_principal: selected ? "" : admin.email })}
              className="w-[34px] h-[34px] rounded-full overflow-hidden transition-all"
              style={{ boxShadow: `0 0 0 2px ${selected ? "#96c0b8" : "transparent"}, 0 0 0 3px #000000` }}>
              <img src={admin.url} alt={admin.email} className="w-full h-full object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CarteClients({ formData, setFormData, users }) {
  const [clientSearch, setClientSearch] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const nameOf = (email) => users.find((u) => u.email === email)?.full_name || email;
  const nonAdminAssigned = [
    ...(formData.client_email && !users.find((u) => u.email === formData.client_email && u.role === "admin") ? [{ email: formData.client_email, principal: true }] : []),
    ...formData.client_emails.filter((e) => !users.find((u) => u.email === e && u.role === "admin")).map((e) => ({ email: e, principal: false })),
  ];
  const clientCandidates = users.filter((u) => {
    const q = clientSearch.toLowerCase();
    const matches = !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    return matches && u.email !== formData.client_email && !formData.client_emails.includes(u.email);
  });
  const addClient = (email) => {
    if (!formData.client_email) setFormData({ ...formData, client_email: email });
    else if (!formData.client_emails.includes(email) && email !== formData.client_email) setFormData({ ...formData, client_emails: [...formData.client_emails, email] });
    setClientOpen(false);
    setClientSearch("");
  };
  const removeClient = (email, principal) => {
    if (principal) setFormData({ ...formData, client_email: formData.client_emails[0] || "", client_emails: formData.client_emails.slice(1) });
    else setFormData({ ...formData, client_emails: formData.client_emails.filter((e) => e !== email) });
  };
  return (
      <div className={fieldWrap}>
        <div className={flabel}>Clients assignés</div>
        <div className="flex flex-col gap-2.5 mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            {nonAdminAssigned.map(({ email, principal }, i) => (
              <div key={email} className="inline-flex items-center gap-2 bg-[#f2f3f5]/[0.05] rounded-full pl-1 pr-2.5 py-1 text-[13px] text-[#f2f3f5]">
                <span className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-semibold text-[#f2f3f5]" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>{initials(nameOf(email))}</span>
                {nameOf(email)}
                {principal && <span className="text-[10px] bg-[#96c0b8] text-[#f2f3f5] px-1.5 py-0.5 rounded font-semibold">Principal</span>}
                <span onClick={() => removeClient(email, principal)} className="cursor-pointer text-[#9298a6] hover:text-[#FF7C7C] flex ml-0.5"><X className="w-3.5 h-3.5" strokeWidth={2.2} /></span>
              </div>
            ))}
            <div className="relative">
              <button type="button" onClick={() => setClientOpen(!clientOpen)} className="w-[34px] h-[34px] rounded-full border-[1.5px] border-dashed border-[#f2f3f5]/20 text-[#9298a6] flex items-center justify-center text-[18px] hover:border-[#3a3f4a] hover:text-[#f2f3f5] transition-colors">+</button>
              {clientOpen && (
                <div className="absolute top-[calc(100%+8px)] left-0 w-[280px] bg-[#0f1114] border border-[#f2f3f5]/[0.1] rounded-md p-1.5 z-30 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                  <div className="relative mb-1">
                    <Search className="w-4 h-4 text-[#6a7180] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Rechercher..." className="w-full bg-[#0f1114] border border-[#1f2228] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[#f2f3f5] outline-none placeholder:text-[#6a7180]" />
                  </div>
                  <div className="max-h-[220px] overflow-auto">
                    {clientCandidates.map((u) => (
                      <div key={u.id} onClick={() => addClient(u.email)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.06] transition-colors">
                        <span className="w-6 h-6 rounded-full bg-[#f2f3f5]/[0.06] text-[#B9BEB9] flex items-center justify-center text-[10px] font-semibold">{initials(u.full_name || u.email)}</span>
                        {u.full_name || u.email} {u.role === "admin" && "(admin)"}
                      </div>
                    ))}
                    {clientCandidates.length === 0 && <div className="p-3 text-[13px] text-[#6a7180] text-center">Aucun client</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}

export function CarteDocuments({ formData, setFormData }) {
  const [newDocUrl, setNewDocUrl] = useState("");
  const convertGoogleDriveUrl = (url) => {
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2000` : url;
  };
  const addDoc = () => {
    if (newDocUrl.trim()) { setFormData({ ...formData, documents: [...formData.documents, convertGoogleDriveUrl(newDocUrl.trim())] }); setNewDocUrl(""); }
  };
  return (
      <div className={fieldWrap}>
        <div className={flabel}>Documents étudiés (URL)</div>
        <div className="flex flex-col gap-2.5">
          <div className="flex gap-2.5 items-center">
            <input value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addDoc(); }} placeholder="https://exemple.com/document.pdf" className={`${fieldInput} text-[15px] flex-1`} />
            <button type="button" onClick={addDoc} className="w-8 h-8 rounded-full bg-[#96c0b8] text-[#04140c] flex items-center justify-center text-[16px] cursor-pointer flex-shrink-0 hover:bg-[#abd0c8] transition-colors">+</button>
          </div>
          {formData.documents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.documents.map((url, idx) => (
                <div key={idx} className="flex items-center gap-1.5 bg-[#f2f3f5]/[0.04] px-2.5 py-1.5 rounded-lg text-[13px] text-[#f2f3f5]">
                  <span>Document {idx + 1}</span>
                  <button onClick={() => setFormData({ ...formData, documents: formData.documents.filter((_, i) => i !== idx) })} className="text-[#9298a6] hover:text-[#FF7C7C]"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  );
}

