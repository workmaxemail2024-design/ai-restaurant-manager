import { createRoot } from "react-dom/client";
import { useState } from "react";
import "./index.css";
import { BatchRecipeCalculator } from "@/components/dishes/BatchRecipeCalculator";
const names = ["Baby Gem Lettuce","Beef meat","Butter","Carrot","Cauliflower purée","Chicken wings","Cream","Egg","Flour","Garlic","Lemon","Milk","Onion","Parsley","Pepper","Potato","Rice","Salt","Sugar","Tomato","Vinegar","Zucchini"];
const ings = names.map((n,i)=>({id:`id-${i}`,name:n,archived_at:null,pack_size:1000,cost_per_pack:10,pack_unit:"g",unit:"g"}));
function App(){const [out,setOut]=useState("");return <><BatchRecipeCalculator open onOpenChange={()=>{}} ingredients={ings} onApply={(l)=>setOut(JSON.stringify(l))}/><pre id="out">{out}</pre></>;}
createRoot(document.getElementById("root")!).render(<App/>);
