import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MessageSquare, Send, Loader2, CheckCircle2, Clock, XCircle, CircleDot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import moment from "moment";
import "moment/locale/fr";
moment.locale("fr");

const statutConfig = {
  nouveau: { label: "En attente", color: "bg-gray-500/20 text-gray-300", icon: Clock },
  en_cours: { label: "En cours", color: "bg-blue-500/20 text-blue-300", icon: Loader2 },
  accepte: { label: "Accepté", color: "bg-green-500/20 text-green-300", icon: CheckCircle2 },
  refuse: { label: "Refusé", color: "bg-red-500/20 text-red-300", icon: XCircle },
  termine: { label: "Terminé", color: "bg-[#2A9D8F]/20 text-[#2A9D8F]", icon: CheckCircle2 }
};

export default function Feedback() {
  const user = useUser();
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const queryClient = useQueryClient();

  // Récupérer les suggestions du client
  const { data: mesSuggestions = [] } = useQuery({
    queryKey: ['suggestions', user?.email],
    queryFn: () => base44.entities.Suggestion.filter({ client_email: user.email }, "-created_date"),
    enabled: !!user,
    initialData: []
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    
    try {
      // Créer la suggestion dans la base
      await base44.entities.Suggestion.create({
        client_email: user.email,
        client_name: user.full_name || user.email,
        contenu: feedback,
        statut: "nouveau"
      });

      // Envoyer un email de notification
      await base44.integrations.Core.SendEmail({
        to: "contact@klocka.fr",
        subject: `Nouvelle suggestion de ${user.full_name || user.email}`,
        body: `
          Nouvelle suggestion reçue de: ${user.full_name || user.email}
          Email: ${user.email}
          
          Message:
          ${feedback}
        `
      });

      setFeedback("");
                  setIsSubmitted(true);
                  queryClient.invalidateQueries({ queryKey: ['suggestions'] });

                  setTimeout(() => {
                    setIsSubmitted(false);
                  }, 3000);
    } catch (error) {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  const userEtape = user.etape_actuelle || 1;
  const isAdmin = user.role === "admin";
  const previewClientMode = localStorage.getItem('previewClientMode') === 'true';
  const showAsClient = !isAdmin || previewClientMode;

  // Bloquer l'accès en étape 1
  if (showAsClient && userEtape === 1) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-gradient-to-br from-gray-900 to-black border-[#2A9D8F]/30">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-[#2A9D8F] rounded-full flex items-center justify-center mx-auto mb-6">
              <MessageSquare className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl text-white mb-4">
              Accès en attente
            </h2>
            <p className="text-gray-400 mb-6">
              Cette section sera débloquée par votre conseiller.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-montserrat text-white mb-2">Suggestions</h1>
              <div className="h-0.5 w-32 bg-[#2A9D8F] mb-2"></div>
              <p className="text-gray-400 text-lg">
                Proposez vos idées d'amélioration
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-montserrat text-white">
                  {user.full_name || user.email.split('@')[0]}
                </p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-[#2A9D8F] to-[#71CCBA] rounded-full flex items-center justify-center">
                <span className="text-white font-montserrat text-lg">
                  {(user.full_name || user.email).charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Formulaire de suggestion */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-gray-900 to-black border-[#2A9D8F]/30 hover:border-[#2A9D8F]/60 transition-all duration-300 mb-8">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#2A9D8F]" />
                  Nouvelle suggestion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                                        {isSubmitted ? (
                                          <motion.div
                                            key="success"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            className="text-center py-12"
                                          >
                                            <motion.div
                                              initial={{ scale: 0 }}
                                              animate={{ scale: 1 }}
                                              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                                            >
                                              <CheckCircle2 className="w-20 h-20 text-[#2A9D8F] mx-auto mb-4" />
                                            </motion.div>
                                            <h3 className="text-2xl text-white mb-2">Merci pour votre retour !</h3>
                                            <p className="text-gray-400">Votre suggestion a été enregistrée</p>
                                          </motion.div>
                                        ) : (
                    <motion.form
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onSubmit={handleSubmit}
                      className="space-y-6"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="feedback" className="text-gray-300">
                          Quelle amélioration souhaitez-vous proposer ?
                        </Label>
                        <Textarea
                          id="feedback"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          className="bg-gray-800 border-gray-700 text-white min-h-[150px] resize-none"
                          placeholder="Décrivez votre idée d'amélioration..."
                          disabled={isSubmitting}
                        />
                      </div>

                      <Button
                                                type="submit"
                                                disabled={!feedback.trim() || isSubmitting}
                                                className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 transition-all duration-300"
                                              >
                                                {isSubmitting ? (
                                                  <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Envoi en cours...
                                                  </>
                                                ) : (
                                                  <>
                                                    <Send className="w-4 h-4 mr-2" />
                                                    Envoyer ma suggestion
                                                  </>
                                                )}
                                              </Button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

          {/* Historique des suggestions */}
          {mesSuggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="text-xl font-montserrat text-white mb-4">Mes suggestions</h2>
              <div className="space-y-4">
                {mesSuggestions.map((suggestion) => {
                  const config = statutConfig[suggestion.statut] || statutConfig.nouveau;
                  const Icon = config.icon;
                  return (
                    <Card key={suggestion.id} className="bg-gradient-to-br from-gray-900 to-black border-gray-800">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-gray-300 text-sm mb-2">{suggestion.contenu}</p>
                            <p className="text-xs text-gray-500">
                              {moment(suggestion.created_date).format('DD MMMM YYYY à HH:mm')}
                            </p>
                          </div>
                          <Badge className={`${config.color} flex items-center gap-1`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}