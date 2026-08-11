import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ArrowRight, ArrowLeft, Users, Plus, X } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";

const questions = [
  {
    id: "nom_complet",
    question: "Pour commencer, quel est votre nom complet ?",
    type: "text",
    placeholder: "Jean Dupont"
  },
  {
    id: "q1_objectif",
    question: "Quel est votre objectif principal dans votre investissement en immobilier commercial ?",
    options: [
      { value: "revenu_rentabilite", label: "Générer un revenu locatif à forte rentabilité (cashflow)" },
      { value: "actif_securise", label: "Acquérir un actif sécurisé et pérenne, pour ma retraite et ma transmission" },
      { value: "potentiel_valorisation", label: "Investir dans un bien avec du potentiel et une valorisation à long terme" },
      { value: "opportunite_locale", label: "Exploiter une opportunité liée à une dynamique locale ou sectorielle, avec une logique de création de valeur" }
    ]
  },
  {
    id: "q2_risque",
    question: "Face à une opportunité avec un fort rendement mais plus incertaine, vous…",
    options: [
      { value: "eviter", label: "Évitez ce type de projet — ma conviction est l'emplacement, l'emplacement, et l'emplacement" },
      { value: "envisager_garanties", label: "L'envisagez si les risques sont maîtrisés et compensés par d'autres garanties" },
      { value: "saisir_chiffres", label: "Sautez sur l'occasion si les chiffres sont convaincants et l'effet levier intéressant" }
    ]
  },
  {
    id: "q3_duree",
    question: "Quelle est la durée sur laquelle vous envisagez de conserver votre bien ?",
    options: [
      { value: "20plus", label: "Plus de 20 ans — transmission ou rente longue durée" },
      { value: "15_20", label: "15 à 20 ans avec une certaine souplesse" },
      { value: "10_15", label: "10 à 15 ans — possibilité d'arbitrage" }
    ]
  },
  {
    id: "q4_localisation",
    question: "À quel point la localisation du bien est-elle un critère pour vous ?",
    options: [
      { value: "primordiale", label: "Primordiale — uniquement les emplacements de premier ordre" },
      { value: "importante", label: "Importante — sans que ce soit nécessairement premium" },
      { value: "relative", label: "Relative — rendement ou potentiel peut compenser un emplacement secondaire" }
    ]
  },
  {
    id: "q5_zone",
    question: "Vous préférez investir…",
    options: [
      { value: "proximite", label: "À proximité de chez vous" },
      { value: "connue", label: "Dans une ville ou région que vous connaissez bien" },
      { value: "france", label: "Partout en France si les fondamentaux du projet sont solides" },
      { value: "potentiel", label: "Là où un potentiel est détecté, même hors-radar" }
    ]
  },
  {
    id: "q6_activite",
    question: "Quel niveau d'importance accordez-vous à l'activité exercée dans le local ?",
    options: [
      { value: "secondaire", label: "L'activité est secondaire — l'emplacement reste ma priorité absolue" },
      { value: "vigilant", label: "Vigilant à l'activité, mais je compte sur le potentiel de l'emplacement" },
      { value: "peu_importe", label: "Peu importe l'activité, si elle m'assure un bon niveau de rendement" }
    ]
  },
  {
    id: "q7_resume",
    question: "En résumé le plus important pour vous dans un investissement c'est…",
    options: [
      { value: "patrimoine_emplacement", label: "Un patrimoine solide avec les meilleurs emplacements" },
      { value: "equilibre", label: "Le bon équilibre entre emplacement et finance" },
      { value: "potentiel_valeur", label: "Le potentiel à venir pour créer de la valeur" },
      { value: "rendement_immediat", label: "Un rendement immédiat élevé, le reste on verra plus tard" }
    ]
  }
];

const profilsInfo = {
  equilibriste: {
    nom: "L'équilibriste : le chercheur d'équilibre",
    description: "Vous recherchez le juste milieu entre sécurité et performance. Vous privilégiez un bon emplacement tout en restant attentif à la rentabilité. Votre approche est pragmatique et équilibrée.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/4021d9836_Gemini_Generated_Image_vgo6wsvgo6wsvgo6.png"
  },
  risk_taker: {
    nom: "Risk taker : L'investisseur offensif",
    description: "Vous êtes orienté cashflow et rendement immédiat. Vous n'hésitez pas à prendre des risques calculés si les chiffres sont au rendez-vous. L'effet de levier et la rentabilité sont vos priorités.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/c9f0ec7e6_risktaker.png"
  },
  collectionneur: {
    nom: "Le Collectionneur : L'amoureux de la Belle Pierre",
    description: "Pour vous, l'emplacement est roi. Vous privilégiez les actifs de qualité dans les meilleurs emplacements, avec une vision patrimoniale long terme. La transmission et la sécurité sont essentielles.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/ec897eb44_collectionneur.png"
  },
  visionnaire: {
    nom: "Le Visionnaire : Le Stratège du potentiel",
    description: "Vous savez identifier le potentiel là où d'autres ne le voient pas. Vous misez sur la création de valeur et la transformation. Votre vision à long terme vous permet de saisir des opportunités uniques.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/55107ab45_Gemini_Generated_Image_o65zqho65zqho65z.png"
  }
};

