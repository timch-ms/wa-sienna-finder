from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from urllib.error import URLError
import importlib.util
import json

script_spec = importlib.util.spec_from_file_location(
    "refresh_published_inventory",
    Path(__file__).resolve().parent.parent / "scripts" / "refresh-published-inventory.py",
)
refresh = importlib.util.module_from_spec(script_spec)
script_spec.loader.exec_module(refresh)


def raw_listing(vin):
    return {
        "vin": vin,
        "vehicle": {
            "vin": vin,
            "year": 2024,
            "make": "BMW",
            "model": "iX",
            "trim": "xDrive50",
        },
        "retailListing": {
            "dealer": "BMW Seattle",
            "city": "Seattle",
            "state": "WA",
            "used": True,
            "price": 50000,
            "miles": 10000,
        },
        "history": {},
    }


class PublishedInventoryRefreshTests(TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        root = Path(self.temporary.name)
        self.original_site_config_file = refresh.server.SITE_CONFIG_FILE
        refresh.server.SITE_CONFIG_FILE = root / "site-config.json"
        refresh.server.SITE_CONFIG_FILE.write_text(
            '{"make":"BMW","model":"iX","minimumYear":2022,'
            '"officialDealerNamePatterns":["BMW"]}',
            encoding="utf-8",
        )
        self.state_file = root / "refresh-state.json"
        self.snapshot_file = root / "inventory.json"
        self.cache_file = root / "cache.json"
        self.snapshot_file.write_text(
            json.dumps(
                {
                    "updatedAt": "2026-09-08T12:00:00-07:00",
                    "lastRefreshDate": "2026-09-08",
                    "lastAttemptCalls": 5,
                    "apiTotal": 1,
                    "listingCount": 1,
                    "newCount": 0,
                    "removedCount": 0,
                    "listings": [
                        {
                            "vin": "WB523CF0000000001",
                            "firstSeenDate": "2026-09-08",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        refresh.server.SITE_CONFIG_FILE = self.original_site_config_file
        self.temporary.cleanup()

    def test_reservation_allows_only_one_attempt_per_day(self):
        self.assertTrue(refresh.reserve_refresh("2026-09-09", self.state_file))
        self.assertFalse(refresh.reserve_refresh("2026-09-09", self.state_file))
        self.assertFalse(refresh.reserve_refresh("2026-09-08", self.state_file))

    def test_automated_refresh_allows_up_to_ten_calls(self):
        self.assertEqual(refresh.MAX_CALLS, 10)

    def test_successful_refresh_updates_snapshot_and_state(self):
        refresh.reserve_refresh("2026-09-09", self.state_file)
        calls = []

        def fetcher(_key, page, _config):
            calls.append(page)
            return {"total": 1, "data": [raw_listing("WB523CF0000000002")]}

        succeeded = refresh.refresh_snapshot(
            "2026-09-09",
            "test",
            state_file=self.state_file,
            snapshot_file=self.snapshot_file,
            cache_file=self.cache_file,
            fetcher=fetcher,
        )

        state = json.loads(self.state_file.read_text(encoding="utf-8"))
        snapshot = json.loads(self.snapshot_file.read_text(encoding="utf-8"))
        self.assertTrue(succeeded)
        self.assertEqual(calls, [1])
        self.assertEqual(state["lastSuccessfulRefreshDate"], "2026-09-09")
        self.assertEqual(snapshot["lastRefreshDate"], "2026-09-09")
        self.assertEqual(snapshot["listings"][0]["vin"], "WB523CF0000000002")

    def test_failed_refresh_retains_previous_snapshot(self):
        refresh.reserve_refresh("2026-09-09", self.state_file)
        original_snapshot = self.snapshot_file.read_text(encoding="utf-8")

        def fetcher(_key, _page, _config):
            raise URLError("offline")

        succeeded = refresh.refresh_snapshot(
            "2026-09-09",
            "test",
            state_file=self.state_file,
            snapshot_file=self.snapshot_file,
            cache_file=self.cache_file,
            fetcher=fetcher,
        )

        state = json.loads(self.state_file.read_text(encoding="utf-8"))
        self.assertFalse(succeeded)
        self.assertEqual(state["lastAttemptCalls"], 1)
        self.assertIn("Could not reach Auto.dev", state["lastError"])
        self.assertEqual(self.snapshot_file.read_text(encoding="utf-8"), original_snapshot)

    def test_implausibly_empty_refresh_retains_previous_snapshot(self):
        refresh.reserve_refresh("2026-09-09", self.state_file)
        original_snapshot = self.snapshot_file.read_text(encoding="utf-8")

        def fetcher(_key, _page, _config):
            return {"total": 0, "data": []}

        succeeded = refresh.refresh_snapshot(
            "2026-09-09",
            "test",
            state_file=self.state_file,
            snapshot_file=self.snapshot_file,
            cache_file=self.cache_file,
            fetcher=fetcher,
        )

        state = json.loads(self.state_file.read_text(encoding="utf-8"))
        self.assertFalse(succeeded)
        self.assertIn("at least 1 were required", state["lastError"])
        self.assertEqual(self.snapshot_file.read_text(encoding="utf-8"), original_snapshot)


if __name__ == "__main__":
    main()
