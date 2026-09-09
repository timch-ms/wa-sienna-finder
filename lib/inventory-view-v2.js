import { uniqueValues } from "./inventory.js";

const MARKETPLACE_DOMAINS = ["autolist.com"];
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const VIN_LETTER_VALUES = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
};

export function renderInventory(data, config = {}) {
const vehicleName = config.vehicleName || `${config.make || "BMW"} ${config.model || "iX"}`;
const dealerDomains = Array.isArray(config.dealerDomains) ? config.dealerDomains : [];
const marketplaceDomains = Array.isArray(config.marketplaceDomains)
  ? config.marketplaceDomains
  : MARKETPLACE_DOMAINS;
const dealerOnlyLabel = config.dealerOnlyLabel || "Brand dealers only";
const controls = {
  year: document.querySelector("#year"),
  dealership: document.querySelector("#dealership"),
  trim: document.querySelector("#trim"),
  mileage: document.querySelector("#mileage"),
  price: document.querySelector("#price"),
  color: document.querySelector("#color"),
  interiorColor: document.querySelector("#interior-color"),
  usage: document.querySelector("#usage"),
  accidentHistory: document.querySelector("#accident-history"),
  ownership: document.querySelector("#ownership"),
  certification: document.querySelector("#certification"),
  recency: document.querySelector("#recency"),
  photos: document.querySelector("#photos"),
  brandDealer: document.querySelector("#brand-dealer"),
  newToday: document.querySelector("#new-today"),
  sort: document.querySelector("#sort")
};
const grid = document.querySelector("#vehicle-grid");
const template = document.querySelector("#vehicle-card-template");

function replaceOptions(select, values, defaultLabel) {
  select.replaceChildren(new Option(defaultLabel, ""));
  values.forEach((value) => select.add(new Option(value, value)));
}

replaceOptions(controls.year, uniqueValues(data.listings, (item) => item.year), "All years");
replaceOptions(controls.dealership, uniqueValues(data.listings, (item) => item.dealer), "All dealerships");
replaceOptions(controls.trim, uniqueValues(data.listings, (item) => item.trim), "All trims");
replaceOptions(controls.color, uniqueValues(data.listings, (item) => item.exteriorColor), "All exterior colors");
replaceOptions(
  controls.interiorColor,
  uniqueValues(data.listings, (item) => item.interiorColor),
  "All interior colors"
);
replaceOptions(controls.usage, uniqueValues(data.listings, (item) => item.usageType), "All usage types");

function matchesAccidentHistory(listing) {
  if (!controls.accidentHistory.value) return true;
  if (controls.accidentHistory.value === "none") return listing.accidentFree === true;
  if (controls.accidentHistory.value === "reported") return listing.accidentFree === false;
  return listing.accidentFree === null;
}

function matchesOwnership(listing) {
  if (!controls.ownership.value) return true;
  if (controls.ownership.value === "one") return listing.oneOwner === true;
  if (controls.ownership.value === "not-one") return listing.oneOwner === false;
  return listing.oneOwner === null;
}

function matchesCertification(listing) {
  if (!controls.certification.value) return true;
  return controls.certification.value === "cpo" ? listing.cpo : !listing.cpo;
}

function listedWithinDays(listing, days) {
  if (!listing.listedAt) return false;
  const listedAt = new Date(String(listing.listedAt).replace(" ", "T"));
  return !Number.isNaN(listedAt.valueOf())
    && Date.now() - listedAt.valueOf() <= days * 24 * 60 * 60 * 1000;
}

function matches(listing) {
  return (!controls.year.value || listing.year === Number(controls.year.value))
    && (!controls.dealership.value || listing.dealer === controls.dealership.value)
    && (!controls.trim.value || listing.trim === controls.trim.value)
    && (!controls.mileage.value || listing.mileage !== null
      && listing.mileage <= Number(controls.mileage.value))
    && (!controls.price.value || listing.price <= Number(controls.price.value))
    && (!controls.color.value || listing.exteriorColor === controls.color.value)
    && (!controls.interiorColor.value || listing.interiorColor === controls.interiorColor.value)
    && (!controls.usage.value || listing.usageType === controls.usage.value)
    && matchesAccidentHistory(listing)
    && matchesOwnership(listing)
    && matchesCertification(listing)
    && (!controls.recency.value || listedWithinDays(listing, Number(controls.recency.value)))
    && (!controls.photos.value || listing.photoCount >= Number(controls.photos.value))
    && (!controls.brandDealer.checked
      || listing.officialBrandDealer
      || listing.officialBmwDealer)
    && (!controls.newToday.checked || listing.isNew);
}

function sortListings(listings) {
  const copy = [...listings];
  const missingMileage = (item) => item.mileage ?? Number.MAX_SAFE_INTEGER;
  if (controls.sort.value === "price-asc") return copy.sort((a, b) => a.price - b.price);
  if (controls.sort.value === "mileage-asc") return copy.sort((a, b) => missingMileage(a) - missingMileage(b));
  if (controls.sort.value === "year-desc") return copy.sort((a, b) => b.year - a.year || a.price - b.price);
  if (controls.sort.value === "listed-desc") {
    return copy.sort((a, b) => String(b.listedAt).localeCompare(String(a.listedAt)));
  }
  return copy.sort((a, b) => Number(b.isNew) - Number(a.isNew)
    || String(b.listedAt).localeCompare(String(a.listedAt)));
}

function fact(label, value) {
  const node = document.createElement("span");
  node.className = "fact";
  const heading = document.createElement("small");
  heading.textContent = label;
  const content = document.createElement("span");
  content.textContent = value;
  node.append(heading, content);
  return node;
}

function statusPill(text, className = "") {
  const pill = document.createElement("span");
  pill.className = `status-pill ${className}`.trim();
  pill.textContent = text;
  return pill;
}

function trustedUrl(value, allowedDomains) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const domainAllowed = allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    return url.protocol === "https:" && !url.username && !url.password && domainAllowed
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function listingDestination(value) {
  const dealerUrl = trustedUrl(value, dealerDomains);
  if (dealerUrl) return { type: "dealer", url: dealerUrl };
  const marketplaceUrl = trustedUrl(value, marketplaceDomains);
  if (marketplaceUrl) return { type: "marketplace", url: marketplaceUrl };
  return { type: "missing", url: null };
}

function carfaxVehicleUrl(vin) {
  const normalizedVin = String(vin || "").trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) return null;
  const sum = [...normalizedVin].reduce((total, character, index) => {
    const value = /\d/.test(character) ? Number(character) : VIN_LETTER_VALUES[character];
    return total + value * VIN_WEIGHTS[index];
  }, 0);
  const expectedCheckDigit = sum % 11 === 10 ? "X" : String(sum % 11);
  return normalizedVin[8] === expectedCheckDigit
    ? `https://www.carfax.com/vehicle/${normalizedVin}`
    : null;
}

