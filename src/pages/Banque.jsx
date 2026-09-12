import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Loader2, Download, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/components/providers/UserProvider";
import SlideViewer from "@/components/banque/SlideViewer";
import SlideRenderer from "@/components/banque/SlideRenderer";

export default function Banque() {
  const user = useUser();
  const [viewPres, setViewPres] = useState(null);

  const { data: presentations = [], isLoading } = useQuery({
    queryKey: ["my-presentations-bancaires", user?.email],
    queryFn: async () => {
      const all = await base44.entities.PresentationBancaire.filter({ client_email: user.email, statut: "publie" }, "-created_date");
      return all;
    },
    enabled: !!user?.email,
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-fond text-encre p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 max-md:mb-6">
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-encre m-0">Banque</h1>
          <p className="text-[13.5px] leading-[1.7] text-ardoise mt-2 mb-0">Les présentations bancaires préparées pour vos projets.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-menthe" />
          </div>
        ) : presentations.length === 0 ? (
          <div className="border-t border-encre/[0.35] pt-10 pb-16 text-center">
            <Landmark className="w-8 h-8 text-encre/15 mx-auto mb-5" />
            <h2 className="text-[22px] font-light text-encre mb-2">Aucune présentation disponible</h2>
            <p className="text-ardoise text-sm mb-0">Votre conseiller vous préparera une présentation bancaire pour vos projets.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {presentations.map((pres) => {
              const coverSlide = pres.slides?.[0];
              return (
                <button
                  key={pres.id}
                  onClick={() => setViewPres(pres)}
                  className="text-left bg-surface border border-encre/[0.12] overflow-hidden hover:border-menthe/60 transition-colors group"
                >
                  {/* Slide preview thumbnail */}
                  <div className="relative w-full aspect-video overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 origin-top-left" style={{ transform: 'scale(0.5)', width: '200%', height: '200%' }}>
                      {coverSlide ? (
                        <SlideRenderer slide={coverSlide} />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-black to-fond flex items-center justify-center">
                          <Landmark className="w-12 h-12 text-bord-vif" />
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                  {/* Info bar */}
                  <div className="p-4">
                   <p className="text-encre font-light text-lg truncate">{pres.project_title}</p>
                   <div className="flex items-center justify-between mt-1">
                     <p className="text-ardoise text-xs">{pres.slides?.length || 0} slides — {new Date(pres.created_date).toLocaleDateString('fr-FR')}</p>
                     <p className="text-menthe text-xs group-hover:underline">Voir →</p>
                   </div>
                   {pres.pptx_url && (
                     <a
                       href={pres.pptx_url}
                       target="_blank"
                       rel="noopener noreferrer"
                       onClick={(e) => e.stopPropagation()}
                       className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-menthe/10 border border-menthe/20 hover:bg-menthe/20 transition-colors w-fit"
                     >
                       <ExternalLink className="w-3.5 h-3.5 text-menthe" />
                       <span className="text-menthe text-xs font-medium">Ouvrir la présentation (Google Slides)</span>
                     </a>
                   )}
                  </div>
                  </button>
              );
            })}
          </div>
        )}

        {/* Viewer dialog */}
        <Dialog open={!!viewPres} onOpenChange={() => setViewPres(null)}>
          <DialogContent className="max-w-4xl p-0 bg-fond border-trait overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="text-encre font-light">{viewPres?.project_title}</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-4">
              {viewPres?.slides && (
                <SlideViewer slides={viewPres.slides} title={viewPres.project_title} />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}