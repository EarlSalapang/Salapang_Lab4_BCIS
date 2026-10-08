export function formatPeso(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : "—";
}

export function toTitleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}