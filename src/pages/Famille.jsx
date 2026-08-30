import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, CheckCircle2, User, ArrowLeft } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const questions = [
  {
    id: "q1_objectif",
    question: "Objectif principal d'investissement",
    options: {
      revenu_rentabilite: "Générer un revenu locatif à forte rentabilité (cashflow)",
      actif_securise: "Acquérir un actif sécurisé et pérenne, pour la retraite et la transmission",
      potentiel_valorisation: "Investir dans un bien avec du potentiel et une valorisation à long terme",
      opportunite_locale: "Exploiter une opportunité liée à une dynamique locale ou sectorielle"
    }
  },
  {
    id: "q2_risque",
    question: "Face à une opportunité avec un fort rendement mais plus incertaine",
    options: {
      eviter: "Évite ce type de projet — conviction sur l'emplacement",
      envisager_garanties: "L'envisage si les risques sont maîtrisés et compensés",
      saisir_chiffres: "Saute sur l'occasion si les chiffres sont convaincants"
    }
  },
  {
    id: "q3_duree",
    question: "Durée de conservation envisagée",
    options: {
      "20plus": "Plus de 20 ans — transmission ou rente longue durée",
      "15_20": "15 à 20 ans avec une certaine souplesse",
      "10_15": "10 à 15 ans — possibilité d'arbitrage"
    }
  },
  {
    id: "q4_localisation",
    question: "Importance de la localisation",
    options: {
      primordiale: "Primordiale — uniquement les emplacements de premier ordre",
      importante: "Importante — sans que ce soit nécessairement premium",
      relative: "Relative — rendement ou potentiel peut compenser"
    }
  },
  {
    id: "q5_zone",
    question: "Préférence de zone d'investissement",
    options: {
      proximite: "À proximité de chez soi",
      connue: "Dans une ville ou région connue",
      france: "Partout en France si les fondamentaux sont solides",
      potentiel: "Là où un potentiel est détecté, même hors-radar"
    }
  },
  {
    id: "q6_activite",
    question: "Importance de l'activité exercée dans le local",
    options: {
      secondaire: "L'activité est secondaire — l'emplacement est prioritaire",
      vigilant: "Vigilant à l'activité, mais compte sur le potentiel de l'emplacement",
      peu_importe: "Peu importe l'activité, si elle assure un bon rendement"
    }
  },
  {
    id: "q7_resume",
    question: "Le plus important dans un investissement",
    options: {
      patrimoine_emplacement: "Un patrimoine solide avec les meilleurs emplacements",
      equilibre: "Le bon équilibre entre emplacement et finance",
      potentiel_valeur: "Le potentiel à venir pour créer de la valeur",
      rendement_immediat: "Un rendement immédiat élevé"
    }
  }
];

const profilLabels = {
  equilibriste: {
    label: "L'équilibriste",
    description: "Recherche le juste milieu entre sécurité et performance. Approche pragmatique et équilibrée.",
    color: "bg-blue-500"
  },
  risk_taker: {
    label: "Risk taker",
    description: "Orienté cashflow et rendement immédiat. N'hésite pas à prendre des risques calculés.",
    color: "bg-red-500"
  },
  collectionneur: {
    label: "Le Collectionneur",
    description: "L'emplacement est roi. Vision patrimoniale long terme, transmission et sécurité.",
    color: "bg-purple-500"
  },
  visionnaire: {
    label: "Le Visionnaire",
    description: "Identifie le potentiel là où d'autres ne le voient pas. Création de valeur à long terme.",
    color: "bg-[#8fa0f2]"
  }
};

