import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, Check, Send, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) textareaRef.current.focus();
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    let userName = "";
    let userEmail = "";
    try {
      const me = await base44.auth.me();
      userName = me?.full_name || "";
      userEmail = me?.email || "";
    } catch {}
    await base44.entities.Suggestion.create({
      contenu: text.trim(),
      client_email: userEmail,
      client_name: userName,
      statut: "nouveau",
    });
    setSending(false);
    setSent(true);
    setText("");
    setTimeout(() => { setSent(false); setIsOpen(false); }, 2000);
  };

  return (
    <motion.div
      className="feedback-widget fixed bottom-6 right-6 z-[9998]"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1, type: "spring", stiffness: 200 }}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-80 bg-[#0a0c0c] border border-[#282b2a] rounded-md shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#242726]">
              <span className="text-[#edeae5] text-sm font-medium">Votre feedback</span>
              <button onClick={() => setIsOpen(false)} className="text-[#edeae5]/30 hover:text-[#edeae5] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {sent ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#35a79b]/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-[#35a79b]" />
                  </div>
                  <p className="text-[#edeae5] text-sm">Merci pour votre retour !</p>
                </div>
              ) : (
                <>
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Décrivez votre suggestion, problème ou idée..."
                    rows={4}
                    className="w-full bg-[#edeae5]/[0.03] border border-[#242726] rounded-md px-3 py-2.5 text-[#edeae5] text-sm placeholder:text-[#edeae5]/20 resize-none focus:outline-none focus:border-[#35a79b]/40 transition-colors"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={!text.trim() || sending}
                    className="mt-3 w-full h-10 bg-[#35a79b]/15 border border-[#35a79b]/30 hover:bg-[#35a79b]/25 text-[#edeae5] rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Envoi..." : "Envoyer"}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => { if (sent) return; setIsOpen(!isOpen); }}
        className={`h-10 rounded-full shadow-lg flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105 ${
          isOpen
            ? "bg-[#35a79b] text-[#edeae5] px-4"
            : "bg-[#0a0c0c] hover:bg-[#171918] text-[#9aa19e] hover:text-[#edeae5] border border-[#303332] px-4"
        }`}
      >
        {isOpen ? <X className="w-4 h-4" /> : <><MessageCircle className="w-4 h-4" /><span className="text-xs">Un problème ?</span></>}
      </button>
    </motion.div>
  );
}