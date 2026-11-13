import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller, userHasPermission, userCanAccessLocation, unauthorized } from "../_shared/posAuth.ts";
import { parseCaptivaJournalResponse } from "../_shared/captivaJournal.ts";
import { toCaptivaProductTotals } from "../_shared/captivaProductTotals.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ENDPOINT = "https://mycaptivaserver001.azurewebsites.net/CaptivaCloudAPIRequest.ashx";
const MS_PER_DAY = 86400000;
const MAX_DAYS_PER_REQUEST = 5;
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
type AnyRecord = Record<string, unknown>;
type Client = ReturnType<typeof createClient>;

function reply(value: AnyRecord, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function rec(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}
function iso(value: unknown): string {
  const input = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(Date.parse(input + "T00:00:00Z")) ||
      new Date(input + "T00:00:00Z").toISOString().slice(0,10) !== input) {
    throw Error("Invalid date; use yyyy-MM-dd");
  }
  return input;
}
function daysBetween(start: string, end: string): string[] {
  const first = Date.parse(start + "T00:00:00Z"), last = Date.parse(end + "T00:00:00Z");
  if (last < first || (last-first)/MS_PER_DAY+1 > MAX_DAYS_PER_REQUEST) {
    throw Error("Each Captiva fetch must cover 1–5 days; larger ranges are fetched in separate batches.");
  }
  const dates: string[] = [];
  for(let at=first;at<=last;at+=MS_PER_DAY) dates.push(new Date(at).toISOString().slice(0,10));
  return dates;
}
function captivaDate(date: string): string {
  const [y,m,d] = date.split("-").map(Number);
  return `${String(d).padStart(2,"0")}/${MONTHS[m-1]}/${y}`;
}
function normalizeReturnedDate(value: unknown): string {
  const match = String(value??"").match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[\s/-](\d{4})$/);
  if (!match) throw Error("Captiva returned an unexpected trading date");
  const month=MONTHS.indexOf(match[2].toLowerCase());
  if (month<0) throw Error("Invalid Captiva trading month");
  return iso(`${match[3]}-${String(month+1).padStart(2,"0")}-${match[1].padStart(2,"0")}`);
}
function cents(v: unknown): number {
  const value=Number(v);
  if (!Number.isFinite(value) || value<0) throw Error("Invalid Captiva financial amount");
  return Math.round(value * 100);
}
function nonnegativeCount(v: unknown): number {
  const count=Number(v);
  if (!Number.isSafeInteger(count) || count<0) throw Error("Invalid Captiva count");
  return count;
}
async function callCaptiva(userId: string, password: string, request: string, stores: string[], params: AnyRecord = {}): Promise<AnyRecord> {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 25000);
  try {
    const response=await fetch(ENDPOINT, {
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({
        api_userid:userId, api_pass:password, api_request:request,
        stores:stores.map(id=>({id})),...params,
      }),
      signal:controller.signal,
    });
    if (!response.ok) throw Error(`Captiva HTTP ${response.status}`);
    const body=rec(await response.json());
    if (String(body.result).toLowerCase() !== "success") {
      const code=String(body.resultcode??"unknown");
      // Only return Captiva's error code: API debug fields may contain sensitive info.
      throw Error(`Captiva request ${request} rejected (code ${code})`);
    }
    return body;
  } finally { clearTimeout(timer); }
}
async function exists(query: PromiseLike<{data:unknown;error:unknown}>): Promise<boolean> {
  const {data,error}=await query;
  if (error) throw Error("Could not verify existing sales/import coverage");
  return Array.isArray(data) && data.length>0;
}
async function sourceCollision(client: Client, restaurant: string, location: string, date: string): Promise<string|null> {
  // Never restage a date that already has any applied sale (even Captiva API).
  // Replacements must be handled through an explicitly reviewed reconciliation flow.
  const existingSales=await client.from("sales").select("id,source")
    .eq("restaurant_id",restaurant).eq("location_id",location)
    .eq("sale_date",date).limit(1);
  if (await exists(existingSales)) return "Sales already recorded for this date (XLS/API/manual); no duplicate import permitted";
  const xlsStage=await client.from("pos_sales_import").select("id")
    .eq("restaurant_id",restaurant).eq("location_id",location)
    .eq("mapped_sale_date",date).eq("pos_provider","captiva_xls").limit(1);
  if (await exists(xlsStage)) return "Captiva XLS import already staged for this date";
  const xlsSummary=await client.from("pos_daily_summaries").select("id")
    .eq("restaurant_id",restaurant).eq("location_id",location)
    .eq("report_date",date).eq("pos_provider","captiva_xls").limit(1);
  if (await exists(xlsSummary)) return "Captiva XLS financial summary already exists for this date";
  // Any existing daily control/revenue source needs a human reconciliation.
  const anySummary=await client.from("pos_daily_summaries").select("id")
    .eq("restaurant_id",restaurant).eq("location_id",location)
    .eq("report_date",date).neq("pos_provider","captiva").limit(1);
  if (await exists(anySummary)) return "Existing financial summary from another import source";
  const ledger=await client.from("daily_ledger_entries")
    .select("is_closed,manual_revenue")
    .eq("restaurant_id",restaurant).eq("entry_date",date)
    .or(`location_id.eq.${location},location_id.is.null`);
  if (ledger.error) throw Error("Could not verify manual revenue or closed-day status");
  if ((ledger.data??[]).some(l=>l.is_closed)) return "Trading day is closed";
  if ((ledger.data??[]).some(l=>l.manual_revenue!=null && Number(l.manual_revenue)!==0)) {
    return "Manual daily revenue already exists and requires reconciliation";
  }
  return null;
}
async function mappedCatalogue(client: Client, restaurant: string, location: string) {
  const [native,legacy,legacyDishes]=await Promise.all([
    client.from("external_pos_items").select("external_item_id,external_item_name,mapped_dish_id")
      .eq("restaurant_id",restaurant).eq("location_id",location).eq("pos_provider","captiva"),
    client.from("external_pos_items").select("external_item_id,external_item_name,mapped_dish_id")
      .eq("restaurant_id",restaurant).eq("location_id",location).eq("pos_provider","captiva_xls"),
    client.from("dishes").select("id,name,captiva_external_id")
      .eq("restaurant_id",restaurant).eq("location_id",location).not("captiva_external_id","is",null),
  ]);
  if (native.error||legacy.error||legacyDishes.error) throw Error("Could not read product mapping catalogue");
  const current=new Map((native.data??[]).map(x=>[x.external_item_id,x]));
  const old=new Map<string,string|null>();
  for (const row of legacy.data??[]) {
    if (row.mapped_dish_id) old.set(`${row.external_item_id}\u0000${row.external_item_name}`,row.mapped_dish_id);
  }
  for (const row of legacyDishes.data??[]) {
    if (row.captiva_external_id && !old.has(`${row.captiva_external_id}\u0000${row.name}`)) {
      old.set(`${row.captiva_external_id}\u0000${row.name}`,row.id);
    }
  }
  return {current,old};
}
async function hashBatch(value: unknown): Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders});
  if(req.method!=="POST") return reply({success:false,error:"POST required"},405);
  const caller=await resolveCaller(req);
  if(caller.kind==="none") return unauthorized(caller.reason,corsHeaders);
  try{
    const body=await req.json();
    const integrationId=String(body.integration_id??"");
    const locationId=String(body.location_id??"");
    const start=iso(body.date_from), end=iso(body.date_to);
    const dates=daysBetween(start,end);
    // Preview is the default; stage only after a separate explicit confirmation.
    const stage=body.preview_only===false && body.stage_confirmed===true;
    if(body.auto_apply===true) return reply({success:false,error:"Automatic apply is disabled until product reconciliation is confirmed"},409);

    const client=createClient(Deno.env.get("SUPABASE_URL")??"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"");
    const {data:integration,error:integrationError}=await client.from("pos_integrations").select("*")
      .eq("id",integrationId).single();
    if(integrationError||!integration||integration.pos_provider!=="captiva"||integration.location_id!==locationId){
      return reply({success:false,error:"Captiva integration not found or location mismatch"},404);
    }
    if(caller.kind==="user"){
      const permitted=!!integration.restaurant_id&&await userHasPermission(client,caller.userId, integration.restaurant_id,"pos","edit");
      if(!permitted||!await userCanAccessLocation(client,caller.userId,integration.restaurant_id,locationId)){
        return unauthorized("Not authorised for this integration/location",corsHeaders,403);
      }
    }
    const restaurant=String(integration.restaurant_id??"");
    if(!restaurant) throw Error("Integration has no restaurant");
    const settings=rec(integration.settings);
    const apiUserId=String(settings.api_key??"");
    const password=String(settings.api_password??settings.password??"");
    const storeId=String(settings.store_id??"");
    if(!apiUserId||!password||!/^\d{5}$/.test(storeId)) throw Error("Missing Captiva API credentials or store ID");
    if(Deno.env.get("SIMULATE_CAPTIVA")==="true") throw Error("Simulation mode enabled: real Captiva sync is disabled.");

    const {current,old}=await mappedCatalogue(client,restaurant,locationId);
    const dashboardResponse=await callCaptiva(apiUserId,password,"get_api_stores_dashboard",[storeId],{
      start_date:captivaDate(start),end_date:captivaDate(end),
    });
    const store=(Array.isArray(dashboardResponse.stores)?dashboardResponse.stores:[])
      .map(rec).find(s=>String(s.storeid)===storeId);
    if(!store||!Array.isArray(store.dashboards)) throw Error("Captiva dashboard returned no authorised store data");

    const results: AnyRecord[]=[];
    const prepared: Array<{date:string;products:ReturnType<typeof toCaptivaProductTotals>; gross:number;net:number;vat:number;orders:number;visitors:number;batch:string;mapping:Map<string,string|null>}>=[];
    for(const date of dates) {
      const dash=store.dashboards.map(rec).find(d=>normalizeReturnedDate(d.dashdate)===date);
      if(!dash||String(dash.status).toLowerCase()!=="data"||!rec(dash.report).kpis){
        results.push({date,status:"no_data",message:"No completed dashboard data for this date"});
        continue;
      }
      if(normalizeReturnedDate(dash.journal_date)!==date) throw Error(`Dashboard journal date mismatch for ${date}`);
      const kpis=rec(rec(dash.report).kpis);
      const gross=cents(kpis.gross_all_sales), net=cents(kpis.total_all_net_sales),vat=cents(kpis.total_all_vat);
      const orders=nonnegativeCount(kpis.total_all_std_orders),visitors=nonnegativeCount(kpis.total_all_visitors);
      if(Math.abs(gross-(net+vat))>1) throw Error(`Dashboard VAT totals inconsistent for ${date}`);
      const journalResponse=await callCaptiva(apiUserId,password,"get_api_store_journal",[storeId],{
        start_date:captivaDate(date),
      });
      const journal=parseCaptivaJournalResponse(journalResponse,storeId,date);
      if(journal.gross_cents!==gross || Math.abs(journal.net_cents-net)>1 ||
          Math.abs(journal.vat_cents-vat)>1 || journal.receipts!==orders){
        throw Error(`Journal does not reconcile to dashboard for ${date}; nothing staged`);
      }
      const products=toCaptivaProductTotals(journal);
      // The sales.quantity column is integral. Do not silently round fractional
      // quantities or negative voids into misleading product-sales figures.
      if (products.some(p => !Number.isSafeInteger(p.quantity) || p.quantity < 0)) {
        throw Error(`Unsupported fractional/negative Captiva product quantities on ${date}`);
      }
      const mapping=new Map<string,string|null>();
      for(const product of products){
        const found=current.get(product.external_item_id);
        const dish=found?.mapped_dish_id??old.get(`${product.plu}\u0000${product.name}`)??null;
        mapping.set(product.external_item_id,dish);
      }
      const collision=await sourceCollision(client,restaurant,locationId,date);
      const needsReview=products.filter(p=>!mapping.get(p.external_item_id)).length;
      const batch=await hashBatch({date,storeId,gross,net,vat,orders,visitors,products});
      results.push({
        date,status:collision?"blocked":"ready",reason:collision,
        gross:gross/100,net:net/100,vat:vat/100,orders,visitors,
        product_count:products.length,quantity:journal.main_line_quantity,
        products_requiring_mapping:needsReview,ambiguous_plu_count:journal.ambiguous_product_ids.length,
        // No raw journals, customer names, payment information or credentials returned.
      });
      if(!collision)prepared.push({date,products,gross,net,vat,orders,visitors,batch,mapping});
    }
    if(!stage) return reply({
      success:true,preview_only:true,store_id:storeId,results,
      sales_imported:0,line_items_imported:0,fetched:prepared.length,
    });
    if(results.some(r=>r.status!=="ready")) {
      return reply({success:false,error:"Some dates have missing data or overlapping sales. Nothing staged.",results},409);
    }
    if(!prepared.length) return reply({success:false,error:"No completed trading journals available"},422);

    let stagedCount=0;
    for(const day of prepared){
      // Check again immediately before staging; another operator may have
      // imported an XLS workbook after the preview was generated.
      const conflict=await sourceCollision(client,restaurant,locationId,day.date);
      if(conflict) throw Error(`Cannot stage ${day.date}: ${conflict}`);
      // Prior, not-yet-applied API staging may contain old product keys. Clear
      // only this provider/date after the collision guard, so the current batch
      // is complete. No financial ledger/sales row is deleted here.
      const {error:clearError}=await client.from("pos_sales_import").delete()
        .eq("restaurant_id",restaurant).eq("location_id",locationId)
        .eq("pos_provider","captiva").eq("mapped_sale_date",day.date);
      if(clearError) throw Error("Could not replace superseded staged Captiva products");
      // Store new POS items, but do not auto-create dishes or overwrite manual mappings.
      const missing=day.products.filter(p=>!current.has(p.external_item_id));
      if(missing.length){
        const rows=missing.map(p=>({
          restaurant_id:restaurant,location_id:locationId,pos_provider:"captiva",
          external_item_id:p.external_item_id,external_item_name:p.name,
          needs_review:!day.mapping.get(p.external_item_id),
          source:"captiva_journal_api",
          mapped_dish_id:day.mapping.get(p.external_item_id)??null,
          last_seen_at:new Date().toISOString(),last_gross:p.gross_cents/100,last_qty:p.quantity,
        }));
        const {error}=await client.from("external_pos_items").upsert(rows,{
          onConflict:"restaurant_id,location_id,pos_provider,external_item_id",ignoreDuplicates:true,
        });
        if(error) throw Error("Could not stage Captiva product catalogue");
        rows.forEach(row=>current.set(row.external_item_id,{external_item_id:row.external_item_id,external_item_name:row.external_item_name,mapped_dish_id:row.mapped_dish_id}));
      }
      const imports=day.products.map(p=>({
        restaurant_id:restaurant,location_id:locationId,pos_provider:"captiva",
        external_sale_id:`api:${day.date}:${p.external_item_id}`,
        mapped_sale_date:day.date,external_item_id:p.external_item_id,item_name:p.name,
        mapped_dish_id:day.mapping.get(p.external_item_id)??null,
        mapped_quantity:p.quantity,mapped_total_price:p.gross_cents/100,
        gross_sales:p.gross_cents/100,net_sales:null,vat_amount:null,discount_amount:null,
        sync_status:"pending",
        data:{
          source:"captiva_journal_api_v1",batch_id:day.batch,
          plu:p.plu,product_label:p.name,receipts:p.receipt_count,
          nested_options_count:p.modifier_count,
          expected_product_count:day.products.length,expected_gross_cents:day.gross,
          expected_net_cents:day.net,expected_vat_cents:day.vat,
          expected_orders:day.orders,expected_visitors:day.visitors,
        },
      }));
      const {error:stageError}=await client.from("pos_sales_import").upsert(imports,{
        onConflict:"restaurant_id,location_id,pos_provider,external_sale_id",
      });
      if(stageError) throw Error("Could not stage Captiva journal products");

      // Publish the completed batch checkpoint only AFTER every product is staged.
      // Application RPC checks all rows, counts, and totals in a DB transaction.
      const {error:checkpointError}=await client.from("captiva_api_staged_days").upsert({
        restaurant_id:restaurant,location_id:locationId,report_date:day.date,
        batch_id:day.batch,product_count:day.products.length,
        gross_cents:day.gross,net_cents:day.net,vat_cents:day.vat,
        order_count:day.orders,visitor_count:day.visitors,
        status:"ready",staged_at:new Date().toISOString(),applied_at:null,
      },{onConflict:"restaurant_id,location_id,report_date"});
      if(checkpointError) throw Error("Captiva staging checkpoint not available. Database migration may be missing.");
      stagedCount+=imports.length;
    }
    await client.from("pos_sync_logs").insert({
      restaurant_id:restaurant,location_id:locationId,pos_provider:"captiva",
      event_type:"captiva_api_staged",status:"success",
      message:`Staged ${stagedCount} product totals across ${prepared.length} verified trading dates. No sales applied.`,
      details:{integration_id:integrationId,date_from:start,date_to:end,days:prepared.length,products:stagedCount},
    });
    return reply({
      success:true,preview_only:false,staged:true,results,
      sales_imported:stagedCount,line_items_imported:stagedCount,
      fetched:prepared.length,skipped_duplicates:0,failed_rows:0,
    });
  }catch(e){
    const reason=e instanceof Error?e.message:"Unexpected Captiva failure";
    // No raw journal / response contents or secret request payloads are logged.
    return reply({success:false,error:reason,sales_imported:0,line_items_imported:0},422);
  }
});