export default function Questionnaire() {
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [reponses, setReponses] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [profil, setProfil] = useState(null);
  const [partnerEmails, setPartnerEmails] = useState([]);
  const [newPartnerEmail, setNewPartnerEmail] = useState("");

  useEffect(() => {
    // Ne pas rediriger automatiquement - permettre l'accès au questionnaire
  }, []);

  const determinerProfil = (reponses) => {
    const scores = {
      collectionneur: 0,
      equilibriste: 0,
      visionnaire: 0,
      risk_taker: 0
    };

    if (reponses.q1_objectif === "actif_securise") scores.collectionneur += 3;
    if (reponses.q1_objectif === "potentiel_valorisation") scores.visionnaire += 3;
    if (reponses.q1_objectif === "revenu_rentabilite") scores.risk_taker += 3;
    if (reponses.q1_objectif === "opportunite_locale") scores.visionnaire += 2;

    if (reponses.q2_risque === "eviter") scores.collectionneur += 3;
    if (reponses.q2_risque === "envisager_garanties") scores.equilibriste += 2;
    if (reponses.q2_risque === "saisir_chiffres") scores.risk_taker += 3;

    if (reponses.q4_localisation === "primordiale") scores.collectionneur += 3;
    if (reponses.q4_localisation === "importante") scores.equilibriste += 2;
    if (reponses.q4_localisation === "relative") scores.risk_taker += 2;

    if (reponses.q7_resume === "patrimoine_emplacement") scores.collectionneur += 4;
    if (reponses.q7_resume === "equilibre") scores.equilibriste += 4;
    if (reponses.q7_resume === "potentiel_valeur") scores.visionnaire += 4;
    if (reponses.q7_resume === "rendement_immediat") scores.risk_taker += 4;

    const maxScore = Math.max(...Object.values(scores));
    return Object.keys(scores).find(key => scores[key] === maxScore);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleAddPartner = () => {
    if (newPartnerEmail.trim() && !partnerEmails.includes(newPartnerEmail.trim())) {
      setPartnerEmails([...partnerEmails, newPartnerEmail.trim()]);
      setNewPartnerEmail("");
    }
  };

  const handleRemovePartner = (email) => {
    setPartnerEmails(partnerEmails.filter(e => e !== email));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const profilDetermine = determinerProfil(reponses);
    setProfil(profilDetermine);

    try {
      await base44.auth.updateMe({
        full_name: reponses.nom_complet,
        questionnaire_complete: true,
        reponses_questionnaire: reponses,
        profil_investisseur: profilDetermine,
        comptes_lies: partnerEmails.length > 0 ? partnerEmails : []
      });

      setShowResult(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const CALENDLY_URL = "https://calendly.com/paul-dezulueta-klocka/definition-de-la-strategie-45";

  const handleContinue = () => {
    navigate(createPageUrl("Dashboard"));
  };

  const progress = ((currentQuestion + 1) / questions.length) * 100;
  const question = questions[currentQuestion];
  const isLastQuestion = currentQuestion === questions.length - 1;
  const canProceed = question.type === "text" 
    ? reponses[question.id]?.trim()
    : reponses[question.id];
  const questionNumber = currentQuestion + 1;
  const totalQuestions = questions.length;

  if (showResult && profil) {
    const profilInfo = profilsInfo[profil];
    const CALENDLY_URL = "https://calendly.com/paul-dezulueta-klocka/definition-de-la-strategie-45";

    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full border-[#2A9D8F]/30 bg-gradient-to-br from-gray-900 to-black shadow-2xl">
          <CardHeader className="pb-6 border-b border-gray-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 text-center">
                <div className="w-12 h-12 mx-auto mb-2 bg-[#2A9D8F] rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-2xl max-md:text-xl font-montserrat text-white">
                  Votre profil investisseur
                </CardTitle>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <img 
                src={profilInfo.image} 
                alt={profilInfo.nom}
                className="w-64 h-64 max-md:w-48 max-md:h-48 mx-auto object-cover rounded-2xl shadow-lg border-2 border-[#2A9D8F]"
              />

              <h2 className="text-2xl max-md:text-xl text-[#2A9D8F]">
                {profilInfo.nom}
              </h2>

              <p className="text-gray-300 leading-relaxed text-lg max-md:text-base">
                {profilInfo.description}
              </p>

              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full mt-6"
              >
                <NeonButton
                  variant="default"
                  className="w-full text-base inline-flex items-center justify-center"
                >
                  Prendre rendez-vous
                  <ArrowRight className="w-4 h-4 ml-2" />
                </NeonButton>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 max-md:p-3">
      <Card className="max-w-3xl w-full border-[#2A9D8F]/30 bg-gradient-to-br from-gray-900 to-black shadow-2xl">
        <CardHeader className="space-y-4 pb-8 max-md:pb-6 max-md:space-y-3 border-b border-gray-800">
          <div className="flex justify-between items-center max-md:flex-col max-md:items-start max-md:gap-2">
            <CardTitle className="text-3xl max-md:text-xl text-white">
              {currentQuestion === 0 ? "Bienvenue chez Klocka !" : "Questionnaire initial"}
            </CardTitle>
            <div className="text-sm max-md:text-xs font-medium text-gray-400">
              Question {questionNumber} / {totalQuestions}
            </div>
          </div>
          <Progress value={progress} className="h-2 max-md:h-1.5 bg-gray-800" />
        </CardHeader>
        
        <CardContent className="space-y-8 max-md:space-y-6 p-8 max-md:p-4">
          <div className="space-y-6 max-md:space-y-4">
            <h2 className="text-xl max-md:text-base font-semibold text-white leading-relaxed">
              {question.question}
            </h2>
            
            {question.type === "text" ? (
              <div className="space-y-6">
                <Input
                  placeholder={question.placeholder}
                  value={reponses[question.id] || ""}
                  onChange={(e) => setReponses({ ...reponses, [question.id]: e.target.value })}
                  className="h-12 max-md:h-10 text-lg max-md:text-base bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 focus:border-[#2A9D8F] focus:ring-[#2A9D8F]"
                  autoFocus
                />
                
                {/* Section partenaire - uniquement sur la première question */}
                {question.id === "nom_complet" && (
                  <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#2A9D8F]" />
                      <Label className="text-white font-medium">Investir à deux ? (optionnel)</Label>
                    </div>
                    <p className="text-gray-400 text-sm">
                      Ajoutez l'email de votre partenaire pour qu'il ait accès à tous vos projets.
                    </p>
                    
                    {partnerEmails.length > 0 && (
                      <div className="space-y-2">
                        {partnerEmails.map((email) => (
                          <div key={email} className="flex items-center justify-between p-2 bg-[#2A9D8F]/10 rounded-lg border border-[#2A9D8F]/30">
                            <span className="text-white text-sm">{email}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePartner(email)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="email@partenaire.com"
                        value={newPartnerEmail}
                        onChange={(e) => setNewPartnerEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPartner())}
                        className="flex-1 bg-gray-900 border-gray-700 text-white"
                      />
                      <Button
                        type="button"
                        onClick={handleAddPartner}
                        disabled={!newPartnerEmail.trim()}
                        variant="outline"
                        className="border-[#2A9D8F] text-[#2A9D8F] hover:bg-[#2A9D8F]/10"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <RadioGroup
                value={reponses[question.id]}
                onValueChange={(value) => setReponses({ ...reponses, [question.id]: value })}
                className="space-y-3"
              >
                {question.options.map((option) => (
                  <div
                    key={option.value}
                    className={`flex items-start space-x-3 p-5 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md ${
                      reponses[question.id] === option.value
                        ? 'border-[#2A9D8F] bg-[#2A9D8F]/20'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-900'
                    }`}
                    onClick={() => setReponses({ ...reponses, [question.id]: option.value })}
                  >
                    <RadioGroupItem value={option.value} id={option.value} className="mt-1 border-gray-600" />
                    <Label 
                      htmlFor={option.value} 
                      className="flex-1 cursor-pointer text-base font-medium leading-relaxed text-gray-200"
                    >
                      {option.label}
                    </Label>
                    {reponses[question.id] === option.value && (
                      <CheckCircle2 className="w-5 h-5 text-[#2A9D8F] flex-shrink-0" />
                    )}
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>

          <div className="flex justify-between gap-4 max-md:gap-2 pt-6 max-md:pt-4 border-t border-gray-800">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
              className="px-8 max-md:px-4 max-md:text-sm border-gray-700 text-white hover:bg-gray-800"
            >
              Précédent
            </Button>

            {!isLastQuestion ? (
              <NeonButton
                onClick={handleNext}
                disabled={!canProceed}
                variant="default"
                className="px-8 max-md:px-4 max-md:text-sm"
              >
                Suivant
              </NeonButton>
            ) : (
              <NeonButton
                onClick={handleSubmit}
                disabled={!canProceed || isSubmitting}
                variant="default"
                className="px-8 max-md:px-4 max-md:text-sm"
              >
                {isSubmitting ? "En cours..." : "Terminer"}
              </NeonButton>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}