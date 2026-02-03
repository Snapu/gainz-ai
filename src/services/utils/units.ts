export const formatNumberWithUnit = (n: number, unit: string) =>
  new Intl.NumberFormat(undefined, { style: "unit", unit }).format(n);

export const formatUnit = (unit: string) =>
  new Intl.NumberFormat(undefined, { style: "unit", unit })
    .formatToParts()
    .find(({ type }) => type === "unit")?.value ?? unit;
