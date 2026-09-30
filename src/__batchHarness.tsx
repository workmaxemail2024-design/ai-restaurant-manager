import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { RestaurantProvider } from "@/contexts/RestaurantContext";
import { BatchRecipeCalculator } from "@/components/dishes/BatchRecipeCalculator";
const ings = [
 {id:"beef",name:"Beef meat",archived_at:null,pack_size:1000,cost_per_pack:10,pack_unit:"g",unit:"g",default_cost_price:0},
 {id:"eggs",name:"Eggs",archived_at:null,pack_size:30,cost_per_pack:6,pack_unit:"each",unit:"each",default_cost_price:0},
 {id:"salt",name:"Salt",archived_at:null,pack_size:null,cost_per_pack:null,pack_unit:null,unit:"g",default_cost_price:0},
];
function App(){const [o,setO]=useState("");return <><BatchRecipeCalculator open onOpenChange={()=>{}} ingredients={ings} onApply={(l)=>setO(JSON.stringify(l))}/><pre id="out" style={{position:"fixed",top:0,zIndex:9999}}>{o}</pre></>;}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient()}><RestaurantProvider><App/></RestaurantProvider></QueryClientProvider>);
