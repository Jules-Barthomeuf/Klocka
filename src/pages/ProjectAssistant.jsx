import React, { useState, useEffect, useRef, useCallback } from "react";

import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";

import { ArrowLeft, Send, Plus, Loader2, TrendingUp, Building2, BarChart3, FileText, ArrowUpIcon, Trash2 } from "lucide-react";

import { useNavigate } from "react-router-dom";

import { createPageUrl } from "@/utils";

import ReactMarkdown from 'react-markdown';

import { GlowingEffect } from "@/components/ui/glowing-effect";

import { NeonButton } from "@/components/ui/neon-button";

import { cn } from "@/lib/utils";


const MessageBubble = ({ message }) => {

const isUser = message.role === 'user';

return (

<div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>

{!isUser && (

<div className="h-7 w-7 rounded-lg bg-[#33d6c0]/20 flex items-center justify-center mt-0.5 flex-shrink-0">

<div className="h-1.5 w-1.5 rounded-full bg-[#33d6c0]" />

</div>

)}

<div className={`max-w-[85%] ${isUser && "flex flex-col items-end"}`}>

{message.content && (

<div className={`rounded-md px-4 py-2.5 ${

isUser ? "bg-[#33d6c0] text-white" : "bg-[#101715] border border-[#24312f]"

}`}>

{isUser ? (

<p className="text-sm leading-relaxed">{message.content}</p>

) : (

<ReactMarkdown

className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"

components={{

p: ({ children }) => <p className="my-1 leading-relaxed text-white">{children}</p>,

ul: ({ children }) => <ul className="my-1 ml-4 list-disc text-white">{children}</ul>,

ol: ({ children }) => <ol className="my-1 ml-4 list-decimal text-white">{children}</ol>,

li: ({ children }) => <li className="my-0.5 text-white">{children}</li>,

strong: ({ children }) => <strong className="text-[#5ee7d4]">{children}</strong>,

code: ({ inline, children }) =>

inline ?

<code className="px-1 py-0.5 rounded bg-[#0a0f0e] text-[#5ee7d4] text-xs">{children}</code> :

<code className="block p-2 rounded bg-[#0a0f0e] text-white text-xs">{children}</code>

}}

>

{message.content}

</ReactMarkdown>

)}

</div>

)}

{message.tool_calls?.length > 0 && (

<div className="space-y-1 mt-2">

{message.tool_calls.map((toolCall, idx) => (

<div key={idx} className="text-xs text-[#93aca7] bg-[#101715]/50 px-3 py-1.5 rounded-lg border border-[#24312f]">

🔧 {toolCall.name?.split('.').reverse()[0] || 'Action'}

</div>

))}

</div>

)}

</div>

</div>

);

};


