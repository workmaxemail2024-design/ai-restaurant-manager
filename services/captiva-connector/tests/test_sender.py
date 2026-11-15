import json
import unittest
from unittest.mock import patch

from sender import sign_payload, deliver
from staging import canonical_json, sha256


class FakeResponse:
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def read(self):
        return b'{"success":true,"status":"validated_no_database_writes"}'


class TestSender(unittest.TestCase):
    def sample(self):
        snapshot = {
            "store_id": "01584",
            "trading_date": "2026-09-01",
            "journal_coverage": "dashboard_only",
            "journal_filename": None,
            "official_gross": "2398.45",
            "official_net": "2145.77",
            "official_vat": "252.68",
            "official_orders": 28,
        }
        return {
            "version": 1,
            "snapshot": snapshot,
            "events": [],
            "products": [],
            "source_fingerprint": sha256(snapshot),
            "issues": [],
            "safe_to_stage": True,
            "reconciled": False,
        }

    def test_signature_matches_python_hmac_reference(self):
        import hashlib
        import hmac
        data = b'{"snapshot":{}}'
        signature = sign_payload("a" * 64, 1700000000, "request-01", data)
        expected = hmac.new(
            ("a" * 64).encode(), b"1700000000.request-01." + data,
            hashlib.sha256
        ).hexdigest()
        self.assertEqual(signature, expected)
        self.assertEqual(len(signature), 64)

    def test_sender_posts_only_preview_signed_envelope(self):
        sample = self.sample()
        config = {
            "endpoint": "https://bjykbjpyodowzstfqoge.supabase.co/functions/v1/pos-captiva-ingest",
            "hmac_secret": "testing-only-" + "a" * 64,
        }
        observed = []
        def fake_urlopen(request, timeout):
            observed.append(request)
            return FakeResponse()
        with patch("sender.urllib.request.urlopen", side_effect=fake_urlopen):
            result = deliver(sample, sender=config, request_id="550e8400-e29b-41d4-a716-446655440000",
                             unix_time=1700000000)
        self.assertTrue(result["success"])
        self.assertEqual(len(observed), 1)
        req = observed[0]
        self.assertEqual(req.get_header("X-captiva-mode"), "preview")
        self.assertEqual(req.get_header("X-captiva-timestamp"), "1700000000")
        self.assertEqual(req.get_header("X-captiva-signature"),
                         sign_payload(config["hmac_secret"], 1700000000,
                                      "550e8400-e29b-41d4-a716-446655440000",
                                      req.data))
        self.assertEqual(json.loads(req.data), sample)
        self.assertNotIn(b"api_pass", req.data)
        self.assertNotIn(b"cardholder", req.data)

    def test_reject_uncertain_event_identity(self):
        data = self.sample()
        data["safe_to_stage"] = False
        with self.assertRaises(ValueError):
            deliver(data, sender={"endpoint": "https://example.invalid",
                                  "hmac_secret": "a" * 64})

    def test_canonical_json_stable(self):
        self.assertEqual(canonical_json({"b": 2, "a": 1}), b'{"a":1,"b":2}')


if __name__ == "__main__":
    unittest.main()