function renderCard(listing) {
  const card = template.content.cloneNode(true);
  const image = card.querySelector(".vehicle-image");
  image.src = listing.image;
  image.alt = `${listing.year} ${vehicleName} ${listing.trim} at ${listing.dealer}`;
  card.querySelector(".new-badge").hidden = !listing.isNew;
  card.querySelector(".dealer-name").textContent =
    `${listing.dealer} · ${listing.city}, ${listing.state}`;
  card.querySelector(".vehicle-title").textContent = `${listing.year} ${vehicleName}`;
  card.querySelector(".vehicle-subtitle").textContent = listing.trim;
  card.querySelector(".vehicle-facts").append(
    fact("Mileage", listing.mileage === null ? "Not listed" : `${listing.mileage.toLocaleString()} mi`),
    fact("Exterior", listing.exteriorColor),
    fact("Interior color", listing.interiorColor),
    fact("VIN", `…${listing.vin.slice(-6)}`)
  );

  const history = card.querySelector(".history-row");
  history.append(statusPill(listing.cpo ? "CPO" : "Not CPO", listing.cpo ? "positive" : ""));
  if (listing.oneOwner === true) {
    history.append(statusPill("One owner", "positive"));
  } else if (listing.oneOwner === false) {
    history.append(statusPill("Not one-owner"));
  } else {
    history.append(statusPill("Ownership history unknown"));
  }
  if (listing.accidentFree === true) {
    history.append(statusPill("No accidents reported", "positive"));
  }
  if (listing.accidentFree === false) {
    const count = listing.accidentCount;
    history.append(statusPill(
      Number.isInteger(count) ? `${count} accident${count === 1 ? "" : "s"} reported` : "Accident reported",
      "warning"
    ));
  }
  if (listing.accidentFree === null) {
    history.append(statusPill("Accident history unknown"));
  }
  if (listing.usageType !== "Not listed") history.append(statusPill(listing.usageType));

  card.querySelector(".vehicle-price").textContent = `$${listing.price.toLocaleString()}`;
  const dealerLink = card.querySelector(".dealer-link");
  const destination = listingDestination(listing.url);
  if (destination.type === "dealer" || destination.type === "marketplace") {
    dealerLink.href = destination.url;
    dealerLink.textContent = destination.type === "dealer"
      ? "Dealer Site"
      : "Marketplace Listing";
    dealerLink.setAttribute(
      "aria-label",
      `${dealerLink.textContent} for the ${listing.year} ${vehicleName} at ${listing.dealer}`
    );
  } else {
    dealerLink.hidden = true;
  }

  const carfaxLink = card.querySelector(".carfax-link");
  const carfaxUrl = carfaxVehicleUrl(listing.vin);
  if (carfaxUrl) {
    carfaxLink.href = carfaxUrl;
    carfaxLink.setAttribute(
      "aria-label",
      `View the CARFAX report for the ${listing.year} ${vehicleName} at ${listing.dealer}`
    );
  } else {
    carfaxLink.hidden = true;
  }
  return card;
}

