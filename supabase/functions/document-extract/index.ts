import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "documentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase
      .from("documents")
      .update({ processing_status: "processing" })
      .eq("id", documentId);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);

    if (downloadError || !fileData) {
      await supabase
        .from("documents")
        .update({ processing_status: "failed" })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({ error: "Failed to download file from storage" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mimeType = doc.mime_type || "";
    let extractedText = "";
    let extractedData: Record<string, string> = {};

    try {
      if (mimeType.startsWith("image/")) {
        // For images, use Lovable AI with vision capability
        const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
        
        if (lovableApiKey) {
          // Convert blob to base64
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);
          const dataUrl = `data:${mimeType};base64,${base64}`;

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Extract all text from this image. Also identify key-value pairs like dates, amounts, invoice numbers, supplier names, etc. 
                      
Return your response in this exact format:
---EXTRACTED TEXT---
[Put all extracted text here]
---KEY VALUES---
[Put key-value pairs in format: key: value, one per line]`,
                    },
                    {
                      type: "image_url",
                      image_url: { url: dataUrl },
                    },
                  ],
                },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiResult = await aiResponse.json();
            const content = aiResult.choices?.[0]?.message?.content || "";
            
            // Parse the response
            const textMatch = content.match(/---EXTRACTED TEXT---([\s\S]*?)(?:---KEY VALUES---|$)/);
            const kvMatch = content.match(/---KEY VALUES---([\s\S]*?)$/);
            
            if (textMatch) {
              extractedText = textMatch[1].trim();
            } else {
              extractedText = content;
            }
            
            if (kvMatch) {
              const kvLines = kvMatch[1].trim().split("\n");
              for (const line of kvLines) {
                const colonIndex = line.indexOf(":");
                if (colonIndex > 0) {
                  const key = line.substring(0, colonIndex).trim();
                  const value = line.substring(colonIndex + 1).trim();
                  if (key && value) {
                    extractedData[key] = value;
                  }
                }
              }
            }
          } else {
            extractedText = "[OCR extraction unavailable - AI service error]";
          }
        } else {
          extractedText = "[OCR extraction unavailable - no API key configured]";
        }
      } else if (mimeType === "application/pdf") {
        // For PDFs, use AI to describe/extract if possible
        const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
        
        if (lovableApiKey) {
          // Convert PDF to base64
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);
          const dataUrl = `data:application/pdf;base64,${base64}`;

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Extract all text from this PDF document. Also identify key-value pairs like dates, amounts, invoice numbers, supplier names, totals, etc.
                      
Return your response in this exact format:
---EXTRACTED TEXT---
[Put all extracted text here]
---KEY VALUES---
[Put key-value pairs in format: key: value, one per line]`,
                    },
                    {
                      type: "image_url",
                      image_url: { url: dataUrl },
                    },
                  ],
                },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiResult = await aiResponse.json();
            const content = aiResult.choices?.[0]?.message?.content || "";
            
            // Parse the response
            const textMatch = content.match(/---EXTRACTED TEXT---([\s\S]*?)(?:---KEY VALUES---|$)/);
            const kvMatch = content.match(/---KEY VALUES---([\s\S]*?)$/);
            
            if (textMatch) {
              extractedText = textMatch[1].trim();
            } else {
              extractedText = content;
            }
            
            if (kvMatch) {
              const kvLines = kvMatch[1].trim().split("\n");
              for (const line of kvLines) {
                const colonIndex = line.indexOf(":");
                if (colonIndex > 0) {
                  const key = line.substring(0, colonIndex).trim();
                  const value = line.substring(colonIndex + 1).trim();
                  if (key && value) {
                    extractedData[key] = value;
                  }
                }
              }
            }
          } else {
            extractedText = "[PDF text extraction unavailable - AI service error]";
          }
        } else {
          extractedText = "[PDF text extraction unavailable - no API key configured]";
        }
      } else {
        // For other file types (CSV, XLSX, etc.)
        try {
          extractedText = await fileData.text();
        } catch {
          extractedText = "[Text extraction not supported for this file type]";
        }
      }

      // Update document with extracted data
      await supabase
        .from("documents")
        .update({
          extracted_text: extractedText,
          extracted_data: Object.keys(extractedData).length > 0 ? extractedData : null,
          processing_status: "processed",
        })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({
          success: true,
          extractedText,
          extractedData,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (extractError) {
      console.error("Extraction error:", extractError);
      
      await supabase
        .from("documents")
        .update({ processing_status: "failed" })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({ error: "Text extraction failed", details: String(extractError) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
