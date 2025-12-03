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

export default function AIAssistantPage() {
  const { currentRestaurant } = useRestaurant();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm your AI restaurant assistant. I can help you with:\n\n• **Sales insights** - Ask about revenue, trends, and forecasts\n• **Inventory** - Check stock levels and get ordering suggestions\n• **Staff** - Review scheduling and performance\n• **Menu** - Analyze profitability and pricing\n• **Operations** - Get daily summaries and recommendations\n\nHow can I help you today?",
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

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !currentRestaurant?.id) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Add streaming placeholder
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
          message: userMessage.content,
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
          ? { ...m, content: "I apologize, but I encountered an error. Please try again.", isStreaming: false }
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
      content: "Chat cleared. How can I help you?",
      timestamp: new Date()
    }]);
  };

  const quickActions = [
    { label: "Daily Summary", prompt: "Give me a summary of today's operations" },
    { label: "Stock Alerts", prompt: "What items are running low on stock?" },
    { label: "Top Sellers", prompt: "What are my best selling dishes this week?" },
    { label: "Staff Schedule", prompt: "Show me the staff schedule for today" },
  ];

  return (
    <RequirePermission resource="ai_features" action="view">
      <PageLayout
        title="AI Assistant"
        description="Chat with your intelligent restaurant assistant"
        action={
          <Button variant="outline" onClick={clearChat} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Clear Chat
          </Button>
        }
      >
        <div className="flex flex-col h-[calc(100vh-220px)] max-h-[700px]">
          {/* Quick Actions */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setInput(action.prompt);
                  inputRef.current?.focus();
                }}
              >
                {action.label}
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
                placeholder="Ask me anything about your restaurant..."
                className="pl-10 pr-4 h-12 bg-card border-border/50"
                disabled={isLoading}
              />
            </div>
            <Button 
              onClick={sendMessage} 
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
