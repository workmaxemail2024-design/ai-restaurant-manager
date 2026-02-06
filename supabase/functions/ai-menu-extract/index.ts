import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedDish {
  name: string;
  category: string;
  price: number | null;
  confidence: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { extractedText, imageBase64, mimeType } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a menu extraction assistant. Your task is to extract dishes from restaurant menus.

For each dish found, extract:
1. name: The dish name (clean it up, remove special characters like *, etc.)
2. category: The menu section/category (e.g., "Appetizers", "Mains", "Desserts", "Beverages", "Sides", "Salads", "Soups", "Pizza", "Pasta", "Sandwiches", "Seafood", "Grills")
3. price: The price as a number (null if not visible or unclear)

Rules:
- Ignore headers, descriptions, and ingredients - focus on dish names
- Group dishes under their menu section headings as the category
- Use common category names if unclear
- Skip modifiers/add-ons/extras
- Price should be a number only (no currency symbols)
- Set confidence: 1.0 for clear items, 0.8 for inferred categories, 0.6 for uncertain`;

    const userContent: any[] = [];
    
    if (imageBase64 && mimeType) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`
        }
      });
      userContent.push({
        type: "text",
        text: "Extract all dishes from this menu image. Return the results."
      });
    } else if (extractedText) {
      userContent.push({
        type: "text",
        text: `Extract all dishes from this menu text:\n\n${extractedText}`
      });
    } else {
      throw new Error("No menu content provided");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_dishes",
              description: "Extract dishes from a menu document",
              parameters: {
                type: "object",
                properties: {
                  dishes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Dish name" },
                        category: { type: "string", description: "Menu category/section" },
                        price: { type: "number", nullable: true, description: "Price as number or null" },
                        confidence: { type: "number", description: "Confidence score 0-1" }
                      },
                      required: ["name", "category", "confidence"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["dishes"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_dishes" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call response from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    return new Response(
      JSON.stringify({ dishes: result.dishes || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Menu extraction error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
