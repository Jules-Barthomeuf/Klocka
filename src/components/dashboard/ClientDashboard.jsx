import React, { useState } from "react";
import { createPageUrl } from "@/utils";
import {
  BookOpen, Calendar, ArrowRight, ChevronDown, Download, Clock
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ProjectCarousel from "./ProjectCarousel";
import { motion, AnimatePresence } from "framer-motion";

const profilImages = {
  equilibriste: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/4021d9836_Gemini_Generated_Image_vgo6wsvgo6wsvgo6.png",
  risk_taker: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/c9f0ec7e6_risktaker.png",
  collectionneur: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/ec897eb44_collectionneur.png",
  visionnaire: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/55107ab45_Gemini_Generated_Image_o65zqho65zqho65z.png"
};

const profilLabels = {
  equilibriste: { label: "L'équilibriste : le chercheur d'équilibre", image: profilImages.equilibriste, description: "Vous recherchez le juste milieu entre sécurité et performance. Vous privilégiez un bon emplacement tout en restant attentif à la rentabilité." },
  risk_taker: { label: "Risk taker : L'investisseur offensif", image: profilImages.risk_taker, description: "Vous n'hésitez pas à prendre des risques calculés si les chiffres sont au rendez-vous. L'effet de levier et la rentabilité maximale sont vos priorités." },
  collectionneur: { label: "Le Collectionneur : L'amoureux de la Belle Pierre", image: profilImages.collectionneur, description: "Pour vous, l'emplacement est roi. Vous privilégiez les actifs de qualité dans les meilleurs emplacements, avec une vision patrimoniale long terme." },
  visionnaire: { label: "Le Visionnaire : Le Stratège du potentiel", image: profilImages.visionnaire, description: "Vous savez identifier le potentiel là où d'autres ne le voient pas. Vous misez sur la création de valeur et la transformation à long terme." },
};

const etapes = [
  { numero: 1, titre: "Acculturation" },
  { numero: 2, titre: "Stratégie" },
  { numero: 3, titre: "Recherche" },
  { numero: 4, titre: "Financement" },
  { numero: 5, titre: "Signature" },
];

export default function ClientDashboard({ user, navigate, projects, resources, strategies }) {
  const [showProfilDescription, setShowProfilDescription] = useState(false);
  const userEtape = user.etape_actuelle ?? 0;
  const userProfil = profilLabels[user.profil_investisseur];
  const userStrategy = strategies.length > 0 ? strategies[0] : null;

  return (
    <div className="space-y-8">
      {/* Étapes d'accompagnement */}
      <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex items-center justify-between min-w-[320px] md:min-w-0 max-w-3xl mx-auto">
          {etapes.map((etape, index) => {
            const isCompleted = etape.numero < userEtape;
            const isCurrent = etape.numero === userEtape;
            const isActive = isCompleted || isCurrent;
            return (
              <div key={etape.numero} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs transition-all ${
                    isActive ? 'bg-[#2A9D8F] text-white' : 'bg-white/[0.04] text-white/20 border border-white/[0.08]'
                  }`}>
                    {etape.numero}
                  </div>
                  <p className={`text-[9px] md:text-xs mt-2 text-center max-w-[60px] md:max-w-[100px] leading-tight ${
                    isActive ? 'text-white' : 'text-white/20'
                  }`}>{etape.titre}</p>
                </div>
                {index < etapes.length - 1 && (
                  <div className="flex-1 h-px mx-1">
                    <div className={`h-full ${isCompleted ? 'bg-[#2A9D8F]' : 'border-t border-dashed border-white/[0.08]'}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Étape 1 - Acculturation cards */}
      {userEtape === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] transition-all">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#2A9D8F]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-6 h-6 text-[#2A9D8F]" />
              </div>
              <div>
                <h3 className="text-white text-base font-medium mb-2">Maîtrisez les fondamentaux</h3>
                <p className="text-white/30 text-sm mb-4">Accédez à nos ressources pour vous acculturer aux spécificités de ce marché.</p>
                <button onClick={() => navigate(createPageUrl("Ressources"))}
                  className="inline-flex items-center gap-2 bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white text-sm px-4 py-2 rounded-xl transition-all">
                  Accéder aux ressources <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] transition-all">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#2A9D8F]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-[#2A9D8F]" />
              </div>
              <div>
                <h3 className="text-white text-base font-medium mb-2">Vous maîtrisez les notions clés ?</h3>
                <p className="text-white/30 text-sm mb-4">Définissons ensemble votre stratégie d'investissement.</p>
                <button onClick={() => navigate(createPageUrl("Questionnaire"))}
                  className="inline-flex items-center gap-2 bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white text-sm px-4 py-2 rounded-xl transition-all">
                  Prendre rendez-vous <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects + Sidebar */}
      {userEtape >= 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left col */}
          <div className="lg:col-span-2 space-y-6">
            {projects.length > 0 && <ProjectCarousel projects={projects} />}

            {resources.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg text-white font-light">Ressources</h2>
                  <button onClick={() => navigate(createPageUrl("Ressources"))}
                    className="text-white/30 hover:text-white text-sm flex items-center gap-1 transition-colors">
                    Voir tout <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {resources.slice(0, 3).map(resource => (
                    <div key={resource.id}
                      className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] transition-all cursor-pointer"
                      onClick={() => resource.url_fichier && window.open(resource.url_fichier, '_blank')}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#2A9D8F]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-5 h-5 text-[#2A9D8F]" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-white text-sm truncate">{resource.titre}</h4>
                          <p className="text-white/20 text-xs truncate">{resource.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right col */}
          <div className="space-y-6">
            {/* Profil investisseur */}
            {userProfil && (
              <div>
                <h2 className="text-sm text-white/40 uppercase tracking-wider mb-3">Votre profil</h2>
                <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-4 cursor-pointer hover:border-white/[0.12] transition-all"
                  onClick={() => setShowProfilDescription(!showProfilDescription)}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#2A9D8F]/20 flex-shrink-0">
                      <img src={userProfil.image} alt={userProfil.label} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm text-[#2A9D8F] truncate">{userProfil.label}</h3>
                    </div>
                    <motion.div animate={{ rotate: showProfilDescription ? 180 : 0 }} transition={{ duration: 0.3 }}>
                      <ChevronDown className="w-4 h-4 text-white/20 flex-shrink-0" />
                    </motion.div>
                  </div>
                  <AnimatePresence>
                    {showProfilDescription && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                        <div className="mt-3 pt-3 border-t border-white/[0.06]">
                          <p className="text-white/40 text-xs leading-relaxed">{userProfil.description}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Stratégie */}
            {userEtape >= 2 && userStrategy && (userStrategy.budget_max || userStrategy.apport || userStrategy.fields?.length > 0) && (
              <div>
                <h2 className="text-sm text-white/40 uppercase tracking-wider mb-3">Votre stratégie</h2>
                <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-4">
                  {(userStrategy.budget_max || userStrategy.apport) && (
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {userStrategy.budget_max > 0 && (
                        <div className="bg-[#2A9D8F]/5 border border-[#2A9D8F]/15 rounded-xl p-3">
                          <p className="text-[10px] text-white/30 uppercase tracking-wider">Budget max</p>
                          <p className="text-lg text-[#2A9D8F] font-light">{Math.round(userStrategy.budget_max).toLocaleString('fr-FR')} €</p>
                        </div>
                      )}
                      {userStrategy.apport > 0 && (
                        <div className="bg-[#2A9D8F]/5 border border-[#2A9D8F]/15 rounded-xl p-3">
                          <p className="text-[10px] text-white/30 uppercase tracking-wider">Apport</p>
                          <p className="text-lg text-[#2A9D8F] font-light">{Math.round(userStrategy.apport).toLocaleString('fr-FR')} €</p>
                        </div>
                      )}
                    </div>
                  )}
                  {userStrategy.fields?.map((field, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl mb-2 last:mb-0 ${
                      field.is_nogo ? 'bg-red-500/5 border border-red-500/15' : 'bg-white/[0.02] border border-white/[0.04]'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${field.is_nogo ? 'bg-red-500' : 'bg-[#2A9D8F]'}`} />
                      <div>
                        <h4 className={`text-sm mb-0.5 ${field.is_nogo ? 'text-red-400' : 'text-white'}`}>
                          {field.label}{field.is_nogo && <span className="ml-2 text-[10px] text-red-400/60">(No-go)</span>}
                        </h4>
                        <p className="text-white/20 text-xs">{field.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dossier bancaire */}
            {userEtape >= 4 && user.dossier_bancaire_url && (
              <div>
                <h2 className="text-sm text-white/40 uppercase tracking-wider mb-3">Dossier bancaire</h2>
                <a href={user.dossier_bancaire_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-4 bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-4 hover:border-[#2A9D8F]/30 transition-all">
                  <div className="w-10 h-10 bg-[#2A9D8F]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Download className="w-5 h-5 text-[#2A9D8F]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white text-sm">Télécharger mon dossier</h4>
                    <p className="text-white/20 text-xs">Dossier de financement bancaire</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#2A9D8F]" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}