import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Send, Loader2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

const AVATAR_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/1ccbb71d2_AlexAI.jpeg";

export default function ChatWidget({ user }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const createNewConversation = async () => {
    try {
      setError(null);
      const newConv = await base44.agents.createConversation({
        agent_name: "klockai",
        metadata: {
          name: `Conversation avec ${user.full_name || user.email}`,
          description: "Chat avec KlockAI"
        }
      });
      setConversation(newConv);
      setMessages(newConv.messages || []);
      
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      
      if (newConv?.id) {
        unsubscribeRef.current = base44.agents.subscribeToConversation(
          newConv.id,
          (data) => {
            setMessages(data.messages || []);
            setIsLoading(false);
          }
        );
      }
      return newConv;
    } catch (error) {
      console.error("Error creating conversation:", error);
      setError("Impossible de créer une nouvelle conversation");
      return null;
    }
  };

  useEffect(() => {
    const initConversation = async () => {
      if (isOpen && !conversation) {
        try {
          setError(null);
          await createNewConversation();
        } catch (error) {
          console.error("Error initializing conversation:", error);
          setError("Erreur lors de l'initialisation");
        }
      }
    };

    initConversation();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !conversation || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);
    setError(null);

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: userMessage
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setError("Erreur lors de l'envoi du message");
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setMessages([]);
    setConversation(null);
    setError(null);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    await createNewConversation();
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Bouton flottant */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <motion.div
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                onClick={() => navigate(createPageUrl("KlockAI"))}
                className="h-auto px-6 py-3 rounded-2xl bg-black/90 hover:bg-black shadow-2xl flex items-center gap-3 backdrop-blur-sm border border-white/10"
              >
                <motion.div
                  animate={{ 
                    boxShadow: [
                      "0 0 0 0 rgba(42, 157, 143, 0.7)",
                      "0 0 0 8px rgba(42, 157, 143, 0)",
                    ],
                  }}
                  transition={{ 
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="text-left"
                >
                  <p className="font-montserrat font-bold text-white text-sm leading-tight">Discutez avec KlockAI</p>
                </motion.div>
              </Button>
            </motion.div>
            <div className="absolute -top-2 -right-2 w-5 h-5 bg-[#2A9D8F] rounded-full animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fenêtre de chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]"
          >
            <Card className="shadow-2xl border-none overflow-hidden flex flex-col h-[600px]">
              {/* Header */}
              <div className="bg-gradient-to-r from-[#2A9D8F] to-[#71CCBA] text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
                    <img 
                      src={AVATAR_URL} 
                      alt="KlockAI"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-montserrat font-bold text-lg">KlockAI</h3>
                    <p className="text-xs text-white/80">Assistant rapide</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleReset}
                    className="text-white hover:bg-white/20"
                    title="Nouvelle conversation"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="text-white hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <p className="text-sm text-red-600">{error}</p>
                    <Button
                      onClick={handleReset}
                      size="sm"
                      className="mt-2 bg-red-600 hover:bg-red-700 text-white"
                    >
                      Réessayer
                    </Button>
                  </div>
                )}

                {messages.length === 0 && !error && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-[#2A9D8F] mx-auto mb-4 shadow-lg">
                      <img 
                        src={AVATAR_URL} 
                        alt="KlockAI"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">KlockAI 👋</h4>
                    <p className="text-sm text-gray-600">
                      Posez-moi vos questions sur l'immobilier commercial
                    </p>
                  </div>
                )}

                {messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-[#2A9D8F] mr-2 flex-shrink-0 shadow-sm">
                        <img 
                          src={AVATAR_URL} 
                          alt="KlockAI"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        message.role === "user"
                          ? "bg-[#2A9D8F] text-white"
                          : "bg-white border border-gray-200"
                      }`}
                    >
                      {message.role === "user" ? (
                        <p className="text-sm">{message.content}</p>
                      ) : (
                        <ReactMarkdown
                          className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0 text-gray-700">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="text-gray-700">{children}</li>,
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-[#2A9D8F] mr-2 shadow-sm">
                      <img 
                        src={AVATAR_URL} 
                        alt="KlockAI"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                      <Loader2 className="w-5 h-5 text-[#2A9D8F] animate-spin" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex gap-2">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Posez votre question..."
                    className="flex-1"
                    disabled={isLoading || !conversation}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isLoading || !conversation}
                    className="bg-gradient-to-r from-[#2A9D8F] to-[#71CCBA] hover:from-[#2A9D8F]/90 hover:to-[#71CCBA]/90"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}