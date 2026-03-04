"""
DeepEval tests for triage job type (Phase 4).
Run: deepeval test run test_triage.py
"""
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import AnswerRelevancyMetric, GEval


def test_triage_bug_high():
    test_case = LLMTestCase(
        input="Title: App crashes on login with empty password. Body: Unhandled exception on empty input.",
        actual_output='{"severity": "high", "type": "bug", "summary": "Crash on empty password input."}',
        expected_output="High severity bug classification.",
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])


def test_triage_feature_low():
    test_case = LLMTestCase(
        input="Title: Add dark mode support. Body: Nice-to-have dark mode toggle in settings.",
        actual_output='{"severity": "low", "type": "feature", "summary": "Dark mode toggle request."}',
        expected_output="Low severity feature request classification.",
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])


def test_triage_json_format():
    """GEval: output must be valid JSON with severity, type, summary."""
    test_case = LLMTestCase(
        input="Title: Typo in docs. Body: README has a typo in the setup section.",
        actual_output='{"severity": "low", "type": "docs", "summary": "Typo in README setup section."}',
    )
    metric = GEval(
        name="TriageFormat",
        criteria="Output must be valid JSON with keys: severity (low/medium/high/critical), type (bug/feature/docs/chore), summary (string).",
        threshold=0.7,
    )
    assert_test(test_case, [metric])