export default function Famille() {
  const navigate = useNavigate();
  const user = useUser();

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate(createPageUrl("Dashboard"));
    }
  }, [user, navigate]);

  // Récupérer les IDs depuis l'URL
  const urlParams = new URLSearchParams(window.location.search);
  const userIds = urlParams.get('users')?.split(',') || [];

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user && user.role === 'admin',
    initialData: []
  });

  // Filtrer les utilisateurs sélectionnés
  const selectedUsers = allUsers.filter(u => userIds.includes(u.id));

  // Analyser les points de discorde
  const analyzeDiscord = () => {
    const discords = [];
    const agreements = [];

    questions.forEach(q => {
      const responses = selectedUsers.map(u => ({
        user: u,
        response: u.reponses_questionnaire?.[q.id]
      })).filter(r => r.response);

      if (responses.length < 2) return;

      const uniqueResponses = [...new Set(responses.map(r => r.response))];
      
      if (uniqueResponses.length > 1) {
        discords.push({
          question: q,
          responses: responses.map(r => ({
            user: r.user,
            response: r.response,
            label: q.options[r.response] || r.response
          }))
        });
      } else if (uniqueResponses.length === 1) {
        agreements.push({
          question: q,
          response: uniqueResponses[0],
          label: q.options[uniqueResponses[0]] || uniqueResponses[0]
        });
      }
    });

    return { discords, agreements };
  };

  const { discords, agreements } = analyzeDiscord();

  if (!user || user.role !== 'admin') return null;

  if (selectedUsers.length === 0) {
    return (
      <div className="min-h-screen bg-[#000000] p-6 md:p-10">
        <div className="max-w-7xl mx-auto text-center py-20">
          <Users className="w-16 h-16 text-[#6a7180] mx-auto mb-4" />
          <h2 className="text-2xl text-[#f2f3f5] mb-4">Aucun utilisateur sélectionné</h2>
          <p className="text-[#9298a6] mb-6">Retournez à la gestion des clients pour sélectionner des utilisateurs à comparer.</p>
          <NeonButton
            onClick={() => navigate(createPageUrl("AdminClients"))}
            variant="solid"
            className="inline-flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à la gestion clients
          </NeonButton>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("AdminClients"))}
            className="text-[#9298a6] hover:text-[#f2f3f5] mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <h1 className="text-4xl font-montserrat text-[#f2f3f5] mb-2">
            Comparaison Famille
          </h1>
          <div className="h-0.5 w-32 bg-[#8fa0f2] mb-4"></div>
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map(u => (
              <Badge key={u.id} className="bg-[#8fa0f2]/20 text-[#8fa0f2] border border-[#8fa0f2]/50">
                {u.full_name || u.email}
              </Badge>
            ))}
          </div>
        </div>

        {/* Résumé des profils */}
        <Card className="bg-gradient-to-br from-[#000000] to-black border-[#8fa0f2]/30 mb-6">
          <CardHeader>
            <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
              <User className="w-5 h-5 text-[#8fa0f2]" />
              Profils des investisseurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedUsers.map(u => {
                const profil = profilLabels[u.profil_investisseur];
                return (
                  <div key={u.id} className="p-4 bg-[#0f1114]/50 rounded-lg border border-[#22262d]">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full ${profil?.color || 'bg-[#22262d]'} flex items-center justify-center`}>
                        <span className="text-[#f2f3f5] font-bold">
                          {(u.full_name || u.email).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-[#f2f3f5] font-medium">{u.full_name || "Sans nom"}</p>
                        <p className="text-[#9298a6] text-xs">{u.email}</p>
                      </div>
                    </div>
                    {profil ? (
                      <div className="space-y-2">
                        <Badge className={`${profil.color} text-[#f2f3f5]`}>
                          {profil.label}
                        </Badge>
                        <p className="text-[#9298a6] text-sm">{profil.description}</p>
                      </div>
                    ) : (
                      <p className="text-[#9298a6] text-sm">Profil non défini</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Points de discorde */}
        {discords.length > 0 && (
          <Card className="bg-gradient-to-br from-red-900/20 to-black border-red-500/30 mb-6">
            <CardHeader>
              <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Points de discorde ({discords.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {discords.map((discord, idx) => (
                <div key={idx} className="p-4 bg-[#0f1114]/50 rounded-lg border border-red-500/30">
                  <p className="text-[#f2f3f5] font-medium mb-3">{discord.question.question}</p>
                  <div className="space-y-2">
                    {discord.responses.map((r, rIdx) => (
                      <div key={rIdx} className="flex items-start gap-3 p-2 rounded bg-[#000000]/50">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-400 text-sm font-bold">
                            {(r.user.full_name || r.user.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-[#c9cdd6] text-sm font-medium">{r.user.full_name || r.user.email}</p>
                          <p className="text-[#9298a6] text-sm">{r.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Points d'accord */}
        {agreements.length > 0 && (
          <Card className="bg-gradient-to-br from-[#8fa0f2]/10 to-black border-[#8fa0f2]/30 mb-6">
            <CardHeader>
              <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#8fa0f2]" />
                Points d'accord ({agreements.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {agreements.map((agreement, idx) => (
                <div key={idx} className="p-3 bg-[#0f1114]/50 rounded-lg border border-[#8fa0f2]/30 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#8fa0f2] flex-shrink-0" />
                  <div>
                    <p className="text-[#f2f3f5] text-sm font-medium">{agreement.question.question}</p>
                    <p className="text-[#aab6f5] text-sm">{agreement.label}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tableau comparatif détaillé */}
        <Card className="bg-gradient-to-br from-[#000000] to-black border-[#8fa0f2]/30">
          <CardHeader>
            <CardTitle className="text-[#f2f3f5]">Comparaison détaillée des réponses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#22262d]">
                    <th className="text-left p-3 text-[#9298a6] min-w-[200px]">Question</th>
                    {selectedUsers.map(u => (
                      <th key={u.id} className="text-left p-3 text-[#9298a6] min-w-[150px]">
                        {u.full_name || u.email.split('@')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questions.map(q => {
                    const responses = selectedUsers.map(u => u.reponses_questionnaire?.[q.id]);
                    const uniqueResponses = [...new Set(responses.filter(Boolean))];
                    const hasDiscord = uniqueResponses.length > 1;
                    
                    return (
                      <tr key={q.id} className={`border-b border-[#0f1114] ${hasDiscord ? 'bg-red-900/10' : ''}`}>
                        <td className="p-3 text-[#c9cdd6]">{q.question}</td>
                        {selectedUsers.map(u => {
                          const response = u.reponses_questionnaire?.[q.id];
                          return (
                            <td key={u.id} className="p-3">
                              {response ? (
                                <span className={`text-sm ${hasDiscord ? 'text-red-400' : 'text-[#9298a6]'}`}>
                                  {q.options[response] || response}
                                </span>
                              ) : (
                                <span className="text-[#6a7180]">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}