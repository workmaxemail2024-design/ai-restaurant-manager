import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePersistentState } from "@/hooks/usePersistentState";
import { formatOrdinalDate, formatOrdinalRange, monthLabel } from "@/lib/ordinalDate";
import { monthGrid, voidDayStatus, VOID_STATUS_LABEL, type VoidDayStatus } from "@/lib/voidCalendar";
import { cn } from "@/lib/utils";
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
  const queryClient = useQueryClient();
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
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["void-calendar"] }), queryClient.invalidateQueries({ queryKey: ["void-register"] })]);
    } catch { setMessage("Could not confirm the save. Retry to check or save this review."); }
    finally { setSaving(false); }
  }
  const order = detail.data;
  return <div className="space-y-3 border-t p-3">
    <p>Captiva recorded a VOID event on {formatOrdinalDate(event.trading_date, true)} at {event.source_time_text ?? "an unknown time"} under the till login <strong>{event.source_operator ?? "Unavailable"}</strong>. Recorded value: {value(event.original_amount)}.</p>
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

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const STATUS_STYLE: Record<VoidDayStatus, string> = {
  open: "bg-destructive/15 border-destructive text-destructive",
  clear: "bg-primary/10 border-primary/60 text-primary",
  resolved: "bg-primary/10 border-primary/60 text-primary",
  unknown: "bg-muted/40 border-border text-muted-foreground",
  future: "bg-background border-dashed border-border text-muted-foreground",
};
const STATUS_MARK: Record<VoidDayStatus, string> = { open: "!", clear: "✓", resolved: "✓", unknown: "?", future: "" };

type Reviewed = Event & { review_status: string | null; resolution: string | null };

async function attachReviews(rows: Event[]): Promise<Reviewed[]> {
  const map = new Map<string, { review_status: string; resolution: string | null }>();
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r) => r.id);
    const r = await supabase.from("pos_exception_reviews").select("event_id,review_status,resolution").in("event_id", ids);
    if (r.error) throw r.error;
    r.data.forEach((x) => map.set(x.event_id, x));
  }
  return rows.map((e) => ({ ...e, review_status: map.get(e.id)?.review_status ?? null, resolution: map.get(e.id)?.resolution ?? null }));
}

