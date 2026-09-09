from argparse import ArgumentParser
from pathlib import Path
import importlib.util
import json
import os
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
STATE_FILE = ROOT / "data" / "refresh-state.json"
SNAPSHOT_FILE = ROOT / "data" / "inventory.json"
CACHE_FILE = ROOT / "data" / "auto-dev-cache.json"
MAX_CALLS = 10
MINIMUM_RETENTION_RATIO = 0.5

from auto_dev import server

exporter_spec = importlib.util.spec_from_file_location(
    "export_auto_dev_snapshot",
    ROOT / "scripts" / "export-auto-dev-snapshot.py",
)
exporter = importlib.util.module_from_spec(exporter_spec)
exporter_spec.loader.exec_module(exporter)


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, TypeError):
        return default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def set_output(name, value):
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with Path(output_file).open("a", encoding="utf-8") as output:
            output.write(f"{name}={str(value).lower()}\n")


def reserve_refresh(date, state_file=STATE_FILE):
    state = read_json(state_file, {})
    last_attempt = state.get("lastAttemptDate")
    should_refresh = not last_attempt or last_attempt < date
    if should_refresh:
        state.update(
            {
                "lastAttemptDate": date,
                "lastAttemptCalls": 0,
                "lastError": None,
            }
        )
        write_json(state_file, state)
        print(f"Reserved the inventory refresh for {date}.")
    else:
        print(f"Inventory refresh already attempted on {last_attempt}; no API calls will be made.")
    set_output("should_refresh", should_refresh)
    return should_refresh


def cache_from_snapshot(snapshot, state):
    listings = list(snapshot.get("listings") or [])
    known_vins = dict(state.get("knownVins") or {})
    for listing in listings:
        vin = listing.get("vin")
        if vin:
            known_vins.setdefault(
                vin,
                listing.get("firstSeenDate") or snapshot.get("lastRefreshDate"),
            )

    cache = server.empty_cache()
    cache.update(
        {
            "updatedAt": snapshot.get("updatedAt"),
            "lastRefreshDate": snapshot.get("lastRefreshDate"),
            "lastAttemptDate": state.get("lastSuccessfulRefreshDate"),
            "lastAttemptCalls": 0,
            "apiTotal": snapshot.get("apiTotal", len(listings)),
            "listingCount": len(listings),
            "newCount": snapshot.get("newCount", 0),
            "removedCount": snapshot.get("removedCount", 0),
            "listings": listings,
            "knownVins": known_vins,
        }
    )
    return cache


def refresh_snapshot(
    date,
    api_key,
    state_file=STATE_FILE,
    snapshot_file=SNAPSHOT_FILE,
    cache_file=CACHE_FILE,
    fetcher=None,
):
    state = read_json(state_file, {})
    if state.get("lastAttemptDate") != date:
        raise RuntimeError(f"The {date} refresh was not reserved before API access.")

    snapshot = read_json(snapshot_file, {})
    previous_count = len(snapshot.get("listings") or [])
    write_json(cache_file, cache_from_snapshot(snapshot, state))

    original_cache_file = server.CACHE_FILE
    original_export_source = exporter.SOURCE
    original_export_destination = exporter.DESTINATION
    try:
        server.CACHE_FILE = cache_file
        refreshed = server.refresh_cache(
            fetcher=fetcher,
            date=date,
            api_key=api_key,
            max_calls=MAX_CALLS,
        )
        state["lastAttemptCalls"] = refreshed.get("lastAttemptCalls", 0)
        state["lastError"] = refreshed.get("refreshError")
        refreshed_count = refreshed.get("listingCount", 0)
        minimum_count = max(1, int(previous_count * MINIMUM_RETENTION_RATIO))
        plausible_count = refreshed_count >= minimum_count
        if not refreshed.get("refreshError") and not plausible_count:
            state["lastError"] = (
                f"Refresh returned only {refreshed_count} listings; "
                f"at least {minimum_count} were required."
            )
        success = (
            not state["lastError"]
            and refreshed.get("lastRefreshDate") == date
            and plausible_count
        )
        if success:
            state["lastSuccessfulRefreshDate"] = date
            state["knownVins"] = refreshed.get("knownVins", {})
            exporter.SOURCE = cache_file
            exporter.DESTINATION = snapshot_file
            exporter.export_snapshot()
        write_json(state_file, state)
    finally:
        server.CACHE_FILE = original_cache_file
        exporter.SOURCE = original_export_source
        exporter.DESTINATION = original_export_destination

    set_output("refresh_succeeded", success)
    if success:
        print(
            f"Published {refreshed['listingCount']} listings from "
            f"{refreshed['lastAttemptCalls']} API calls."
        )
    else:
        print(f"Refresh failed after {state['lastAttemptCalls']} calls: {state['lastError']}")
    return success


def main():
    parser = ArgumentParser()
    parser.add_argument("operation", choices=("reserve", "refresh"))
    parser.add_argument("--date", required=True)
    args = parser.parse_args()

    if args.operation == "reserve":
        reserve_refresh(args.date)
        return

    refresh_snapshot(args.date, os.environ.get("AUTO_DEV_API_KEY"))


if __name__ == "__main__":
    main()
