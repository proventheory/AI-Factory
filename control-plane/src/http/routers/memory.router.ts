import { Router } from "express";
import {
  memoryLookup,
  memoryEntriesList,
  agentMemoryList,
  agentMemoryGetById,
  agentMemoryPost,
  agentMemoryPatch,
  mcpServersList,
  mcpServersGetById,
  mcpServersPost,
  mcpServersPatch,
  mcpServersDelete,
  mcpServersTest,
  routingPoliciesList,
  routingPoliciesPost,
  llmBudgetsList,
  llmBudgetsPost,
} from "../controllers/memory.controller.js";

const router = Router();

router.get("/v1/memory/lookup", memoryLookup);
router.get("/v1/memory_entries", memoryEntriesList);
router.get("/v1/agent_memory", agentMemoryList);
router.get("/v1/agent_memory/:id", agentMemoryGetById);
router.post("/v1/agent_memory", agentMemoryPost);
router.patch("/v1/agent_memory/:id", agentMemoryPatch);
router.get("/v1/mcp_servers", mcpServersList);
router.get("/v1/mcp_servers/:id", mcpServersGetById);
router.post("/v1/mcp_servers", mcpServersPost);
router.patch("/v1/mcp_servers/:id", mcpServersPatch);
router.delete("/v1/mcp_servers/:id", mcpServersDelete);
router.post("/v1/mcp_servers/:id/test", mcpServersTest);
router.get("/v1/routing_policies", routingPoliciesList);
router.post("/v1/routing_policies", routingPoliciesPost);
router.get("/v1/llm_budgets", llmBudgetsList);
router.post("/v1/llm_budgets", llmBudgetsPost);

export default router;
