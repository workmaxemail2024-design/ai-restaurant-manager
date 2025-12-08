import { useState, useMemo } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calculator, TrendingUp, Percent, Target, Building2, Zap, Users, MoreHorizontal } from "lucide-react";
import { PageLayout } from "@/components/common/PageLayout";
import { formatCurrency, currencySymbol } from "@/lib/currency";

const inputSchema = z.object({
  ingredientCost: z.number().min(0, "Must be positive"),
  sellingPrice: z.number().min(0, "Must be positive"),
  vatPercent: z.number().min(0).max(100, "VAT must be 0-100%"),
  rentCost: z.number().min(0).optional(),
  utilitiesCost: z.number().min(0).optional(),
  labourAllocation: z.number().min(0).optional(),
  otherOverheads: z.number().min(0).optional(),
});

type BreakEvenPeriod = "daily" | "weekly" | "monthly";

export default function MarginCalculatorPage() {
  const [ingredientCost, setIngredientCost] = useState<string>("");
  const [sellingPrice, setSellingPrice] = useState<string>("");
  const [vatPercent, setVatPercent] = useState<string>("0");
  const [showOverheads, setShowOverheads] = useState(false);
  const [rentCost, setRentCost] = useState<string>("");
  const [utilitiesCost, setUtilitiesCost] = useState<string>("");
  const [labourAllocation, setLabourAllocation] = useState<string>("");
  const [otherOverheads, setOtherOverheads] = useState<string>("");
  const [breakEvenPeriod, setBreakEvenPeriod] = useState<BreakEvenPeriod>("daily");

  const parseNumber = (value: string): number => {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  };

  const calculations = useMemo(() => {
    const cost = parseNumber(ingredientCost);
    const price = parseNumber(sellingPrice);
    const vat = parseNumber(vatPercent);
    const rent = parseNumber(rentCost);
    const utilities = parseNumber(utilitiesCost);
    const labour = parseNumber(labourAllocation);
    const other = parseNumber(otherOverheads);

    // Validate inputs
    const validation = inputSchema.safeParse({
      ingredientCost: cost,
      sellingPrice: price,
      vatPercent: vat,
      rentCost: rent || undefined,
      utilitiesCost: utilities || undefined,
      labourAllocation: labour || undefined,
      otherOverheads: other || undefined,
    });

    if (!validation.success || price === 0) {
      return {
        grossMargin: 0,
        netMargin: 0,
        profitPerDish: 0,
        foodCostPercent: 0,
        breakEvenUnits: 0,
        isValid: false,
      };
    }

    // Calculate VAT-exclusive selling price
    const priceExVat = price / (1 + vat / 100);
    
    // Gross margin = (Price ex VAT - Ingredient Cost) / Price ex VAT * 100
    const grossProfit = priceExVat - cost;
    const grossMargin = (grossProfit / priceExVat) * 100;

    // Total overheads per dish (simplified allocation)
    const totalOverheads = rent + utilities + labour + other;
    
    // For break-even calculation, convert overheads to the selected period
    const periodMultiplier = breakEvenPeriod === "daily" ? 1 : breakEvenPeriod === "weekly" ? 7 : 30;
    const periodOverheads = totalOverheads * periodMultiplier;

    // Net profit per dish (gross profit minus per-unit overhead allocation)
    // For simplicity, we calculate net margin without fixed overhead allocation per dish
    const netProfit = grossProfit;
    const netMargin = (netProfit / priceExVat) * 100;

    // Food cost percentage
    const foodCostPercent = (cost / priceExVat) * 100;

    // Break-even units = Fixed Costs / (Price - Variable Cost)
    // Where variable cost = ingredient cost
    const contributionMargin = priceExVat - cost;
    const breakEvenUnits = contributionMargin > 0 ? Math.ceil(periodOverheads / contributionMargin) : 0;

    return {
      grossMargin: isFinite(grossMargin) ? grossMargin : 0,
      netMargin: isFinite(netMargin) ? netMargin : 0,
      profitPerDish: isFinite(grossProfit) ? grossProfit : 0,
      foodCostPercent: isFinite(foodCostPercent) ? foodCostPercent : 0,
      breakEvenUnits: isFinite(breakEvenUnits) ? breakEvenUnits : 0,
      isValid: true,
    };
  }, [ingredientCost, sellingPrice, vatPercent, rentCost, utilitiesCost, labourAllocation, otherOverheads, breakEvenPeriod]);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <PageLayout title="Margin Calculator" subtitle="Calculate dish profitability and break-even analysis">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Card */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Input Values
            </CardTitle>
            <CardDescription>Enter your cost and pricing data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Core Inputs */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
              <Label htmlFor="ingredientCost" className="flex items-center gap-2">
                  <span className="h-4 w-4 text-muted-foreground font-medium">{currencySymbol}</span>
                  Ingredient Cost
                </Label>
                <Input
                  id="ingredientCost"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={ingredientCost}
                  onChange={(e) => setIngredientCost(e.target.value)}
                  className="text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellingPrice" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Selling Price
                </Label>
                <Input
                  id="sellingPrice"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="text-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vatPercent" className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                VAT %
              </Label>
              <Input
                id="vatPercent"
                type="number"
                placeholder="0"
                min="0"
                max="100"
                step="0.1"
                value={vatPercent}
                onChange={(e) => setVatPercent(e.target.value)}
                className="w-32"
              />
            </div>

            {/* Overheads Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div className="space-y-0.5">
                <Label htmlFor="overheads-toggle" className="text-base font-medium">
                  Include Overheads
                </Label>
                <p className="text-sm text-muted-foreground">
                  Add fixed costs for break-even calculation
                </p>
              </div>
              <Switch
                id="overheads-toggle"
                checked={showOverheads}
                onCheckedChange={setShowOverheads}
              />
            </div>

            {/* Overhead Inputs */}
            {showOverheads && (
              <div className="space-y-4 rounded-lg border border-border/50 bg-muted/30 p-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Daily Overhead Costs
                </h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rentCost" className="flex items-center gap-2 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Rent/Lease
                    </Label>
                    <Input
                      id="rentCost"
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={rentCost}
                      onChange={(e) => setRentCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="utilitiesCost" className="flex items-center gap-2 text-sm">
                      <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                      Utilities
                    </Label>
                    <Input
                      id="utilitiesCost"
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={utilitiesCost}
                      onChange={(e) => setUtilitiesCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labourAllocation" className="flex items-center gap-2 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      Labour Allocation
                    </Label>
                    <Input
                      id="labourAllocation"
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={labourAllocation}
                      onChange={(e) => setLabourAllocation(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="otherOverheads" className="flex items-center gap-2 text-sm">
                      <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      Other Overheads
                    </Label>
                    <Input
                      id="otherOverheads"
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={otherOverheads}
                      onChange={(e) => setOtherOverheads(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Break-even Period</Label>
                  <ToggleGroup
                    type="single"
                    value={breakEvenPeriod}
                    onValueChange={(value) => value && setBreakEvenPeriod(value as BreakEvenPeriod)}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="daily" aria-label="Daily">
                      Daily
                    </ToggleGroupItem>
                    <ToggleGroupItem value="weekly" aria-label="Weekly">
                      Weekly
                    </ToggleGroupItem>
                    <ToggleGroupItem value="monthly" aria-label="Monthly">
                      Monthly
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Results
            </CardTitle>
            <CardDescription>
              {calculations.isValid ? "Live calculations based on your inputs" : "Enter values to see results"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {/* Gross Margin */}
              <div className="rounded-lg border border-border/50 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Gross Margin</p>
                    <p className="text-3xl font-bold text-primary">
                      {formatPercent(calculations.grossMargin)}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </div>

              {/* Other Metrics Grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border/50 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Net Margin</p>
                  <p className="text-2xl font-bold">{formatPercent(calculations.netMargin)}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Profit per Dish</p>
                  <p className="text-2xl font-bold text-success">{formatCurrency(calculations.profitPerDish)}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Food Cost %</p>
                  <p className="text-2xl font-bold">{formatPercent(calculations.foodCostPercent)}</p>
                </div>
                {showOverheads && (
                  <div className="rounded-lg border border-border/50 p-4">
                    <p className="text-sm font-medium text-muted-foreground">
                      Break-even ({breakEvenPeriod})
                    </p>
                    <p className="text-2xl font-bold">
                      {calculations.breakEvenUnits} <span className="text-sm font-normal text-muted-foreground">units</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Health Indicator */}
              {calculations.isValid && (
                <div className="mt-4 rounded-lg border border-border/50 p-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Margin Health</p>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        calculations.grossMargin >= 70
                          ? "bg-success"
                          : calculations.grossMargin >= 50
                          ? "bg-warning"
                          : "bg-destructive"
                      }`}
                      style={{ width: `${Math.min(calculations.grossMargin, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {calculations.grossMargin >= 70
                      ? "Excellent margin - healthy profitability"
                      : calculations.grossMargin >= 50
                      ? "Good margin - room for optimization"
                      : "Low margin - consider adjusting pricing or costs"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