export function VoidRegister() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { startDate,endDate } = useDateRange();
  const { data: locations=[] } = useLocations();
  const { hasPermission } = usePermissions();
  const rid=currentRestaurant?.id;
  const k=(n:string)=>`voids:${n}:${rid ?? "none"}`;
  const [period,setPeriod] = usePersistentState<"calendar"|"all"|"range">(k("period"),"calendar");
  const [selectedDay,setSelectedDay] = usePersistentState<string>(k("day"),todayIso());
  const [month,setMonth] = usePersistentState<string>(k("month"),todayIso().slice(0,7));
  const [opened,setOpened] = useState<string|null>(null);
  const allowed=hasPermission("pos","view");
  const [y,m]=month.split("-").map(Number);
  const monthStart=`${month}-01`;
  const monthEnd=`${month}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`;
  const scopeIds = useMemo(()=>selectedLocationId ? [selectedLocationId] : locations.map(l=>l.id),[selectedLocationId,locations]);

  const calendar=useQuery({
    queryKey:["void-calendar",rid,selectedLocationId ?? "all",monthStart,monthEnd],
    enabled:!!rid && allowed && period==="calendar",refetchInterval:60000,
    queryFn:async()=>{
      const evs:Event[]=[];
      for(let offset=0;;offset+=1000){
        let q=supabase.from("pos_exception_events").select("*").eq("restaurant_id",rid!).eq("event_code","VOID")
          .gte("trading_date",monthStart).lte("trading_date",monthEnd).order("id").range(offset,offset+999);
        if(selectedLocationId) q=q.eq("location_id",selectedLocationId);
        const r=await q; if(r.error) throw r.error; evs.push(...r.data); if(r.data.length<1000) break;
      }
      let sq=supabase.from("pos_captiva_daily_sources").select("location_id,trading_date,journal_coverage,observed_at")
        .eq("restaurant_id",rid!).gte("trading_date",monthStart).lte("trading_date",monthEnd).order("observed_at",{ascending:false});
      if(selectedLocationId) sq=sq.eq("location_id",selectedLocationId);
      const src=await sq; if(src.error) throw src.error;
      const latest=new Map<string,string>();
      src.data.forEach(s=>{const key=`${s.location_id}|${s.trading_date}`; if(!latest.has(key)) latest.set(key,s.journal_coverage);});
      return { events: await attachReviews(evs), coverage: latest };
    }
  });

  const listQ=useQuery({
    queryKey:["void-register",rid,selectedLocationId ?? "all",period,period==="range"?startDate:period==="calendar"?selectedDay:"history",period==="range"?endDate:""],
    enabled:!!rid && allowed && period!=="calendar",refetchInterval:60000,
    queryFn:async()=>{
      const rows:Event[]=[];
      for(let offset=0;;offset+=500){
        let q=supabase.from("pos_exception_events").select("*").eq("restaurant_id",rid!).eq("event_code","VOID")
          .order("trading_date",{ascending:false}).order("source_time_text",{ascending:false}).order("id").range(offset,offset+499);
        if(selectedLocationId) q=q.eq("location_id",selectedLocationId);
        if(period==="range") q=q.gte("trading_date",startDate).lte("trading_date",endDate);
        const result=await q;
        if(result.error) throw result.error;
        rows.push(...result.data);
        if(result.data.length<500) return attachReviews(rows);
      }
    }
  });

  if(!allowed) return <p>POS viewing permission is required to see void records.</p>;
  const today=todayIso();
  const dayInfo=(date:string)=>{
    const evs=(calendar.data?.events??[]).filter(e=>e.trading_date===date);
    const complete=new Set(scopeIds.filter(l=>calendar.data?.coverage.get(`${l}|${date}`)==="complete"));
    return { ...voidDayStatus({ date, today, locationIds: scopeIds, completeLocationIds: complete, eventStatuses: evs.map(e=>e.review_status) }), evs, complete: complete.size };
  };
  const shift=(d:number)=>{const n=new Date(y,m-1+d,1); setMonth(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`);};
  const sel = period==="calendar" && selectedDay.startsWith(month) ? dayInfo(selectedDay) : null;
  const caseList=(rows:Reviewed[])=>rows.map(e=><article key={e.id} className="rounded-lg border">
    <button type="button" className="w-full text-left p-3 min-h-11" aria-expanded={opened===e.id} onClick={()=>setOpened(opened===e.id?null:e.id)}>
      <strong>{formatOrdinalDate(e.trading_date, true)} · {e.source_time_text || "Time unavailable"}</strong> · {locations.find(l=>l.id===e.location_id)?.name || "Location"} · {e.source_operator || "Unknown till login"} · {value(e.original_amount)}
      {" "}<span className={cn("rounded px-1.5 text-xs border", e.review_status==="resolved" ? "border-primary/60 text-primary" : "border-destructive text-destructive")}>{e.review_status==="resolved" ? `Resolved${e.resolution ? " · "+e.resolution.replace(/_/g," ") : ""}` : e.review_status==="reviewing" ? "Under review" : "Not reviewed"}</span>
      {" "}<span className="underline">{opened===e.id?"Close case":"View case"}</span>
    </button>{opened===e.id && <CaseDetails event={e} />}
  </article>);

  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">Till void register</h2>
    <div className="flex flex-wrap items-center gap-3"><label>View <select className="h-10 rounded border px-2" value={period} onChange={e=>{setPeriod(e.target.value as typeof period); setOpened(null);}}>
      <option value="calendar">Calendar by day</option><option value="all">All recorded dates</option><option value="range">Selected date range</option></select></label>
      {period==="range" && <><DateRangeSelector /><span className="text-sm text-muted-foreground">{formatOrdinalRange(startDate,endDate)}</span></>}</div>
    <p className="text-sm text-muted-foreground">Checks for imported events every minute while open. Till values alone do not establish a loss.</p>

    {period==="calendar" ? <>
      <div className="rounded-xl border p-3 max-w-md">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" className="h-11 w-11 p-0" aria-label="Previous month" onClick={()=>shift(-1)}>‹</Button>
          <strong>{monthLabel(y,m-1)}</strong>
          <Button variant="ghost" className="h-11 w-11 p-0" aria-label="Next month" onClick={()=>shift(1)}>›</Button>
        </div>
        {calendar.isError ? <p role="alert">Could not load the void calendar. Nothing has changed — it will retry.</p> : <>
        <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1 text-center text-xs text-muted-foreground">
          <span>Wk</span>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><span key={d}>{d}</span>)}
        </div>
        {monthGrid(y,m-1).map((week,wi)=>{
          const firstDay=week.find(Boolean)!; const dt=new Date(firstDay); const t=new Date(Date.UTC(dt.getFullYear(),dt.getMonth(),dt.getDate())); const dn=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-dn+3); const w1=new Date(Date.UTC(t.getUTCFullYear(),0,4)); const wk=1+Math.round(((t.getTime()-w1.getTime())/86400000-3+((w1.getUTCDay()+6)%7))/7);
          return <div key={wi} className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1 mt-1">
          <span className="self-center text-center text-xs text-muted-foreground">{wk}</span>
          {week.map((date,di)=>{ if(!date) return <span key={di} />;
            const info=calendar.isLoading ? null : dayInfo(date);
            const st=info?.status ?? "unknown";
            const label=`${formatOrdinalDate(date,true)}: ${VOID_STATUS_LABEL[st]}${info?.total ? `, ${info.total} void${info.total>1?"s":""}${info.open ? `, ${info.open} open` : ""}` : ""}`;
            return <button key={date} type="button" aria-label={label} title={label} aria-pressed={selectedDay===date}
              onClick={()=>{setSelectedDay(date); setOpened(null);}}
              className={cn("h-11 rounded-lg border text-sm flex flex-col items-center justify-center leading-none", STATUS_STYLE[st], selectedDay===date && "ring-2 ring-ring ring-offset-1")}>
              <span>{Number(date.slice(8))}</span><span className="text-[10px]" aria-hidden>{info?.open ? `${info.open}!` : STATUS_MARK[st]}</span>
            </button>;})}
        </div>;})}
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <li>! Needs review (red)</li><li>✓ No voids / all resolved — journal confirmed complete (green)</li><li>? Not confirmed, partial journal or no data (grey)</li>
        </ul></>}
      </div>
      {sel && <div className="space-y-2">
        <h3 className="font-medium">{formatOrdinalDate(selectedDay,true)} — {VOID_STATUS_LABEL[sel.status]}</h3>
        <p className="text-sm text-muted-foreground">{sel.total} void{sel.total===1?"":"s"}{sel.open ? ` · ${sel.open} open` : ""} · complete journal received for {sel.complete} of {scopeIds.length} restaurant{scopeIds.length===1?"":"s"}.</p>
        {sel.total===0 && <p>No imported VOID events for this day.{sel.status!=="clear" && " Journal coverage is not confirmed complete, so voids may be missing."}</p>}
        {caseList([...sel.evs].sort((a,b)=>(a.source_time_text??"").localeCompare(b.source_time_text??"")))}
      </div>}
      {period==="calendar" && !selectedDay.startsWith(month) && <p className="text-sm text-muted-foreground">Selected day {formatOrdinalDate(selectedDay)} is in another month. Pick a day above.</p>}
    </> : listQ.isError ? <p role="alert">Could not load the void register.</p> : listQ.isLoading ? <p>Loading voids…</p> : <>
      <p>{listQ.data?.length} recorded VOID events</p>
      {!listQ.data?.length && <p>No imported VOID events for this selection. Journal coverage may be incomplete.</p>}
      {caseList(listQ.data ?? [])}
    </>}
  </section>;
}
