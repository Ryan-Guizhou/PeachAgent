"""Vendor acceptance plan regressions: no credentials, network or paid calls."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("vendor_smoke", ROOT / "vendor-smoke.py")
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


class VendorPlanTest(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads((ROOT / "vendor-smoke.example.json").read_text(encoding="utf-8"))

    def read(self, plan):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            return smoke.read_plan(path)

    def test_all_types_and_routes(self):
        self.assertEqual(self.read(self.plan), self.plan)

    def test_distinct_llm_routes_required(self):
        for vendor in ("anthropic", "dashscope"):
            with self.subTest(vendor=vendor):
                plan = copy.deepcopy(self.plan)
                case = next(c for c in plan["models"] if c["modelType"] == "LLM" and c["vendorKey"] == vendor)
                case["vendorKey"] = "openai"
                case["protocolKey"] = "openai.chat-completions"
                with self.assertRaisesRegex(smoke.SmokeFailure, "^MISSING_LLM_ROUTE$"):
                    self.read(plan)

    def test_missing_type_and_duplicate_model(self):
        plan = copy.deepcopy(self.plan)
        plan["models"][-1]["modelType"] = "LLM"
        with self.assertRaisesRegex(smoke.SmokeFailure, "^MISSING_MODEL_TYPE$"):
            self.read(plan)
        plan = copy.deepcopy(self.plan)
        plan["models"][-1]["modelId"] = plan["models"][0]["modelId"]
        with self.assertRaisesRegex(smoke.SmokeFailure, "^DUPLICATE_MODEL$"):
            self.read(plan)

    def test_external_origin(self):
        for url in ("http://127.0.0.1:18081", "https://localhost", "https://127.0.0.1",
                    "https://10.0.0.1", "https://[::1]", "https://fixture.invalid",
                    "https://provider.example.net/?secret=x", "https://user:password@provider.example.net"):
            self.assertFalse(smoke.external_provider(url), url)
        self.assertTrue(smoke.external_provider("https://api.openai.com/v1"))
        self.assertTrue(smoke.external_provider("https://dashscope.aliyuncs.com/compatible-mode/v1"))

    def test_event_sequence(self):
        def event(seq, event_type, payload):
            return ("data: " + json.dumps({"seq": seq, "eventType": event_type, "payload": payload}) + "\n\n").encode()
        valid = event(1, "status", {}) + event(2, "result", {"text": "ok"}) + event(3, "terminal", {})
        self.assertEqual(smoke.result_payload(valid), {"text": "ok"})
        for invalid in (event(2, "result", {}) + event(3, "terminal", {}),
                        valid + event(4, "status", {})):
            with self.assertRaisesRegex(smoke.SmokeFailure, "^SSE_SEQUENCE_INVALID$"):
                smoke.result_payload(invalid)


if __name__ == "__main__":
    unittest.main()