const useAutoResizeTextarea = ({ minHeight, maxHeight }) => {
  const textareaRef = useRef(null);

  const adjustHeight = useCallback(
    (reset) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
};

export default function ProjectAssistant() {

const navigate = useNavigate();

const user = useUser();

const [conversation, setConversation] = useState(null);

const [conversations, setConversations] = useState([]);

const [messages, setMessages] = useState([]);

const [inputValue, setInputValue] = useState("");

const [isLoading, setIsLoading] = useState(false);

const [isInitialized, setIsInitialized] = useState(false);

const [sidebarOpen, setSidebarOpen] = useState(false);

const messagesEndRef = useRef(null);

const { textareaRef, adjustHeight } = useAutoResizeTextarea({
  minHeight: 60,
  maxHeight: 200,
});


const scrollToBottom = () => {

messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

};


useEffect(() => {

scrollToBottom();

}, [messages]);


useEffect(() => {
if (!user) return;
let isMounted = true;

const init = async () => {
try {
// Charger l'historique des conversations
const convList = await base44.agents.listConversations({
agent_name: "projectAssistant",
});
if (!isMounted) return;
setConversations(convList);

// Charger la dernière conversation ou en créer une nouvelle si vide
if (convList.length > 0) {
const lastConv = await base44.agents.getConversation(convList[0].id);
if (!isMounted) return;
setConversation(lastConv);
setMessages(lastConv.messages || []);
} else {
const conv = await base44.agents.createConversation({
agent_name: "projectAssistant",
metadata: {
name: "Nouvelle conversation",
description: "Assistant pour la gestion des projets immobiliers"
}
});
if (!isMounted) return;
setConversation(conv);
setConversations([conv]);
}

setIsInitialized(true);
} catch (error) {
if (isMounted && error.message !== "Request aborted") {
console.error("Erreur lors de l'initialisation:", error);
}
}
};

init();

return () => {
isMounted = false;
};
}, [user]);


useEffect(() => {

if (!conversation) return;


const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {

setMessages(data.messages);

});


return () => unsubscribe();

}, [conversation]);


const handleSend = async () => {

if (!inputValue.trim() || !conversation) return;


const userMessage = inputValue.trim();

setInputValue("");

adjustHeight(true);

setIsLoading(true);


// Optimistic update

const tempUserMessage = { role: "user", content: userMessage };

setMessages(prev => [...prev, tempUserMessage]);


await base44.agents.addMessage(conversation, {

role: "user",

content: userMessage

});


setIsLoading(false);

};


const handleKeyPress = (e) => {

if (e.key === "Enter" && !e.shiftKey) {

e.preventDefault();

handleSend();

}

};


const handleNewConversation = async () => {

const conv = await base44.agents.createConversation({

agent_name: "projectAssistant",

metadata: {

name: "Nouvelle conversation",

description: "Assistant projets"

}

});

setConversation(conv);

setMessages([]);

setConversations(prev => [conv, ...prev]);

};


const loadConversation = async (conv) => {

const fullConv = await base44.agents.getConversation(conv.id);

setConversation(fullConv);

setMessages(fullConv.messages || []);

};


const deleteConversation = async (convId) => {

try {

await base44.agents.deleteConversation(convId);

setConversations(prev => prev.filter(c => c.id !== convId));

if (conversation?.id === convId) {

handleNewConversation();

}

} catch (error) {

console.error("Erreur lors de la suppression:", error);

}

};


if (!isInitialized) {

return (

<div className="flex items-center justify-center min-h-screen bg-[#0a0f0e]">

<div className="relative w-16 h-4">

<div className="absolute w-3 h-3 bg-[#33d6c0] rounded-full animate-[bounce-horizontal_1s_ease-in-out_infinite]"></div>

</div>

<style>{`

@keyframes bounce-horizontal {

0%, 100% { left: 0; }

50% { left: calc(100% - 12px); }

}

`}</style>

</div>

);

}


return (

<div className="min-h-screen bg-[#0a0f0e] flex">

{/* Lumière en haut */}
<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-br from-[#33d6c0] via-indigo-500 to-blue-500 opacity-20 blur-[120px] pointer-events-none" />

<div className="flex-1 transition-all duration-300">

<div className="max-w-5xl mx-auto p-3 md:p-8 relative">

{/* Header */}

<div className="flex items-center justify-between mb-6">

<div className="flex items-center gap-4">

<h1 className="text-3xl max-md:text-2xl font-geist tracking-tighter text-white">

Assistant Klocka

</h1>

</div>

<NeonButton

onClick={handleNewConversation}

variant="default"

size="sm"

>

Nouvelle conversation

</NeonButton>

</div>


{/* Chat Container */}

<div className="relative rounded-[1.25rem] border-[0.75px] border-[#24312f] p-2 md:rounded-[1.5rem] md:p-3">

<GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />

<Card className="relative bg-gradient-to-br from-[#0a0f0e]/95 via-[#33d6c0]/5 to-[#0a0f0e]/95 border-none h-[calc(100vh-180px)] md:h-[calc(100vh-200px)] flex flex-col">

{/* Messages */}

<CardContent className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">

{messages.length === 0 ? (

<div className="flex flex-col items-center justify-center h-full text-center">

<div className="w-16 h-16 bg-[#33d6c0]/20 rounded-full flex items-center justify-center mb-4">

<div className="w-8 h-8 bg-[#33d6c0] rounded-full" />

</div>

<h3 className="text-2xl text-white mb-3 font-geist font-semibold">Comment puis-je vous aider ?</h3>

<p className="text-[#93aca7] text-sm max-w-md mb-8">

Je peux vous aider à gérer vos projets, analyser leur rentabilité, comparer les investissements et plus encore.

</p>

</div>

) : (

<>

{messages.map((message, index) => (

<MessageBubble key={index} message={message} />

))}

{isLoading && (

<div className="flex gap-3 justify-start">

<div className="h-7 w-7 rounded-lg bg-[#33d6c0]/20 flex items-center justify-center mt-0.5">

<Loader2 className="h-4 w-4 text-[#33d6c0] animate-spin" />

</div>

<div className="bg-[#101715] border border-[#24312f] rounded-md px-4 py-2.5">

<p className="text-sm text-[#93aca7]">En train d'analyser...</p>

</div>

</div>

)}

<div ref={messagesEndRef} />

</>

)}

</CardContent>


{/* Input */}

<div className="p-4 md:p-6 bg-[#0a0f0e]/50">

<div className="bg-[#0a0f0e] rounded-md border border-[#24312f]">

<div className="overflow-y-auto">

<Textarea

ref={textareaRef}

value={inputValue}

onChange={(e) => {

setInputValue(e.target.value);

adjustHeight();

}}

onKeyDown={(e) => {

if (e.key === "Enter" && !e.shiftKey) {

e.preventDefault();

handleSend();

}

}}

placeholder="Posez une question sur vos projets..."

className={cn(

"w-full px-4 py-3",

"resize-none",

"bg-transparent",

"border-none",

"text-white text-sm",

"focus:outline-none",

"focus-visible:ring-0 focus-visible:ring-offset-0",

"placeholder:text-[#7f9995] placeholder:text-sm",

"min-h-[60px]"

)}

style={{ overflow: "hidden" }}

disabled={isLoading}

/>

</div>


<div className="flex items-center justify-between px-3 pb-3">

<div className="flex-1" />

<button

type="button"

onClick={handleSend}

disabled={!inputValue.trim() || isLoading}

className={cn(

"px-2 py-2 rounded-lg text-sm transition-all",

inputValue.trim() && !isLoading

? "bg-[#33d6c0] text-white hover:bg-[#33d6c0]/90"

: "bg-[#101715] text-[#7f9995] cursor-not-allowed"

)}

>

{isLoading ? (

<Loader2 className="w-4 h-4 animate-spin" />

) : (

<ArrowUpIcon className="w-4 h-4" />

)}

</button>

</div>

</div>


{/* Action Buttons - Only show when no messages */}

{messages.length === 0 && (

<div className="flex flex-wrap items-center justify-center gap-2 mt-4 px-1">

<button

onClick={() => {

setInputValue("Quels sont mes projets en cours d'analyse ?");

adjustHeight();

}}

className="flex items-center gap-2 px-4 py-2 bg-[#0a0f0e] hover:bg-[#101715] rounded-full border border-[#24312f] text-[#93aca7] hover:text-white transition-colors"

>

<Building2 className="w-4 h-4" />

<span className="text-xs">Projets en analyse</span>

</button>

<button

onClick={() => {

setInputValue("Quel projet a la meilleure rentabilité ?");

adjustHeight();

}}

className="flex items-center gap-2 px-4 py-2 bg-[#0a0f0e] hover:bg-[#101715] rounded-full border border-[#24312f] text-[#93aca7] hover:text-white transition-colors"

>

<TrendingUp className="w-4 h-4" />

<span className="text-xs">Meilleure rentabilité</span>

</button>

<button

onClick={() => {

setInputValue("Compare les projets signés");

adjustHeight();

}}

className="flex items-center gap-2 px-4 py-2 bg-[#0a0f0e] hover:bg-[#101715] rounded-full border border-[#24312f] text-[#93aca7] hover:text-white transition-colors"

>

<BarChart3 className="w-4 h-4" />

<span className="text-xs">Comparer les projets</span>

</button>

<button

onClick={() => {

setInputValue("Donne-moi un résumé des projets par statut");

adjustHeight();

}}

className="flex items-center gap-2 px-4 py-2 bg-[#0a0f0e] hover:bg-[#101715] rounded-full border border-[#24312f] text-[#93aca7] hover:text-white transition-colors"

>

<FileText className="w-4 h-4" />

<span className="text-xs">Résumé par statut</span>

</button>

</div>

)}

</div>

</Card>

</div>

</div>

</div>

</div>

);

}