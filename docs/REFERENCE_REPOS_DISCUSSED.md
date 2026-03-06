# Reference: Repos We Discussed (AI Factory + ProfessorX)

This document records the **full list of GitHub repos** we discussed for the AI Factory and ProfessorX architecture. Many of these are not yet integrated; this serves as the single source of truth for what was in scope and what’s still missing.

**Related:** [STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md), [FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md](FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md), [LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md).

---

## Priority subset (most critical for AI Factory + ProfessorX)

These map to the main layers we’re building:

| Layer | Repo | Status in our system |
|-------|------|----------------------|
| **AI orchestration** | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | **Kernel pattern** — we use a DAG/state-machine model; LangGraph is the stated reference; no direct dependency yet. |
| **AI orchestration** | [CrewAIInc/crewAI](https://github.com/CrewAIInc/crewAI) | **Edge executor** — doc’d for `research` and multi-agent; optional plug-in, not yet wired. |
| **Workflow DAGs** | [temporalio/temporal](https://github.com/temporalio/temporal) | **Not used** — we use Postgres + scheduler; “optional upgrade to Temporal later” in STACK_AND_DECISIONS. |
| **Workflow DAGs** | [dagster-io/dagster](https://github.com/dagster-io/dagster) | **Not used** — custom plan DAG in control-plane. |
| **Schema / data layer** | [supabase/supabase](https://github.com/supabase/supabase) | **In use** — DB, Auth, migrations. |
| **Schema / data layer** | [prisma/prisma](https://github.com/prisma/prisma) | **Partial** — email-marketing-factory uses Prisma; Console/Control Plane use Supabase client. |
| **Schema / data layer** | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | **Not used** — we use Supabase/Postgres client. |
| **UI / design system** | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | **In use** — Console + packages/ui. |
| **UI / design system** | [radix-ui/primitives](https://github.com/radix-ui/primitives) | **In use** — via shadcn. |
| **AI UI / generation** | [vercel/ai](https://github.com/vercel/ai) | **Not used** — we use custom LLM client / gateway; could adopt for streaming/UX. |
| **AI UI / generation** | [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | **Not used** — optional for 3D/visual outputs. |
| **Vector / RAG** | [run-llama/llama_index](https://github.com/run-llama/llama_index) | **Not used** — we have repo_summary/artifacts and pgvector; LlamaIndex would extend RAG. |
| **Observability** | (Langfuse, Sentry, etc.) | **Sentry wired** (optional `SENTRY_DSN` in Control Plane, Runner, Console). Langfuse doc’d for LiteLLM gateway. |

---

## Full list by category

### AI orchestration / agent frameworks

- [langchain-ai/langchain](https://github.com/langchain-ai/langchain)
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)
- [CrewAIInc/crewAI](https://github.com/CrewAIInc/crewAI)
- [microsoft/autogen](https://github.com/microsoft/autogen)
- [openai/evals](https://github.com/openai/evals)
- [stanfordnlp/dspy](https://github.com/stanfordnlp/dspy)
- [signalfx/signalflow](https://github.com/signalfx/signalflow)
- [huggingface/transformers](https://github.com/huggingface/transformers)
- [huggingface/text-generation-inference](https://github.com/huggingface/text-generation-inference)
- [litellm/litellm](https://github.com/litellm/litellm) — **in use** as LLM gateway pattern; we use LiteLLM proxy.
- [jxnl/instructor](https://github.com/jxnl/instructor)
- [mem0ai/mem0](https://github.com/mem0ai/mem0)

### AI developer automation / software factories

- [continue-revolution/continue](https://github.com/continue-revolution/continue)
- [smol-ai/developer](https://github.com/smol-ai/developer)
- [patchy631/ai-engineer](https://github.com/patchy631/ai-engineer)
- [open-interpreter/open-interpreter](https://github.com/open-interpreter/open-interpreter)
- [Aider-AI/aider](https://github.com/Aider-AI/aider)
- [coder/coder](https://github.com/coder/coder)
- [gitpod-io/gitpod](https://github.com/gitpod-io/gitpod)
- [sourcegraph/sourcegraph](https://github.com/sourcegraph/sourcegraph)
- [stackblitz/bolt](https://github.com/stackblitz/bolt)

### Workflow orchestration / DAG engines

- [temporalio/temporal](https://github.com/temporalio/temporal)
- [dagster-io/dagster](https://github.com/dagster-io/dagster)
- [prefecthq/prefect](https://github.com/prefecthq/prefect)
- [apache/airflow](https://github.com/apache/airflow)
- [kestra-io/kestra](https://github.com/kestra-io/kestra)
- [argo-workflows/argo-workflows](https://github.com/argo-workflows/argo-workflows)
- [netflix/conductor](https://github.com/netflix/conductor)
- [cadence-workflow/cadence](https://github.com/cadence-workflow/cadence)

### Schema-first backend / data layers

- [supabase/supabase](https://github.com/supabase/supabase) — **in use**
- [prisma/prisma](https://github.com/prisma/prisma) — **partial** (email-marketing-factory)
- [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)
- [postgrest/postgrest](https://github.com/postgrest/postgrest)
- [hasura/graphql-engine](https://github.com/hasura/graphql-engine)
- [graphql/graphql-js](https://github.com/graphql/graphql-js)
- [apollographql/apollo-server](https://github.com/apollographql/apollo-server)
- [trpc/trpc](https://github.com/trpc/trpc)
- [supabase/postgrest-js](https://github.com/supabase/postgrest-js)

### Vector databases / semantic retrieval

- [qdrant/qdrant](https://github.com/qdrant/qdrant)
- [milvus-io/milvus](https://github.com/milvus-io/milvus)
- [weaviate/weaviate](https://github.com/weaviate/weaviate)
- [pinecone-io/examples](https://github.com/pinecone-io/examples)
- [chroma-core/chroma](https://github.com/chroma-core/chroma)
- [lance-db/lancedb](https://github.com/lance-db/lancedb)
- [pgvector/pgvector](https://github.com/pgvector/pgvector) — **in use** (Supabase/Postgres)

### Observability / debugging

- [open-telemetry/opentelemetry-collector](https://github.com/open-telemetry/opentelemetry-collector)
- [prometheus/prometheus](https://github.com/prometheus/prometheus)
- [grafana/grafana](https://github.com/grafana/grafana)
- [getsentry/sentry](https://github.com/getsentry/sentry) — **wired** (optional `SENTRY_DSN` in Control Plane, Runner, Console)
- [openobserve/openobserve](https://github.com/openobserve/openobserve)
- [jaegertracing/jaeger](https://github.com/jaegertracing/jaeger)

### Frontend / UI component systems

- [shadcn-ui/ui](https://github.com/shadcn-ui/ui) — **in use**
- [radix-ui/primitives](https://github.com/radix-ui/primitives) — **in use** (via shadcn)
- [tailwindlabs/headlessui](https://github.com/tailwindlabs/headlessui)
- [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) — **in use**
- [chakra-ui/chakra-ui](https://github.com/chakra-ui/chakra-ui)
- [mui/material-ui](https://github.com/mui/material-ui) — **partial** (email-marketing-factory)
- [ant-design/ant-design](https://github.com/ant-design/ant-design)
- [nextui-org/nextui](https://github.com/nextui-org/nextui)

### React / web frameworks

- [vercel/next.js](https://github.com/vercel/next.js) — **in use**
- [remix-run/remix](https://github.com/remix-run/remix)
- [sveltejs/kit](https://github.com/sveltejs/kit)
- [nuxt/nuxt](https://github.com/nuxt/nuxt)
- [astro-build/astro](https://github.com/astro-build/astro)

### Design systems used by major platforms

- [vercel/vercel](https://github.com/vercel/vercel)
- [stripe/stripe-node](https://github.com/stripe/stripe-node)
- [stripe/openapi](https://github.com/stripe/openapi)
- [linear/linear](https://github.com/linear/linear)
- [linear/linear-api](https://github.com/linear/linear-api)
- [shopify/polaris](https://github.com/shopify/polaris)
- [salesforce/design-system](https://github.com/salesforce/design-system)

### AI UI / generative interface experiments

- [vercel/ai](https://github.com/vercel/ai)
- [remotion-dev/remotion](https://github.com/remotion-dev/remotion)
- [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber)
- [pmndrs/drei](https://github.com/pmndrs/drei)
- [framer/motion](https://github.com/framer/motion)
- [reactflow/reactflow](https://github.com/reactflow/reactflow) — **in use** (Console plan DAG view)

### Developer tooling / repo introspection

- [ripgrep/ripgrep](https://github.com/ripgrep/ripgrep)
- [sharkdp/fd](https://github.com/sharkdp/fd)
- [jesseduffield/lazygit](https://github.com/jesseduffield/lazygit)
- [cli/cli](https://github.com/cli/cli)
- [neovim/neovim](https://github.com/neovim/neovim)

### API infrastructure

- [kong/kong](https://github.com/kong/kong)
- [envoyproxy/envoy](https://github.com/envoyproxy/envoy)
- [traefik/traefik](https://github.com/traefik/traefik)
- [grpc/grpc](https://github.com/grpc/grpc)

### Knowledge bases / RAG tooling

- [run-llama/llama_index](https://github.com/run-llama/llama_index)
- [embedchain/embedchain](https://github.com/embedchain/embedchain)
- [docarray/docarray](https://github.com/docarray/docarray)
- [haystack-ai/haystack](https://github.com/haystack-ai/haystack)

### Prompt / evaluation / dataset tools

- [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) — **in use** (evals)
- [langfuse/langfuse](https://github.com/langfuse/langfuse) — **doc’d**, optional
- [helixml/helix](https://github.com/helixml/helix)

### Misc infrastructure useful for AI factories

- [hashicorp/terraform](https://github.com/hashicorp/terraform) — **in use** (infra/)
- [pulumi/pulumi](https://github.com/pulumi/pulumi)
- [docker/compose](https://github.com/docker/compose)
- [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes)

---

## Gaps: what we discussed vs what we have

| Area | Discussed | Current state |
|------|-----------|----------------|
| **AI orchestration** | LangGraph as kernel; CrewAI, AutoGen as edges | Custom DAG in control-plane; CrewAI/AutoGen doc’d as optional, not integrated. |
| **Workflow engine** | Temporal, Dagster, Prefect, Airflow, etc. | In-process scheduler + Postgres; no external DAG engine. |
| **Schema / ORM** | Supabase + Prisma + Drizzle | Supabase everywhere; Prisma only in email-marketing-factory; no Drizzle. |
| **Vector / RAG** | pgvector + LlamaIndex, Chroma, etc. | pgvector in use; no LlamaIndex or other RAG stack. |
| **Observability** | OTel, Prometheus, Grafana, Sentry, OpenObserve | **Sentry wired** (Control Plane, Runner, Console) when `SENTRY_DSN` is set. Health endpoints + Console cards. Langfuse for LLM traces via LiteLLM (doc’d). |
| **AI UI** | vercel/ai, react-three-fiber | Custom LLM client; no vercel/ai; no 3D stack. |
| **Evals** | promptfoo, langfuse, openai/evals, dspy | Promptfoo in use; others doc’d or not integrated. |
| **Developer automation** | Continue, Bolt, Aider, Coder, Gitpod, Sourcegraph | Not integrated; MCP + custom runners only. |

Use this doc to drive **enablement plans** (e.g. [ENABLEMENT_PLAN_FULL_VISION.md](ENABLEMENT_PLAN_FULL_VISION.md)) and prioritization when adding the next layer (e.g. Temporal, CrewAI, vercel/ai, LlamaIndex, or observability).
