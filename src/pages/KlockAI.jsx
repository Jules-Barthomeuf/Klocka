import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { Loader2, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import ChatInputBar from "@/components/klockai/ChatInputBar";

// Retire tout émoji / pictogramme du texte affiché
const stripEmojis = (text = "") =>
  text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu, "")
    .replace(/[ \t]{2,}/g, " ");

export default function KlockAI() {
  const user = useUser();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef(null);

  const welcomePhrases = [
    "Sur quel projet puis-je vous aider aujourd'hui ?",
    "Parlons de votre prochain investissement.",
    "Une question sur un bien, un bail, une rentabilité ?",
    "Prêt à analyser vos opportunités commerciales.",
    "Que souhaitez-vous explorer aujourd'hui ?",
    "Décrivez-moi votre projet, je m'occupe du reste.",
    "Un secteur, une ville, un rendement à étudier ?",
    "Comment puis-je faire avancer vos projets ?",
  ];
  const welcomePhrase = useMemo(
    () => welcomePhrases[Math.floor(Math.random() * welcomePhrases.length)],
    []
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const initialize = async () => {
      try {
        // Chercher une conversation existante ou en créer une nouvelle
        const existingConversations = await base44.agents.listConversations({
          agent_name: "klockai"
        });
        if (!isMounted) return;

        if (existingConversations && existingConversations.length > 0) {
          const existingConv = existingConversations[0];
          setConversation(existingConv);
          setMessages(existingConv.messages || []);
        } else {
          const newConversation = await base44.agents.createConversation({
            agent_name: "klockai",
            metadata: {
              name: "Conversation KlockAI",
              description: "Discussion avec KlockAI"
            }
          });
          if (!isMounted) return;
          setConversation(newConversation);
          setMessages([]);
        }

        if (isMounted) {
          setIsInitializing(false);
        }
      } catch (error) {
        if (isMounted && error.message !== "Request aborted") {
          console.error("Error initializing:", error);
          setIsInitializing(false);
        }
      }
    };
    initialize();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!conversation?.id) return;

    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      // Check if the last message is complete
      const lastMsg = data.messages?.[data.messages.length - 1];
      if (lastMsg?.role === "assistant" && !lastMsg.is_streaming) {
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [conversation?.id]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !conversation) return;

    const messageText = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Optimistic update
    setMessages(prev => [...prev, { role: "user", content: messageText }]);

    await base44.agents.addMessage(conversation, {
      role: "user",
      content: messageText
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewConversation = async () => {
    setIsInitializing(true);
    const newConversation = await base44.agents.createConversation({
      agent_name: "klockai",
      metadata: {
        name: "Conversation KlockAI",
        description: "Discussion avec KlockAI"
      }
    });
    setConversation(newConversation);
    setMessages([]);
    setIsInitializing(false);
  };

  if (!user) return null;
  
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="relative w-16 h-4 mx-auto mb-4">
            <div className="absolute w-3 h-3 bg-[#2A9D8F] rounded-full animate-[bounce-horizontal_1s_ease-in-out_infinite]"></div>
          </div>
          <style>{`
            @keyframes bounce-horizontal {
              0%, 100% { left: 0; }
              50% { left: calc(100% - 12px); }
            }
          `}</style>
          <p className="text-gray-400">Chargement de KlockAI...</p>
        </div>
      </div>
    );
    }

  const isEmpty = messages.length === 0;

  const welcomeBlock = (
    <div className="text-center mb-8">
      <h2 className="text-2xl font-medium text-white">{welcomePhrase}</h2>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header minimal */}
      <div className="px-4 md:px-8 py-4 flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewConversation}
          className="text-gray-500 hover:text-white hover:bg-white/5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-2" />
          Nouvelle conversation
        </Button>
      </div>

      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 pb-12">
          <div className="w-full max-w-3xl">
            {welcomeBlock}
            <ChatInputBar
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSend={handleSendMessage}
              onKeyPress={handleKeyPress}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className={`flex-1 overflow-y-auto px-4 md:px-8 pb-6 ${isEmpty ? "hidden" : ""}`}>
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message, index) => (
            message.role === "user" ? (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex justify-end"
              >
                <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2.5 bg-white/[0.06] border border-white/10 text-white">
                  <p className="text-sm leading-relaxed">{stripEmojis(message.content)}</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex justify-start"
              >
                <div className="flex-1 min-w-0 rounded-md border border-[#2A9D8F]/25 bg-[#2A9D8F]/[0.06] px-4 py-2.5">
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="my-3 overflow-x-auto rounded-md border border-white/10">
                            <table className="w-full text-sm border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
                        th: ({ children }) => <th className="text-left font-semibold text-white px-3 py-2 border-b border-white/10">{children}</th>,
                        td: ({ children }) => <td className="text-gray-200 px-3 py-2 border-b border-white/[0.06] align-top">{children}</td>,
                        tr: ({ children }) => <tr>{children}</tr>,
                        p: ({ children }) => <p className="mb-2 last:mb-0 text-sm leading-relaxed text-gray-200">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 text-gray-200">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 text-gray-200">{children}</ol>,
                        li: ({ children }) => <li className="text-sm">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-[#71CCBA]">{children}</strong>,
                        h1: ({ children }) => <h1 className="text-lg mb-2 text-white">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base mb-2 text-white">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm mb-1 text-white">{children}</h3>,
                        code: ({ children }) => (
                          <code className="bg-white/5 px-1 py-0.5 rounded text-[#71CCBA] text-xs">{children}</code>
                        ),
                      }}
                    >
                      {stripEmojis(message.content || "")}
                    </ReactMarkdown>
                  </div>

                  {/* Tool calls display */}
                  {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="mt-2">
                      {message.tool_calls.map((toolCall, idx) => (
                        <div key={idx} className="text-xs text-gray-500 flex items-center gap-1.5">
                          {toolCall.status === "running" || toolCall.status === "in_progress" ? (
                            <span className="flex items-center gap-1.5">
                              {[0, 1, 2].map((i) => (
                                <motion.span
                                  key={i}
                                  className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F]"
                                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
                                />
                              ))}
                              <span className="ml-1">Recherche en cours</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F]"></span>
                              Données récupérées
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          ))}

          <AnimatePresence>
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex justify-start"
              >
                <div className="flex items-center gap-1.5 py-3 px-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F]"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area (bas, conversation en cours) */}
      {!isEmpty && (
        <div className="px-4 md:px-8 pb-6 pt-2 bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto">
            <ChatInputBar
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSend={handleSendMessage}
              onKeyPress={handleKeyPress}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}