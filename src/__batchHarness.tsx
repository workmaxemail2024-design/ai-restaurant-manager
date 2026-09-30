import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { BatchRecipeCalculator } from "@/components/dishes/BatchRecipeCalculator";
const names = ["Baby Gem Lettuce","Beef meat","Cauliflower purée","Chicken wings","Garlic","Onion","Potato","Zucchini"];
const ings = names.map((n,i)=>({id:`id-${i}`,name:n,archived_at:null,pack_size:1000,cost_per_pack:10,pack_unit:"g",unit:"g"}));
function App(){return <BatchRecipeCalculator open onOpenChange={()=>{}} ingredients={ings} onApply={()=>{}}/>;}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient()}><App/></QueryClientProvider>);
