const LEATHER_PATTERN = /\b(leather|merino|vernasca|nappa)\b/i;
const SYNTHETIC_PATTERN = /\b(sensatec|artificial|synthetic|leatherette)\b/i;

export function normalizeMaterial(value) {
  if (!value || value === "Not listed") return "Not listed";
  if (SYNTHETIC_PATTERN.test(value)) return "Sensatec / synthetic";
  if (LEATHER_PATTERN.test(value)) return "Genuine leather";
  return value;
}

export function uniqueValues(listings, selector) {
  return [...new Set(listings.map(selector).filter(Boolean))].sort((a, b) =>
    typeof a === "number" ? b - a : a.localeCompare(b)
  );
}

export function sortListings(listings, mode) {
  const copy = [...listings];
  if (mode === "price-asc") return copy.sort((a, b) => a.price - b.price);
  if (mode === "mileage-asc") return copy.sort((a, b) => a.mileage - b.mileage);
  return copy.sort((a, b) => b.year - a.year || a.price - b.price);
}
