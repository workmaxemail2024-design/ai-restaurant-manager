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
