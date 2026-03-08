import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { RequirePermission } from "@/components/RequirePermission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { supabase } from "@/integrations/supabase/client";
import { Send, Bot, User, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

const quickPrompts = [
  { label: "Lowest margin dishes", prompt: "Show my lowest margin dishes and suggest what to do about them" },
  { label: "Location needing attention", prompt: "Which location needs the most attention right now and why?" },
  { label: "Labour issues this week", prompt: "What labour cost issues should I fix this week?" },
  { label: "Stock at risk", prompt: "What stock items are most at risk of running out?" },
  { label: "Weekly performance", prompt: "Summarize this week's overall performance across all locations" },
  { label: "Busiest upcoming day", prompt: "Based on recent trends, which day this week will be busiest?" },
];

export default function AIAssistantPage() {
  const { currentRestaurant } = useRestaurant();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "What would you like to know about your restaurant? I can answer questions about sales, inventory, staffing, menu performance, and daily operations using your actual data.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading || !currentRestaurant?.id) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true
    }]);

    try {
      const response = await supabase.functions.invoke("ai-assistant", {
        body: {
          restaurant_id: currentRestaurant.id,
          message: messageText,
          history: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          }))
        }
      });

      if (response.error) throw response.error;

      setMessages(prev => prev.map(m => 
        m.id === assistantId 
          ? { ...m, content: response.data.response, isStreaming: false }
          : m
      ));
    } catch (error) {
      console.error("AI Assistant error:", error);
      setMessages(prev => prev.map(m => 
        m.id === assistantId 
          ? { ...m, content: "I encountered an error processing your question. Please try again.", isStreaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Chat cleared. What would you like to know?",
      timestamp: new Date()
    }]);
  };

  return (
    <RequirePermission resource="ai_features" action="view">
      <PageLayout
        title="AI Assistant"
        description="Ask questions about your restaurant using real operational data"
        action={
          <Button variant="outline" onClick={clearChat} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Clear Chat
          </Button>
        }
      >
        <div className="flex flex-col h-[calc(100vh-220px)] max-h-[700px]">
          {/* Suggested Prompts */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {quickPrompts.map((qp) => (
              <Button
                key={qp.label}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => sendMessage(qp.prompt)}
                disabled={isLoading}
              >
                {qp.label}
              </Button>
            ))}
          </div>

          {/* Chat Messages */}
          <Card className="flex-1 overflow-hidden bg-card/50 backdrop-blur border-border/50">
            <ScrollArea className="h-full p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3 animate-fade-in",
                      message.role === "user" ? "flex-row-reverse" : ""
                    )}
                  >
                    <Avatar className={cn(
                      "h-8 w-8 shrink-0",
                      message.role === "assistant" 
                        ? "bg-primary/10 ring-1 ring-primary/20" 
                        : "bg-secondary"
                    )}>
                      <AvatarFallback className="bg-transparent">
                        {message.role === "assistant" ? (
                          <Bot className="h-4 w-4 text-primary" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 max-w-[80%] text-sm",
                        message.role === "assistant"
                          ? "bg-muted/50 text-foreground"
                          : "bg-primary text-primary-foreground",
                        message.isStreaming && "animate-pulse"
                      )}
                    >
                      {message.isStreaming && !message.content ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                          {message.content.split('\n').map((line, i) => (
                            <p key={i} className="mb-1 last:mb-0">
                              {line.startsWith('•') ? (
                                <span>{line}</span>
                              ) : line.startsWith('**') ? (
                                <strong>{line.replace(/\*\*/g, '')}</strong>
                              ) : (
                                line
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>

          {/* Input Area */}
          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your restaurant..."
                className="pl-10 pr-4 h-12 bg-card border-border/50"
                disabled={isLoading}
              />
            </div>
            <Button 
              onClick={() => sendMessage()} 
              disabled={!input.trim() || isLoading}
              className="h-12 px-6"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </PageLayout>
    </RequirePermission>
  );
}
