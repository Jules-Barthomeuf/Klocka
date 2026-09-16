import React from "react";
import { CarteClients } from "./ProjectFormInfoTab";
import { J } from "@/design/jetons";

// Général : ce qui identifie le projet, avant tout ce qui le décrit.
//
// Le nom, les clients à qui il est assigné, et les collaborateurs qui le
// suivent. La liste des collaborateurs vient des comptes admin de la
// plateforme, pas d'une liste écrite en dur : personne n'y manque et personne
// n'y reste après son départ. Les photos connues sont reprises, les autres
// montrent leurs initiales.

const PHOTOS = {
  "jules.b@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png",
  "alexis.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e5f3e9394_Capturedecran2026-02-18a163239.png",
  "maxime.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e92131b8c_Capturedecran2026-02-18a164304.png",
  "paul.dz@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/db402bc1f_Capturedecran2026-06-24a122246.png",
};

const fieldWrap = "bg-surface border border-trait rounded-[14px] p-4";
const flabel = "text-[11px] tracking-[.16em] uppercase text-ardoise mb-2.5";

const initiales = (nom = "", email = "") => {
  const source = nom.trim() || email.split("@")[0].replace(/[._-]+/g, " ");
  return source.split(/\s+/).map((m) => m[0]).join("").slice(0, 2).toUpperCase();
};

const prenom = (u) => (u.full_name || u.email.split("@")[0].replace(/[._-]+/g, " ")).split(" ")[0];

export default function ProjectFormGeneralTab({ formData, setFormData, users = [] }) {
  const collaborateurs = users.filter((u) => u.role === "admin");
  // Le principal reste le premier de la liste : c'est lui qui porte la carte
  // du projet et qui ouvre les droits côté serveur.
  const choisis = formData.admins?.length
    ? formData.admins
    : formData.admin_principal ? [formData.admin_principal] : [];

  const basculer = (email) => {
    const apres = choisis.includes(email) ? choisis.filter((e) => e !== email) : [...choisis, email];
    setFormData({ ...formData, admins: apres, admin_principal: apres[0] || "" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={fieldWrap}>
        <div className={flabel}>Nom du projet</div>
        <input
          value={formData.titre || ""}
          onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
          placeholder="Pizzeria Chez Truc - 12 rue de la Liberté"
          className="w-full rounded-[10px] border border-bord bg-fond px-3.5 py-2.5 text-[14px] text-encre outline-none transition-colors placeholder:text-brume focus:border-menthe"
        />
        <p className="m-0 mt-2 text-[11.5px] text-brume">Il s&apos;écrit en haut de l&apos;écran, et c&apos;est celui que le client lit.</p>
      </div>

      <CarteClients formData={formData} setFormData={setFormData} users={users} />

      <div className={fieldWrap}>
        <div className={flabel}>Collaborateurs</div>
        {collaborateurs.length === 0 ? (
          <p className="m-0 text-[12.5px] text-ardoise">Aucun compte administrateur.</p>
        ) : (
          <div className="flex flex-wrap items-start gap-3">
            {collaborateurs.map((u) => {
              const actif = choisis.includes(u.email);
              const photo = PHOTOS[u.email.toLowerCase()];
              return (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => basculer(u.email)}
                  title={u.full_name || u.email}
                  className="flex w-[54px] flex-col items-center gap-1.5"
                >
                  <span
                    className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-craie transition-all"
                    style={{
                      background: photo ? undefined : J["relief"],
                      boxShadow: `0 0 0 2px ${actif ? J["menthe"] : "transparent"}, 0 0 0 3px ${J["fond"]}`,
                    }}
                  >
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initiales(u.full_name, u.email)}
                  </span>
                  <span className={`w-full truncate text-center text-[10.5px] ${actif ? "text-encre" : "text-brume"}`}>{prenom(u)}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="m-0 mt-3 text-[11.5px] text-brume">
          Plusieurs collaborateurs peuvent suivre un projet. Le premier choisi porte sa carte dans la liste.
        </p>
      </div>
    </div>
  );
}