function activeFilterEntries() {
  const selectedLabel = (control) => control.value
    ? control.options[control.selectedIndex].textContent
    : "";
  return [
    ["year", controls.year.value && `Year: ${controls.year.value}`],
    ["dealership", controls.dealership.value],
    ["trim", controls.trim.value],
    ["mileage", controls.mileage.value && `Up to ${Number(controls.mileage.value).toLocaleString()} mi`],
    ["price", controls.price.value && `Up to $${Number(controls.price.value).toLocaleString()}`],
    ["color", controls.color.value],
    ["interiorColor", controls.interiorColor.value && `Interior: ${controls.interiorColor.value}`],
    ["usage", controls.usage.value],
    ["accidentHistory", selectedLabel(controls.accidentHistory)],
    ["ownership", selectedLabel(controls.ownership)],
    ["certification", selectedLabel(controls.certification)],
    ["recency", selectedLabel(controls.recency)],
    ["photos", selectedLabel(controls.photos)],
    ["brandDealer", controls.brandDealer.checked && dealerOnlyLabel],
    ["newToday", controls.newToday.checked && "New today"]
  ].filter(([, label]) => label);
}

function render() {
  const listings = sortListings(data.listings.filter(matches));
  grid.replaceChildren(...listings.map(renderCard));
  document.querySelector("#result-count").textContent = listings.length;
  document.querySelector("#empty-state").hidden = listings.length !== 0;

  const chips = activeFilterEntries().map(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = `${label} ×`;
    button.addEventListener("click", () => {
      controls[key].type === "checkbox" ? controls[key].checked = false : controls[key].value = "";
      render();
    });
    return button;
  });
  document.querySelector("#active-filters").replaceChildren(...chips);
}

Object.values(controls).forEach((control) => control.addEventListener("change", render));
document.querySelector("#clear-filters").addEventListener("click", () => {
  Object.values(controls).forEach((control) => {
    if (control === controls.sort) return;
    control.type === "checkbox" ? control.checked = false : control.value = "";
  });
  render();
});

const notice = document.querySelector("#cache-notice");
notice.className = `cache-notice ${data.refreshError ? "cache-error" : "cache-ok"}`;
notice.textContent = data.publishedSnapshot
  ? `Published inventory snapshot from ${data.lastRefreshDate}. This page makes no external data requests.`
  : data.refreshError
  ? `${data.refreshError} Showing the most recent successful cache.`
  : `${data.newCount} new and ${data.removedCount} removed in today's refresh.`;

const stats = data.publishedSnapshot
  ? [
      ["Source results", data.apiTotal.toLocaleString()],
      ["Published listings", data.listingCount.toLocaleString()],
      ["Snapshot API calls", data.lastAttemptCalls.toLocaleString()],
      ["New in snapshot", data.newCount.toLocaleString()],
      ["Removed in snapshot", data.removedCount.toLocaleString()],
      ["Snapshot date", data.lastRefreshDate || "Not yet refreshed"]
    ]
  : [
      ["Source results", data.apiTotal.toLocaleString()],
      ["Cached listings", data.listingCount.toLocaleString()],
      ["API calls today", data.lastAttemptCalls.toLocaleString()],
      ["New today", data.newCount.toLocaleString()],
      ["Removed today", data.removedCount.toLocaleString()],
      ["Refresh date", data.lastRefreshDate || "Not yet refreshed"]
    ];
document.querySelector("#cache-stats").replaceChildren(...stats.map(([label, value]) => {
  const node = document.createElement("div");
  const heading = document.createElement("small");
  heading.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  node.append(heading, content);
  return node;
}));
document.querySelector("#updated-at").textContent = data.updatedAt
  ? `Inventory snapshot updated ${new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(data.updatedAt))}.`
  : "Inventory cache has not been populated.";

render();
}
