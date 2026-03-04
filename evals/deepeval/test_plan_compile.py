"""
DeepEval tests for plan_compile job type (Phase 4).
Run: deepeval test run test_plan_compile.py
Requires: pip install deepeval openai
"""
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import AnswerRelevancyMetric, GEval

SYSTEM_PROMPT = (
    "You are a software project planner. Given an initiative, "
    "produce a concise plan with numbered steps including design, "
    "implementation, testing, and review phases."
)


def test_plan_compile_software_initiative():
    test_case = LLMTestCase(
        input="Build a REST API for user management with CRUD, auth, and RBAC.",
        actual_output=(
            "1. Requirements analysis\n"
            "2. API design and schema\n"
            "3. Implement CRUD endpoints\n"
            "4. Add authentication middleware\n"
            "5. Implement role-based access control\n"
            "6. Write unit and integration tests\n"
            "7. Code review\n"
            "8. Deploy to staging"
        ),
        expected_output="A numbered plan with 5-10 steps covering design, implementation, testing, and review.",
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])


def test_plan_compile_migration():
    test_case = LLMTestCase(
        input="Migrate database from MySQL to PostgreSQL with rollback plan.",
        actual_output=(
            "1. Analyze current MySQL schema\n"
            "2. Design PostgreSQL schema mapping\n"
            "3. Write migration scripts\n"
            "4. Test migration on staging\n"
            "5. Create rollback procedure\n"
            "6. Execute production migration\n"
            "7. Validate data integrity"
        ),
        expected_output="A numbered plan covering schema analysis, migration, testing, and rollback.",
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])


def test_plan_compile_completeness():
    """GEval: check that plan covers required phases."""
    test_case = LLMTestCase(
        input="Build a real-time chat application with WebSocket support.",
        actual_output=(
            "1. Design system architecture\n"
            "2. Set up WebSocket server\n"
            "3. Implement message handling\n"
            "4. Build client-side UI\n"
            "5. Add authentication\n"
            "6. Write tests\n"
            "7. Load testing\n"
            "8. Deploy"
        ),
    )
    metric = GEval(
        name="PlanCompleteness",
        criteria="The plan must include design, implementation, testing, and deployment phases.",
        threshold=0.7,
    )
    assert_test(test_case, [metric])
