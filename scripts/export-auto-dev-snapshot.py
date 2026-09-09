from pathlib import Path
from urllib.parse import urlparse
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "auto-dev-cache.json"
DESTINATION = ROOT / "data" / "inventory.json"
OVERRIDES = ROOT / "data" / "listing-overrides.json"
LISTING_FIELDS = {
    "id",
    "vin",
    "year",
    "make",
    "model",
    "trim",
    "price",
    "mileage",
    "exteriorColor",
    "interiorColor",
    "seats",
    "drivetrain",
    "dealer",
    "officialBrandDealer",
    "city",
    "state",
    "zip",
    "cpo",
    "oneOwner",
    "accidentFree",
    "accidentCount",
    "usageType",
    "image",
    "photoCount",
    "url",
    "listedAt",
    "isNew",
    "firstSeenDate",
}


def apply_override(listing, override):
    corrected = dict(listing)
    if isinstance(override.get("cpo"), bool):
        corrected["cpo"] = override["cpo"]
    if "url" in override:
        url = override["url"]
        if url is None:
            corrected["url"] = None
        elif isinstance(url, str) and urlparse(url).scheme == "https":
            corrected["url"] = url
    return corrected


def export_snapshot():
    cache = json.loads(SOURCE.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    listings = [
        {
            key: value
            for key, value in apply_override(
                listing,
                overrides.get(listing.get("vin"), {}),
            ).items()
            if key in LISTING_FIELDS
        }
        for listing in cache.get("listings", [])
    ]
    snapshot = {
        "publishedSnapshot": True,
        "updatedAt": cache.get("updatedAt"),
        "lastRefreshDate": cache.get("lastRefreshDate"),
        "lastAttemptCalls": cache.get("lastAttemptCalls", 0),
        "apiTotal": cache.get("apiTotal", len(listings)),
        "listingCount": len(listings),
        "newCount": cache.get("newCount", 0),
        "removedCount": cache.get("removedCount", 0),
        "listings": listings,
    }
    temporary = DESTINATION.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    temporary.replace(DESTINATION)
    print(f"Exported {len(listings)} sanitized Auto.dev listings to {DESTINATION}")


if __name__ == "__main__":
    export_snapshot()
