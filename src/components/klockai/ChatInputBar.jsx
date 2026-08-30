import React from "react";
import { Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NeonButton } from "@/components/ui/neon-button";

export default function ChatInputBar({ inputValue, setInputValue, onSend, onKeyPress, isLoading }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[#1f2228] bg-[#111] px-4 py-3 focus-within:border-[#8fa0f2]/40 transition-colors">
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyPress={onKeyPress}
        placeholder="Écrivez à KlockAI..."
        disabled={isLoading}
        className="flex-1 bg-transparent border-0 text-[#f2f3f5] placeholder:text-[#6a7180] h-12 text-base focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
      />
      <NeonButton
        onClick={onSend}
        disabled={isLoading || !inputValue.trim()}
        variant="default"
        className="inline-flex items-center justify-center disabled:opacity-40"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
        {!isLoading && "Envoyer"}
      </NeonButton>
    </div>
  );
}