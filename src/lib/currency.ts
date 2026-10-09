// Currency formatting utility - uses Euro (EUR) as default currency

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-IE", { 
    style: "currency", 
    currency: "EUR" 
  }).format(value);
};

export const formatCurrencyShort = (value: number): string => {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `€${(value / 1000).toFixed(1)}K`;
  }
  return formatCurrency(value);
};

export const currencySymbol = "€";

/**
 * Per-unit costs (e.g. per g/ml) need more precision than whole prices:
 * ≥ €1 → 2 decimals; below that → up to 4 significant digits (€0.0035, €0.00042).
 */
export const formatUnitCost = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1 || abs === 0) return formatCurrency(value);
  const decimals = Math.min(8, Math.max(2, 3 - Math.floor(Math.log10(abs)) ));
  return new Intl.NumberFormat("en-IE", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 2, maximumFractionDigits: decimals,
  }).format(value);
};
