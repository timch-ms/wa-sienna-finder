import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMaterial, sortListings, uniqueValues } from "../lib/inventory.js";

test("classifies genuine leather without mislabeling Sensatec", () => {
  assert.equal(normalizeMaterial("Amido Perforated Full Merino Leather"), "Genuine leather");
  assert.equal(normalizeMaterial("Oyster Perforated Sensatec"), "Sensatec / synthetic");
  assert.equal(normalizeMaterial("Not listed"), "Not listed");
});

test("sorts listings without mutating the source", () => {
  const source = [{ year: 2024, price: 50, mileage: 9 }, { year: 2026, price: 80, mileage: 2 }];
  assert.equal(sortListings(source, "mileage-asc")[0].year, 2026);
  assert.equal(source[0].year, 2024);
});

test("returns unique descending years", () => {
  assert.deepEqual(uniqueValues([{ year: 2024 }, { year: 2026 }, { year: 2024 }], (x) => x.year), [2026, 2024]);
});
