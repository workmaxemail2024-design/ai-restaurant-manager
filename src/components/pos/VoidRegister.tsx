import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useLocations } from "@/hooks/useLocations";
import { usePermissions } from "@/hooks/usePermissions";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";

type Event = Tables<"pos_exception_events">;
const value = (amount: number | null) => amount == null ? "Unavailable" : formatCurrency(amount);

function CaseDetails({ event }: { event: Event }) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("pos", "edit");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [resolution, setResolution] = useState("pending");
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const detail = useQuery({
    queryKey: ["void-order-detail", event.id], refetchInterval: 60000,
    queryFn: async () => {
      const match = await supabase.from("pos_void_order_history").select("void_order_id")
        .eq("restaurant_id",event.restaurant_id).eq("location_id",event.location_id)
        .eq("source_event_key",event.source_event_key).maybeSingle();
      if (match.error) throw match.error;
      if (!match.data) return null;
      const result = await supabase.from("pos_void_orders")
        .select("order_number,order_operator,void_reason,void_category,pos_void_order_items(*),pos_void_order_history(*)")
        .eq("id",match.data.void_order_id).eq("location_id",event.location_id).single();
      if (result.error) throw result.error;
      return result.data;
    }
  });
  const audit = useQuery({
    queryKey: ["void-case-notes",event.id], enabled: canEdit, refetchInterval: 60000,
    queryFn: async () => {
      const result = await supabase.from("pos_exception_review_audit")
        .select("id,note,created_at,review_status,resolution").eq("event_id",event.id)
        .order("created_at",{ascending:false});
      if (result.error) throw result.error;
      return result.data;
    }
  });
  async function save() {
    setSaving(true); setMessage("");
    try {
      const result = await supabase.functions.invoke("pos-exception-review", {body:{
        action:"review",event_id:event.id,request_id:request,status:resolution==="pending"?"reviewing":"resolved",resolution,note:note.trim()
      }});
      if (result.error || !result.data?.success) throw new Error();
      setNote(""); setRequest(crypto.randomUUID()); setMessage("Review saved."); await audit.refetch();
    } catch { setMessage("Could not confirm the save. Retry to check or save this review."); }
    finally { setSaving(false); }
  }
  const order = detail.data;
  return <div className="space-y-3 border-t p-3">
    <p>Captiva recorded a VOID event on {event.source_date_text ?? event.trading_date} at {event.source_time_text ?? "an unknown time"} under the till login <strong>{event.source_operator ?? "Unavailable"}</strong>. Recorded value: {value(event.original_amount)}.</p>
    {detail.isError ? <p role="alert">Could not load order details.</p> : detail.isLoading ? <p>Checking order details…</p> : order ? <>
      <p>Order {order.order_number} · Opened by {order.order_operator ?? "Unavailable"} · Reason: {order.void_reason || "No reason supplied"} · Category: {order.void_category || "Unavailable"}</p>
      <h4 className="font-medium">Items on the order</h4>
      <ul>{[...order.pos_void_order_items].sort((a,b)=>a.line_index-b.line_index).map(i=><li key={i.id}>{i.quantity} × {i.description || i.product_id} · {value(i.line_value_not_loss)}</li>)}</ul>
      <h4 className="font-medium">Till history</h4>
      <ol>{[...order.pos_void_order_history].sort((a,b)=>a.event_index-b.event_index).map(h=><li key={h.id}>{h.date_text} {h.time_text} · {h.code} · {h.operator || "Unknown login"} · {value(h.recorded_value)}</li>)}</ol>
    </> : <p className="text-muted-foreground">Detailed order journal unavailable. The items, reason and sequence of till actions are unknown.</p>}
    <small>Case {event.id} · Source: {event.journal_filename}</small>
    {canEdit && <div className="space-y-2">
      <h4 className="font-medium">Manager review</h4>
      {audit.isError && <p role="alert">Could not load saved reviews.</p>}
      {audit.data?.map(entry=><p key={entry.id} className="text-sm">{new Date(entry.created_at).toLocaleString("en-IE")} · {entry.resolution?.replace(/_/g," ")} · {entry.note}</p>)}
      <label className="block">Outcome <select value={resolution} disabled={saving} onChange={e=>{setResolution(e.target.value);setRequest(crypto.randomUUID());}}>
        <option value="pending">Under review</option><option value="legitimate_cancellation">Legitimate cancellation</option>
        <option value="paid_in_pos">Paid at till</option><option value="confirmed_unpaid">Confirmed unpaid</option><option value="invalid_event">Invalid event</option>
      </select></label>
      <label className="block">Manager note<textarea className="block w-full rounded border p-2" rows={2} maxLength={4000} value={note} disabled={saving} onChange={e=>{setNote(e.target.value);setRequest(crypto.randomUUID());}} /></label>
      <Button disabled={saving || note.trim().length<5} onClick={save}>Save review</Button>
      <p role="status">{message}</p>
    </div>}
  </div>;
}

export function VoidRegister() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { startDate,endDate } = useDateRange();
  const { data: locations=[] } = useLocations();
  const { hasPermission } = usePermissions();
  const [all,setAll] = useState(true);
  const [opened,setOpened] = useState<string|null>(null);
  const rid=currentRestaurant?.id;
  const allowed=hasPermission("pos","view");
  const events=useQuery({
    queryKey:["void-register",rid,selectedLocationId,all?"history":startDate,all?"history":endDate],
    enabled:!!rid && allowed,refetchInterval:60000,
    queryFn:async()=>{
      const rows:Event[]=[];
      for(let offset=0;;offset+=500){
        let q=supabase.from("pos_exception_events").select("*").eq("restaurant_id",rid!).eq("event_code","VOID")
          .order("trading_date",{ascending:false}).order("source_time_text",{ascending:false}).order("id").range(offset,offset+499);
        if(selectedLocationId) q=q.eq("location_id",selectedLocationId);
        if(!all) q=q.gte("trading_date",startDate).lte("trading_date",endDate);
        const result=await q;
        if(result.error) throw result.error;
        rows.push(...result.data);
        if(result.data.length<500) return rows;
      }
    }
  });
  if(!allowed) return <p>POS viewing permission is required to see void records.</p>;
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">Till void register</h2>
    <div className="flex flex-wrap items-center gap-3"><label>Period <select value={all?"all":"range"} onChange={e=>setAll(e.target.value==="all")}><option value="all">All recorded dates</option><option value="range">Selected date range</option></select></label>{!all && <DateRangeSelector />}</div>
    <p className="text-sm text-muted-foreground">Checks for imported events every minute while open. Till values alone do not establish a loss.</p>
    {events.isError ? <p role="alert">Could not load the void register.</p> : events.isLoading ? <p>Loading voids…</p> : <>
      <p>{events.data?.length} recorded VOID events</p>
      {!events.data?.length && <p>No imported VOID events for this selection. Journal coverage may be incomplete.</p>}
      {events.data?.map(e=><article key={e.id} className="rounded border">
        <button type="button" className="w-full text-left p-3" aria-expanded={opened===e.id} onClick={()=>setOpened(opened===e.id?null:e.id)}>
          <strong>{e.trading_date} · {e.source_time_text || "Time unavailable"}</strong> · {locations.find(l=>l.id===e.location_id)?.name || "Location"} · {e.source_operator || "Unknown till login"} · {value(e.original_amount)} <span className="underline">{opened===e.id?"Close case":"View case"}</span>
        </button>{opened===e.id && <CaseDetails event={e} />}
      </article>)}
    </>}
  </section>;
}
