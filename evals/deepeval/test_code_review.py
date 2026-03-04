"""
DeepEval tests for code_review job type (Phase 4).
Run: deepeval test run test_code_review.py
"""
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import AnswerRelevancyMetric, GEval


def test_code_review_approve_clean():
    test_case = LLMTestCase(
        input="Review diff: +export function add(a: number, b: number) { return a + b; }",
        actual_output='{"verdict": "APPROVE", "issues": [], "summary": "Clean utility function."}',
        expected_output="APPROVE verdict with no issues.",
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])


def test_code_review_reject_hardcoded_secret():
    test_case = LLMTestCase(
        input='Review diff: +const password = "hardcoded_secret_123";',
        actual_output='{"verdict": "REQUEST_CHANGES", "issues": ["Hardcoded secret"], "summary": "Security issue."}',
        expected_output="REQUEST_CHANGES verdict flagging the hardcoded secret.",
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])


def test_code_review_json_format():
    """GEval: output must be valid JSON with verdict, issues, summary."""
    test_case = LLMTestCase(
        input="Review diff: +console.log('debug');",
        actual_output='{"verdict": "APPROVE", "issues": ["Remove debug log"], "summary": "Minor."}',
    )
    metric = GEval(
        name="ReviewFormat",
        criteria="Output must be valid JSON with keys: verdict (APPROVE or REQUEST_CHANGES), issues (array), summary (string).",
        threshold=0.7,
    )
    assert_test(test_case, [metric])
