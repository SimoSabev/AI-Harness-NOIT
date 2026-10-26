# Research strategies for Мандат E9г: architecture, cost, retrieval, fetching, UX, evaluation

Prepared 2026-10-26 for E9г (spec §5.4), PRD §6.13 and spike RS. This builds on `docs/prd/research/research-tools.md` (2026-10-22), which already covers provider pricing, citation formats, verification statistics and source pinning. Those tables are not repeated here. This report covers **how** to build the pipeline: the loop, roles and models, budgets, retrieval quality, fetching, the live UI and evaluation.

## Legend and method

- **[V]**: read on the primary page (vendor engineering blog, docs, README, arXiv abstract or HTML, RFC) on 2026-10-26 via WebFetch.
- **[V-sec]**: read in full, but on a secondary page (news, third-party write-up). Treat it as a report about the fact, not the fact itself.
- **[НП]**: only seen in search snippets or aggregator summaries. It needs re-checking before it goes into docs/decisions.md (AGENTS.md rule 9).
- **[L]**: read from a local file on this machine (Anthropic's own `deep-research` skill bundle in the Claude desktop plugin cache). It was read on 2026-10-26 and has no public URL.
- **[D]**: a design inference by the author, not a sourced fact.
- All access dates are **2026-10-26** unless stated otherwise. Prices are USD.

Several vendor pages returned 403 to WebFetch: openai.com/index/*, help.openai.com, and cdn.openai.com (the system card PDF could not be decoded). OpenAI product facts are therefore [V-sec] or [НП].

---

## 1. Architectures of agentic deep research

### 1.1 Anthropic multi-agent Research (orchestrator–worker) [V]

Source: https://www.anthropic.com/engineering/multi-agent-research-system (published 2025-06-13).

- **Shape.** A lead agent (Opus 4) plans, saves the plan to Memory and spawns subagents (Sonnet 4). Memory matters because context beyond 200k tokens is truncated. Subagents search in parallel and return findings. The lead decides whether to spawn more or change strategy. When it is done, a separate **CitationAgent** places the citations. The design is "multi-step and adaptive", unlike static RAG.
- **Quality vs. cost numbers.**
  - Multi-agent (Opus lead with Sonnet workers) beat single-agent Opus by **90.2%** on Anthropic's internal research eval.
  - On BrowseComp, **three factors explain 95% of variance**. Token usage alone explains **80%**; tool-call count and model choice explain the rest.
  - Agents use about **4×** the tokens of chat; multi-agent systems about **15×**.
  - Upgrading the model (Sonnet 3.7 → Sonnet 4) gave a bigger gain than **doubling the token budget** on Sonnet 3.7.
  - Takeaway: spend tokens where the value is high, and pick a stronger model rather than looping a weak one longer.
- **Effort-scaling rules, embedded in prompts.**
  - Simple fact-finding: 1 agent, 3–10 tool calls.
  - Direct comparisons: 2–4 subagents, 10–15 calls each.
  - Complex research: more than 10 subagents with clearly divided responsibilities.
  - Early failures: 50 subagents spawned for simple queries, and endless searching for sources that do not exist.
- **Parallelism.** The lead runs 3–5 subagents in parallel, and each subagent runs 3+ tool calls in parallel. This cut research time by up to 90% on complex queries.
- **Prompting principles.**
  - Delegate with an objective, an output format, tool and source guidance, and task boundaries.
  - Scale effort to complexity.
  - Give tools distinct purposes. A tool-testing agent that rewrote MCP tool descriptions cut task time by 40%.
  - **Start wide, then narrow**: short broad queries first.
  - Use extended thinking for planning and **interleaved thinking after tool results** to judge quality and refine queries.
  - Parallelize tool calls.
- **Evaluation.**
  - Start with about **20 real queries**; large early effect sizes make small samples enough.
  - LLM judge with a rubric: factual accuracy, citation accuracy, completeness, source quality, tool efficiency.
  - A **single LLM call** that outputs 0.0–1.0 scores plus pass/fail was the most consistent and the best aligned with humans.
  - Human testing caught agents preferring **SEO content farms** over authoritative sources.
- **Context.**
  - Summarize completed phases and store essentials externally.
  - Near the limit, spawn fresh subagents with clean contexts.
  - Subagents write outputs to external storage and pass **lightweight references** back. This avoids the "game of telephone".
- **Production.**
  - Agents are stateful, so the system resumes from the failure point with retries and checkpoints.
  - The agent is told when a tool is failing.
  - Tracing watches decision patterns without reading contents.
  - Rainbow deployments.
  - Known bottleneck: the lead waits on subagents synchronously.

Companion post: "Effective context engineering for AI agents" (2025-09-29) [V], https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents.
- Subagents return condensed summaries of **"often 1,000-2,000 tokens"**.
- **Just-in-time retrieval**: keep identifiers such as URLs and paths, and load content only when needed.
- **Tool-result clearing** is the "safest lightest touch" form of compaction.
- **Structured note-taking**: a NOTES.md or to-do list kept outside the context.
- Compaction prompts: maximize recall first, then precision.
- "Context rot": recall degrades as the context grows.
- Tool results should be token-efficient.

Claude Code's bundled `/deep-research` workflow [V], https://code.claude.com/docs/en/workflows.md:
- It "fans out web searches on a question across several angles, fetches and cross-checks the sources it finds, **votes on each claim**, and returns a cited report with claims that didn't survive cross-checking filtered out".
- A claim the verifiers could not check, for example after a rate limit or API error, is listed as **unverified, not refuted**.
- Orchestration lives in a script, so intermediate results stay in script variables rather than the model's context.
- Progress view: **phases with agent counts**. You can drill into each agent's prompt, recent tool calls and result, plus per-agent token usage. Controls are pause, stop and restart.
- Before the run starts, an approval card shows the phase list and a token-usage caution.
- Runtime caps: 16 concurrent agents by default, 1,000 agents per run.
- A "Large workflow" warning appears at more than 25 agents or more than 1.5M projected tokens.
- Fan-out agents with the same model, tools and system prompt share a prompt-cache prefix. The runtime staggers starts by up to 5 s so the siblings read the first agent's cache.
- [НП] A secondary report describes a sample run with 9 subagents in 4 phases, about 1M tokens and about 8 minutes.

Anthropic's own `deep-research` skill [L] (local plugin file) codifies a cheap version of the same idea:
- Ask a clarifying question only if it changes the research.
- Decompose into MECE subtopics. The researcher count table is 1 / 3 / 4 / 5 / 6+, with **"when in doubt, 3"**.
- Spawn all researchers in parallel.
- Allow **at most one** additional gap round.
- One report writer.
- Researcher rules:
  - Queries under 5 words.
  - Always fetch promising pages, because "snippets from search are easy to take out of context".
  - Never repeat a query.
  - About 10 tool calls is typical, with a hard stop near **15**.
  - Stop when there is no new relevant information.
  - Notes use a fixed schema per key question: Takeaway / Cited Findings (each with `[Source](URL)`, contradictions noted inline) / Inferences / Gaps.
- Report: a BLUF paragraph, 3–5 sections with signpost headers, an inline citation on every fact, and a conclusion with only new takeaways.

### 1.2 OpenAI deep research

- Launched 2025-02. It runs on a version of o3 optimized for browsing and data analysis, works for **5–30 min**, and scored HLE **26.6%** [V-sec InfoQ, https://www.infoq.com/news/2025/02/deep-research-openai]. That it was trained end-to-end with RL on browsing tasks is [НП] (snippets; openai.com returned 403).
- On BrowseComp, Deep Research scored **51.5%** with **91% calibration error**, versus GPT-4o with browsing at 1.9% and o1 at 9.9%. The model was trained on BrowseComp-style tasks [V], https://arxiv.org/html/2504.12516.
- API: https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api [V; page marked archived].
  - Models: `o3-deep-research-2025-06-26` and `o4-mini-deep-research-2025-06-26`.
  - `background=True`, because tasks take minutes.
  - Tools: `web_search_preview` (required), optional `code_interpreter` and `mcp`.
  - `reasoning.summary="auto"|"detailed"`.
  - Output items include `reasoning`, `web_search_call`, `code_interpreter_call` and `mcp_call`, so the process is auditable.
  - Annotations carry `start_index/end_index/url/title`.
  - **Recommended pattern**: the API does not ask clarifying questions, so use a **cheap model to clarify and rewrite** the prompt into detailed instructions first.
- ChatGPT UI, 2026 update [V-sec], https://wwwhatsnew.com/?p=487924 (2026-02-13):
  - An **editable research plan** before the start, and the run can be redirected mid-way.
  - **Source control**: restrict to specific sites, and use connected apps or MCP as trusted sources.
  - A **full-screen report viewer** with a table of contents on the left, a **sources/citations panel** on the right, and an **activity history** of how the research progressed.
  - Export to Markdown, Word or PDF.

### 1.3 Google Gemini Deep Research [V]

Consumer page: https://gemini.google/overview/deep-research/
- Pipeline: **plan → search → reason → report**.
- The prompt becomes a multi-point plan that **the user controls and can refine**.
- It browses "hundreds of websites" and optionally Gmail, Drive and Chat.
- It reasons iteratively and decides which subtasks run in **parallel vs. in sequence**.
- A **thinking panel** shows what it has learned and what it plans next.
- The report identifies themes and **contradictions** and runs a **self-critique** pass.
- It uses an **asynchronous task manager**: failures recover without a restart, and you can close the app and get a notification.
- 1M-token context plus RAG for follow-ups.
- Runs on Gemini 3.

API: https://ai.google.dev/gemini-api/docs/deep-research
- Agents: `deep-research-preview-04-2026` (speed, UI streaming) and `deep-research-max-preview-04-2026` (comprehensiveness).
- Available only through the Interactions API, and `background=true` is mandatory.
- Streaming needs `thinking_summaries:"auto"`. Events are `step.delta` (thought/text/image) plus `interaction.created/completed/error`, with resume via `last_event_id` (the example cites a 600 s timeout).
- **`collaborative_planning=true`** returns a plan instead of a report. Refine it with `previous_interaction_id`, then approve.
- Default tools: `google_search`, `url_context`, `code_execution`. Optional tools: `mcp_server` and `file_search`.
- The page gives no cost per task.

### 1.4 Perplexity Deep Research [V]

Source: https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research (2025-02-14).
- "Dozens of searches", "hundreds of sources".
- It iteratively refines the plan.
- **2–4 min**, most runs under 3 min.
- HLE 21.1%, SimpleQA 93.9%.
- Export to PDF or document, or to a Perplexity Page.
- Steps and Sources tabs in the UI are [НП] (only third-party tutorials found).

### 1.5 LangChain open_deep_research (ODR)

Sources: README [V] https://github.com/langchain-ai/open_deep_research; `configuration.py` [V] https://raw.githubusercontent.com/langchain-ai/open_deep_research/main/src/open_deep_research/configuration.py; blog [V] https://www.langchain.com/blog/open-deep-research (2025-07-16).

- **Status.** The repository is **archived and read-only**. A search snippet [НП] says it was archived 2026-08-21, and LangChain's focus moved to "deepagents" [НП].
- **Three phases:** scope → research → write.
  - **Scope**: clarify, then compress the chat into a **research brief**, which is the anchor for later phases.
  - **Research**: a supervisor delegates independent subtopics to sub-agents with **separate contexts**. Each sub-agent runs a tool loop, then writes a cited answer to its sub-question. The supervisor can launch follow-ups.
  - **Write**: **a single call** writes the report.
- **Lessons.**
  - Parallel section-writing produced disjointed reports, so multi-agent is used only for research.
  - A single agent covering several subtopics accumulates token-heavy tool output and researches each one less deeply.
  - Sub-agents **prune raw tool output** before returning.
  - Users don't want simple requests to take 10+ minutes.
- **Defaults.**
  - `max_concurrent_research_units=5` (range 1–20), `max_researcher_iterations=6` (supervisor reflect rounds), `max_react_tool_calls=10` (per researcher step, range 1–30).
  - `max_content_length=50000` chars before summarization. `allow_clarification=true`. `search_api=tavily` (alternatives: OpenAI or Anthropic native search, none). MCP via `mcp_config`.
  - Model roles: `summarization_model=gpt-4.1-mini` (8,192 out), `research_model=gpt-4.1` (10,000 out), `compression_model=gpt-4.1` (8,192), `final_report_model=gpt-4.1` (10,000).
- **Deep Research Bench (100 tasks):**

| Config (summarization / research / compression) | Total cost | Total tokens | RACE |
|---|---|---|---|
| gpt-4.1-mini / gpt-4.1 / gpt-4.1 (defaults) | $45.98 (≈$0.46/task) | 58.0M | 0.4309 |
| gpt-4.1-mini / claude-sonnet-4 / gpt-4.1 | $187.09 (≈$1.87/task) | 138.9M | 0.4401 |
| gpt-4.1-nano / gpt-4.1 / gpt-4.1 | $87.83 | 207.0M | 0.4344 |
| gpt-4.1-mini / gpt-5 / gpt-4.1 | n/a | 204.6M | 0.4943 |

  Reading [D]: a cheap summarizer is fine. The **research-loop model** is the lever that moved RACE most (GPT-5: +0.06). Swapping the summarizer to nano raised tokens 3.5× and cost without a quality gain, probably because summaries were worse and the loop compensated.

### 1.6 GPT-Researcher [V]

Sources: https://github.com/assafelovic/gpt-researcher ; https://docs.gptr.dev/docs/gpt-researcher/gptr/config ; https://docs.gptr.dev/docs/gpt-researcher/gptr/deep_research

- Structure: planner → execution (crawler) agents per question → publisher. It aggregates **20+ sources** and writes 2,000+ word reports.
- **Three model tiers:**
  - `FAST_LLM=openai:gpt-5.4-mini` for summaries, `FAST_TOKEN_LIMIT=3000`.
  - `SMART_LLM=openai:gpt-5.4` for report writing and reasoning, 6000.
  - `STRATEGIC_LLM=openai:gpt-5.4` for plans and strategy, 4000.
- Other settings:
  - `MAX_SEARCH_RESULTS_PER_QUERY=5`, `BROWSE_CHUNK_MAX_LENGTH=8192`, `SUMMARY_TOKEN_LIMIT=700`.
  - `SIMILARITY_THRESHOLD=0.42`, `EMBEDDING=text-embedding-3-small`.
  - `MAX_SCRAPER_WORKERS=15`, `SCRAPER=bs`, `CURATE_SOURCES=False` (an LLM curation step that "can raise cost and run time"), `MAX_ITERATIONS=3`, `MAX_SUBTOPICS=3`.
- **Deep mode**: tree exploration with breadth × depth (config page defaults: `DEEP_RESEARCH_BREADTH=3`, `DEPTH=2`, `CONCURRENCY=4`; the deep-research page says breadth 4). About **5 min and $0.40** per run with o3-mini (high).
- **Context-filter benchmark (28 tasks)**, filtering retrieved passages before writing:

| Filter | Relevant passages kept | Cost/report |
|---|---|---|
| vendor "Jev" | 73% | $0.115 |
| BM25 | 51% | $0.116 |
| Embeddings | 46% | $0.117 |
| None | – | $0.192 |

  **Skipping filtering costs about 65% more.** Report writing takes about 45 s regardless of the filter.

### 1.7 Stanford STORM / Co-STORM [V]

Source: https://github.com/stanford-oval/storm
- STORM: pre-writing (perspective-guided question asking + **simulated writer↔expert conversations** grounded in search) → outline → article → polish.
- **Model roles**: `conv_simulator_lm` and `question_asker_lm` → **cheap model** (example gpt-3.5-turbo); `outline_gen_lm`, `article_gen_lm`, `article_polish_lm` → **strong model** (gpt-4o).
- Co-STORM adds a moderator that asks about retrieved-but-unused information, a `DiscourseManager` turn policy, a dynamic **mind map** shared with the user, and lets the user inject turns.
- Authors' own caveat: output "cannot produce publication-ready articles", but it helps pre-writing.
- Useful ideas for Мандат: perspective discovery, the "unused retrieved info" moderator as a gap generator, and the mind map as a process view.

### 1.8 Jina node-DeepResearch / DeepSearch [V]

Sources: https://github.com/jina-ai/node-DeepResearch ; https://jina.ai/news/a-practical-guide-to-implementing-deepsearch-deepresearch/ (2025-02-25) ; https://jina.ai/news/snippet-selection-and-url-ranking-in-deepsearch-deepresearch/ (2025-03-12)

- **Loop**: `while (tokens < budget && failedAttempts < max)`. The model picks one of **search / visit / reflect / answer / coding**.
  - Actions are disabled dynamically: no `visit` without URLs, no `answer` right after a rejected answer, no `reflect` when there are no new gap questions.
  - A **gap queue** (FIFO) holds new gap questions at the front with the original question re-appended at the back. All questions share one context.
  - Recursion (DFS) was rejected because budgeting is hard and context isolation gains were marginal.
- **Answer evaluation is a separate prompt.** It first picks criteria for the question type, then checks each criterion with few-shot examples; all must pass. A rejected answer is stored as a failed attempt.
- **Beast mode**: when the budget or attempts are exhausted, the system forces an answer-only schema, so it always delivers something.
- **Query expansion is "surprisingly crucial"**: it rewrites across languages, tones and formats. The authors say small models are probably unsuitable for it.
- **Query dedup by embeddings** (`jina-embeddings-v3`, cosine, in memory; no threshold published), because LLM-based dedup was hard to tune.
- **URL ranking before crawling**:
  - Frequency across SERPs (URL and hostname).
  - Path-structure prior with decay for deeper paths.
  - Reranker score (`jina-reranker-v2-base-multilingual`) of question vs. title, snippet and anchor text.
  - **Freshness** from Last-Modified, ETag, schema.org, visible dates and SERP `tbs`.
  - **Gated or paywalled host list** with demotion.
  - **Domain diversity**: top-k per hostname.
  - The weights are put into the agent's context.
- **Snippet selection by late chunking**:
  - Embed page chunks with `late_chunking:true`.
  - Slide a window of ⌈snippet_len / chunk_len⌉ chunks over the query-cosine scores and pick the best-average window.
  - Mask chunks already used and repeat for N snippets.
  - Return the whole page if it is short.
- **Memory**: no vector DB; typed knowledge items (`qa`, `url`, `coding`, `side-info`) with references and timestamps, plus a diary and failed attempts, kept in XML-tagged prompt sections.
- **Structured output**: field constraints go in JSON-schema `description`s.
- No agent framework; it uses the Vercel AI SDK to switch providers.
- With long context, **one coherence pass** in DeepResearch suffices.

### 1.9 Trained research agents, 2025–2026 papers

These need RL training, which Мандат won't do. They give inference-time ideas.

- **Search-R1** (arXiv 2503.09516, v1 2025-03-12) [V]: RL teaches an LLM to issue search queries during reasoning, with **retrieved-token masking** and an outcome reward. It improves over RAG baselines by 41% (Qwen2.5-7B) and 20% (3B) on 7 QA sets.
- **WebThinker** (arXiv 2504.21776, NeurIPS 2025) [V]: a Deep Web Explorer plus a **Think-Search-and-Draft** strategy that interleaves reasoning, search and **drafting report sections as you go**. Iterative online DPO.
- **Tongyi DeepResearch** (arXiv 2510.24701, 2025-10) [V]: 30.5B total / 3.3B active parameters. Scores: BrowseComp 43.4, BrowseComp-ZH 46.7, HLE 32.9, GAIA 70.9, xbench-DeepSearch 75.0, WebWalkerQA 72.2, FRAMES 90.6.
  - **Heavy mode** runs parallel agents plus a synthesis model and lifts BrowseComp to **58.3**.
  - **Context management**: instead of the full history, the agent works from a **reconstructed workspace** (question + evolving compressed report + last action/observation). 128k context, **max 128 tool calls**.
  - **`visit` takes a goal**: Jina parses the page, then a summary model extracts **only the information relevant to that goal**.
- **Kimi-Researcher** [НП]: averages 23 reasoning steps, about 74 keywords and about 206 URLs per task (help page snippet). The context management that drops unneeded docs, allowing 50+ iterations, is from secondary summaries only.
- **Stopping** (2026):
  - "To Search or Not to Search" (arXiv 2602.03304) [V] shows **over-search** (redundant search despite enough knowledge) and **under-search** (premature stop) are pervasive. It blames outcome-only training.
  - "Don't Stop Early" (arXiv 2604.24978, ACL Industry 2026) [V] proposes coverage-driven planning (outline + reflection), dependency-guided execution with explicit information sharing, and **evidence-aware termination**: continue until per-objective sufficiency conditions are met. The abstract gives no numbers.
  - DeepSearchQA (arXiv 2601.20975) [V]: 900 prompts with exhaustive answer lists. Top systems "struggle to balance high recall with precision", with failure modes of premature stopping and hedging.
- **Test-time scaling**: in the BrowseComp paper [V], accuracy rises smoothly with browsing effort. **64 samples + aggregation adds about 15–25%**, best-of-N is best. Browsing models are badly calibrated (91% calibration error for Deep Research).

### 1.10 Synthesis: the loop and stopping criteria that work

All of these converge on the loop below [D, from §1.1–1.9]:

1. **Scope**: clarify only if the answer changes the research. Then write a **brief**: the question, the as-of date, constraints, the desired output, and **acceptance criteria per sub-question**.
2. **Plan**: split into MECE sub-questions (1 / 3 / 4–5 / 6+ by complexity). For each, give an objective, query hints, source-type hints and a "done when". **Show the plan to the user and let them edit it** (Gemini, ChatGPT).
3. **Search, wide then narrow**: 2–5 short queries per sub-question plus expansions (synonyms, other language, "site:" for primary sources). Run them in parallel across ≥ 2 providers. Dedup queries by embedding.
4. **Triage, no LLM first**: canonical-URL dedup, domain diversity cap, demote known content farms and paywalls, and rerank snippets against the sub-question. Only then use a cheap LLM to pick which pages to read.
5. **Read with a goal**: fetch the page, extract the main content, then **goal-directed extraction** of verbatim quotes and offsets for the sub-question (Tongyi `visit`, Tavily `query`+`chunks_per_source`, Jina late chunking).
6. **Reflect**: after each batch, the worker writes notes (findings + gaps). The lead checks the sufficiency criteria and generates **gap queries** only for unmet criteria. Use interleaved thinking after tool results.
7. **Stop** when any of these hold:
   - (a) All acceptance criteria are met, each with ≥ 1 quote (≥ 2 independent domains for "confirmed").
   - (b) **Novelty saturation**: the last k tool calls added no new claims or quotes. Claude Code's own pattern is "stop once two rounds in a row find nothing new".
   - (c) A per-worker tool-call cap (Anthropic skill: about 10, hard 15; ODR: 10 per step).
   - (d) A global token or $ budget, then a **"beast mode"** partial answer labelled as incomplete.
   - (e) Max gap rounds: 1 for standard (Anthropic skill), 2–3 for deep (ODR default is 6 supervisor iterations).
8. **Verify**: cross-check claims across workers and vote. Claims not checked because of errors are "unverified", not "refuted".
9. **Synthesize once** from the compressed notes (ODR, Jina). Then a separate citation and lint pass (Anthropic CitationAgent, Мандат's substring-quote linter).

---

## 2. Cost/quality tactics

### 2.1 Which roles need which model (evidence)

| Evidence | Implication |
|---|---|
| Anthropic: strong lead (Opus) + mid workers (Sonnet) beat single Opus by 90.2%. A model upgrade beats 2× tokens [V] | The planner/lead and the research-loop model deserve quality. Workers can be one tier down |
| ODR: summarizer `gpt-4.1-mini` is fine. Swapping the research model to GPT-5 gave the largest RACE gain. Nano summarizer increased total tokens 3.5× [V] | Page summarization can be cheap, but not the cheapest. The loop model matters most |
| STORM: question-asking and conversation simulation on a cheap LM; outline, article and polish on a strong LM [V] | Generating many queries/questions is a cheap role. Writing and structure are strong roles |
| GPT-Researcher: FAST (summaries) / SMART (report) / STRATEGIC (plan) [V] | The same three-tier split |
| Jina: "small language models are probably unsuitable" for query expansion; a reasoning model helps action selection [V] | Query expansion and planning should be at least mid tier |
| OpenAI cookbook: a cheap model clarifies and rewrites the prompt before deep research [V] | Clarification and brief-writing are cheap-tier |
| Tongyi: a separate summary model inside `visit` [V] | Goal-directed page extraction is its own role and can be cheap |
| GPT-Researcher filter benchmark: filtering passages before writing saves about 65% [V] | Rerank/filter with no LLM or a cheap one before any strong-model call |

### 2.2 Context compression of pages

- **Main-content extraction first** (see §4). It removes nav, footer and boilerplate at zero LLM cost.
- **Goal-directed extraction**:
  - A cheap model receives `{sub-question, page text ≤ N tokens}` and returns **verbatim quotes with char offsets** plus a 1–3 sentence relevance note.
  - The input cap is ODR's `max_content_length=50000` chars or GPT-Researcher's `BROWSE_CHUNK_MAX_LENGTH=8192`.
  - Quotes are checked mechanically as substrings (PRD 6.13 step 4). The model never paraphrases into evidence.
- **Query-focused chunking without an LLM**: score chunks (about 800 chars, like Tavily's chunks [V]) with BM25 + embeddings, or with late chunking (Jina [V]). Send only the top-k chunks to the extraction model. This is a 3–10× input reduction on long pages [D].
- **Subagent → lead handoff**: 1,000–2,000 tokens of condensed findings (Anthropic [V]). Raw pages stay in storage, referenced by `source_id` ("lightweight references" [V]).
- **Workspace reconstruction for long loops** (Tongyi [V]): each round the worker sees question + running report + last observation instead of the full transcript. Also clear tool results (Anthropic [V]).

### 2.3 Reranking

- **Order of cost**: BM25 (free) → bi-encoder embeddings (cheap, local) → cross-encoder (local CPU/GPU or about $2–2.5 / 1k searches) → LLM listwise rerank (expensive; only for the final top 20–50).
- **Local cross-encoders** [НП]:
  - `bge-reranker-v2-m3`: about 568M parameters, XLM-R, multilingual (so Bulgarian works). License reported Apache-2.0, conflicting reports exist. An ONNX export (`onnx-community/bge-reranker-v2-m3-ONNX`) runs in Transformers.js, i.e. inside Node.
  - `Qwen3-Reranker-0.6B`: 32k context; the license is reported inconsistently.
- **Hosted** [НП]: Cohere Rerank 4 Fast about $2.00 / 1k searches, Pro about $2.50 (1 search = 1 query + ≤ 100 docs, docs split at 500 tokens); Jina reranker v2 used by Jina DeepSearch [V].
- **Retriever quality reduces search calls** [V]: BrowseComp-Plus (arXiv 2508.06600) shows GPT-5 at 55.9% → **70.1%** when the retriever changes from BM25 to Qwen3-Embedding-8B, "with fewer search calls".

### 2.4 Dedup, canonical URL, domain diversity

- **Canonical URL** [D; Tavily docs say "dedupe results by canonical URL" [V]]:
  - Lowercase the host, drop the default port and fragment.
  - Strip tracking parameters (`utm_*`, `gclid`, `fbclid`, `ref`, `mc_*`) and sort the remaining query parameters.
  - Resolve redirects (store `final_url`) and prefer `<link rel=canonical>` when it is same-site.
  - Unwrap redirectors (Gemini grounding URLs, Google `/url?q=`).
  - Map `m.` / `amp` variants to the main URL.
  - Treat `arxiv.org/abs/X` ≡ `/pdf/X` ≡ `/html/X`.
- **Content dedup**: SHA-256 of the normalized extracted text (exact match) plus SimHash/MinHash for near-duplicates (syndicated news, mirrors). A syndicated copy **does not count as an independent domain** for "confirmed".
- **Domain diversity**: cap top-k per hostname (Jina [V]). Require ≥ 2 **registrable domains** (eTLD+1) for "confirmed". Keep a per-project demote list for content farms (Anthropic saw SEO-farm preference [V]).
- **Query dedup**: embedding cosine across all queries in the run (Jina [V]). "Never repeat the exact same query" (Anthropic skill [L]).

### 2.5 Prompt caching

- **Anthropic** [V] https://platform.claude.com/docs/en/build-with-claude/prompt-caching
  - Write costs 1.25× (5 min) or 2× (1 h). Read costs **0.1×** by default (**0.05×** on Opus 5.5 / Sonnet 5.5).
  - Minimum length is 512 tokens on 5.5-family models. Up to 4 breakpoints. Order is tools → system → messages; changing tools invalidates everything.
  - Agent-loop tips: keep tools, thinking and effort constant, and keep JSON key order stable.
  - 20-block lookback, so add a breakpoint near the end of long turns.
  - **A cache entry exists only after the first response starts, so wait for the first subagent to begin before fanning out siblings.** Claude Code automates this with a ≤ 5 s stagger [V].
  - Pre-warm with `max_tokens:0`. Cache hits don't count against rate limits.
- **OpenAI** [V] https://developers.openai.com/api/docs/guides/prompt-caching
  - Automatic at ≥ 1,024 tokens on GPT-5.6+. Cached reads cost 0.1× (0.05× on GPT-6.1 Sol). Writes on 5.6+ cost 1.25× (30 min) or 2.5× (12 h).
  - `prompt_cache_key` for routing on older models (aim for about 15 rpm per key). Keep the static prefix first.
- **For Мандат** [D]: a byte-identical worker system prompt + tool list per role and provider, with sub-question and brief **after** the cached prefix. The brief itself is a second cached block shared by all workers in a run.

### 2.6 Published budgets

Nobody publishes a full "quick / standard / deep" token table. The closest numbers:

- Anthropic: 1 agent and 3–10 calls (simple) / 2–4 agents and 10–15 calls each (compare) / 10+ agents (complex). Multi-agent ≈ 15× chat tokens [V].
- Anthropic skill: 3 researchers by default, about 10 (max 15) calls each, ≤ 1 extra round [L].
- ODR defaults: ≤ 5 concurrent units, ≤ 6 supervisor rounds, ≤ 10 tool calls per step. **About 0.58M tokens and about $0.46 per DRB task** (gpt-4.1); about 2M tokens per task with GPT-5 [V].
- GPT-Researcher deep: breadth 3–4 × depth 2, concurrency 4, **about $0.40 and about 5 min** [V].
- Tongyi: ≤ 128 tool calls, 128k context [V].
- Claude Code `/deep-research` sample: about 1M tokens, 9 agents, about 8 min [НП]. Large-workflow warning at > 25 agents or > 1.5M tokens [V].
- Product durations: Perplexity 2–4 min [V], OpenAI 5–30 min [V-sec], Claude Research up to about 45 min [НП].

### 2.7 Current model prices used for budgeting [V]

Anthropic, https://platform.claude.com/docs/en/about-claude/pricing:

| Model | Input $/MTok | Output $/MTok | Cache hit $/MTok |
|---|---|---|---|
| Opus 5.5 | 4 | 20 | 0.20 |
| Sonnet 5.5 | 2 | 10 | 0.10 |
| Haiku 5.5 (prompts ≤ 100k) | **0.10** | **0.50** | 0.01 |
| Haiku 5.5 (prompts > 100k) | 0.50 | 2.50 | – |

- Batch API is −50%.
- Web search costs $10 / 1k. Web fetch has no extra charge (tokens only).

OpenAI, https://developers.openai.com/api/docs/pricing:

| Model | Input $/MTok | Output $/MTok |
|---|---|---|
| gpt-6-sol | 2 | 10 |
| gpt-5.6-sol | 4 | 20 |
| gpt-6-luna | **0.10** | **0.50** |

- The web_search tool costs $10 / 1k calls.
- So the three tiers line up across vendors: about $0.1/$0.5 (cheap), about $2/$10 (mid), about $4/$20 (strong).

---

## 3. How Exa and Tavily get their quality, and what Мандат can replicate

### 3.1 Exa

Engineering post, https://exa.ai/blog/how-to-build-nextgen-search (2025-03-11) [V]:
- An **own crawler** and in-house HTML parser, with most effort spent on choosing which URLs make a high-quality index.
- **No keyword index**: transformer models turn each document into one or several embeddings, trained on web-mined data ("next-link prediction" heritage [НП via docs snippet]).
- An **own vector DB**, low-cost with variable compute per query. Simple queries take about 0.5 s; harder "Websets" queries take minutes.
- A 144×H200 training cluster.

API, https://exa.ai/docs/reference/search [V]:
- Search types: `type: auto | lite | deep-lite | deep` (legacy: `instant`, `fast`, `deep-reasoning`). `deep-lite` is about 4 s.
- `additionalQueries` (1–10 variations, deep only) and `objective` (≤ 4,096 chars of broader goal).
- **Query-focused `highlights`** with `{query, maxCharacters}`. Beta: `verbosity`, and a `dynamic` budget shared across results.
- `text` options: `maxCharacters`, `verbosity`, and `includeSections`/`excludeSections` (header / nav / sidebar / footer… removal).
- `summary {query, schema}`.
- Freshness: `maxAgeHours` (0 = always live crawl, −1 = cache only), `livecrawlTimeout` (default 10 s, max 90 s), and **`snapshotAsOf`** (time-travel to stored versions).
- `includeDomains`/`excludeDomains` (≤ 1,200, path prefixes and wildcards), `category`, published-date filters.
- `outputSchema` adds about 2 s.

**What is replicable locally** [D]:

| Exa mechanism | Local equivalent |
|---|---|
| Query-focused highlights | Chunk + embed (or late chunking) + cross-encoder over fetched pages |
| Section exclusion | Readability/Defuddle |
| `additionalQueries` | LLM query expansion |
| `snapshotAsOf` | Own content-hash store + Wayback |
| Domain filters | Allow/deny lists |

**Not replicable**: the web-scale neural index itself, which takes crawl + training + serving. **Buy it** as a provider, especially for "find pages like X", entity/company/people search, and fuzzy semantic queries where keyword engines fail.

### 3.2 Tavily

Docs [V]: https://docs.tavily.com/documentation/best-practices/best-practices-search , …/best-practices-extract
- `search_depth`:
  - `ultra-fast`: lowest latency, returns a content summary.
  - `fast`: low latency, chunks.
  - `basic`: medium latency, "high relevance", chunks; the recommended default.
  - `advanced`: highest relevance, searches more broadly, for niche, recent or multi-faceted queries.
- **Chunks are short snippets reranked by relevance to the query**; `content` is an NLP page summary. `auto_parameters` may silently pick `advanced` (2 credits).
- Query limit 1,500 chars, but keep queries concise and **split multi-topic questions into separate searches**. `max_results` defaults to 5 ("too high may lower quality").
- `include_domains_mode:"prefer"` (soft preference). `filter_by_published_date` drops undated results.
- Concurrency rule of thumb: **(RPM / 60) × avg latency** (100 rpm × 3 s ≈ 5 in flight). Exponential backoff, timeout about 10 s.
- **Dedupe by canonical URL. Post-filter by `score`** (example > 0.7; > 0.5 before extract).
- **Extract**:
  - `query` + `chunks_per_source` (1–5, chunks of about 800 chars) gives **query-reranked chunks**.
  - `extract_depth:"advanced"` handles JS-rendered pages, tables and embedded content at higher latency and cost.
  - ≤ 20 URLs per call. Per-URL `failed_results`.
- **Research endpoint**: iterative multi-search, dedup and structured output. The architecture is not published [НП], and the claim that it beats OpenAI and Perplexity on DRB is self-reported [НП].

**Replicable**: everything except Tavily's index/SERP sourcing and its trained relevance scorer. Its value-add is a **search + rerank + chunk** service. Locally that is SERP provider → fetch → extract → chunk → rerank, at the cost of latency and fetch failures. **Buy it** when latency matters or the fetch success rate is low. Use `advanced` only for niche or recent queries.

### 3.3 Build vs. buy summary [D]

- **Buy**: web-scale indexes (Exa, Brave, Tavily, Anthropic/OpenAI/Gemini search), neural "similar pages", fresh news, live crawl of blocked sites.
- **Build**: query expansion and dedup, canonicalization, page extraction, query-focused chunking, rerank, quote extraction, claim verification, caching, budget control, the evidence ledger. That is where Мандат's guarantees (substring quotes, verdicts, hashes) live, and providers don't give them.

---

## 4. Robust page fetching (legitimate methods only)

### 4.1 Main-content extraction

- **Mozilla Readability** [V] https://github.com/mozilla/readability (Apache-2.0):
  - `new Readability(doc, {charThreshold:500, nbTopCandidates:5, keepClasses, maxElemsToParse, serializer, disableJSONLD}).parse()` → `{title, content, textContent, length, excerpt, byline, siteName, lang, publishedTime}`.
  - `isProbablyReaderable(doc, {minContentLength:140, minScore:20})` is a fast pre-check.
  - Node needs jsdom, with **scripts and remote resources disabled** (the default). `parse()` mutates the DOM, so clone it.
  - **The output is not sanitized**: use DOMPurify or convert to markdown/text only.
- **Defuddle** [V] https://github.com/kepano/defuddle (MIT):
  - More forgiving than Readability. Uses mobile CSS to find clutter. Standardizes footnotes, math (→ MathML), code (keeps the language) and callouts.
  - Richer metadata: `author`, `published`, `schemaOrgData`, `metaTags`, `wordCount`.
  - Options `markdown`/`separateMarkdown`, `removeHiddenElements`, `removeLowScoring`, `contentSelector`. Node entry `defuddle/node` takes a linkedom, jsdom or happy-dom Document.
  - Caveats: "very much a work in progress". `parseAsync` may **call third-party APIs** (e.g. FxTwitter); keep it off inside the gate. On total failure it returns the whole body.
- **Trafilatura** [V] https://trafilatura.readthedocs.io/en/latest/evaluation.html (Python, Apache-2.0 [НП]). Benchmark of 2026-10-02 on 990 docs:

| Extractor | F1 |
|---|---|
| trafilatura 2.3.0 standard | **0.926** |
| magic-html | 0.889 |
| justext | 0.862 |
| readability-lxml 0.9 | 0.853 |
| news-please | 0.836 |
| goose3 | 0.810 |
| newspaper4k | 0.803 |
| raw HTML | 0.667 |

  Readability.js and Defuddle are not in the table. Trafilatura is Python, so in Мандат's Node stack it would be a sidecar. Recommendation [D]: **Defuddle (primary) → Readability (fallback) in Node**, with an optional Trafilatura sidecar measured on Мандат's own golden pages before adoption.
- **Quality gate after extraction** [D]: reject or escalate when:
  - Extracted text < 500 chars (Readability `charThreshold`).
  - Text/HTML ratio is very low.
  - SPA markers are present (`<div id="root"></div>`, `__NEXT_DATA__` with an empty body, `<noscript>` "enable JavaScript").
  - Cookie-wall or consent text dominates.
  - The language mismatches the search snippet.
  - The snippet's key phrases are not found in the extracted text, which is a strong signal of the wrong content.

### 4.2 Headless rendering with Playwright

- `page.goto` `waitUntil`: `load` (default), `domcontentloaded`, `commit`, and `networkidle`, which is **"DISCOURAGED"** (≥ 500 ms with no connections) [V] https://playwright.dev/docs/api/class-page#page-goto. The default `timeout` is 0 (none) unless configured, so **always set a navigation timeout** [V].
- Recipe [D]:
  1. `goto(url, {waitUntil:'domcontentloaded', timeout:20000})`.
  2. Then wait for **either** a main-content selector (`article, main, [role=main]`) **or** innerText length to stabilize (two samples about 500 ms apart differ by < 2%), capped at 5–8 s.
  3. Then `page.content()` → Defuddle/Readability.
  4. Block `image|font|media` via `page.route` to cut bandwidth [НП: standard Playwright API, not re-read today].
  5. One fresh context per job; no cookies or storage carried over; JS-exec tool off for the LLM. Sandbox and allowlist per research-tools §3.1.
- Use a renderer **only when tier-1 extraction fails the quality gate**. It is 10–50× slower and heavier [D].

### 4.3 PDF and documents

- **Node**: `unpdf` [V] https://github.com/unjs/unpdf (MIT). A serverless PDF.js build (v6.4.299). `extractText(pdf, {mergePages})`, `getMeta`, `extractImages`, `renderPageAsImage` (needs `@napi-rs/canvas`). Node 22+.
  - For quotes, keep **page numbers + per-page char offsets**, so a citation can say "p. 7".
- **Heavy layout** (tables, reading order, formulas, OCR): **Docling** [V] https://github.com/docling-project/docling. MIT code (models have their own licenses), Python ≥ 3.10, local/air-gapped, Markdown/JSON output, CLI and an MCP server. Use it as an optional sidecar for scanned or complex PDFs.
- **Providers**:
  - Jina Reader parses `.pdf` with PDF.js [V].
  - Firecrawl `parsers:[{type:'pdf', mode:'fast'|'auto'|'ocr'}]`, 1 credit per PDF page [V].
  - Anthropic web_fetch returns PDF base64 (about 125k tokens per 500 kB) [V in research-tools].

### 4.4 Archives and provider fallbacks

- **Wayback Availability API** [V] https://archive.org/help/wayback_api.php: `GET http://archive.org/wayback/available?url=…&timestamp=YYYYMMDDhhmmss` → `archived_snapshots.closest{available,url,timestamp,status}`. Also the CDX server and Memento. Use it for 404/410, dead links, **blocked or 403** pages and paywalled-now-open-then pages. Mark the source `via:archive` with the snapshot timestamp. Fetching the raw capture with the `id_` URL suffix is [НП].
- **Provider extract fallbacks** (prices in research-tools.md):
  - **Jina Reader** [V] https://github.com/jina-ai/reader: `x-engine: browser|curl|auto`, `x-wait-for-selector`, `x-target-selector`, `x-timeout` (≤ 180 s), `x-no-cache`, `x-respond-with: markdown|html|text|screenshot`, `x-retain-images: none`, `x-with-links-summary`. Apache-2.0, so it is self-hostable in principle [D].
  - **Firecrawl scrape** [V] https://docs.firecrawl.dev/api-reference/endpoint/scrape: `onlyMainContent:true` (HTML filter, no LLM), `waitFor` (≤ 60 s), `timeout` (60 s default), `maxAge` cache (2 days default), `actions`, `mobile`, `location`, `blockAds:true`, `storeInCache` (set false for data protection), `proxy: basic|enhanced|auto`.
  - **Tavily extract advanced** (JS, tables); **Exa contents** with `maxAgeHours:0` for a live crawl; **Anthropic web_fetch** (no JS, respects robots.txt, URL must be in prior context [V in research-tools]).
- **Commercial "unlocker" / anti-bot proxy services exist**: Firecrawl `enhanced` proxy, Browser Use cloud, Browserbase, and Bright Data Web Unlocker (a plugin for it is installed in this environment). Мандат should model them only as a **configurable provider, off by default, owner opt-in, ToS responsibility on the owner**. Мандат itself implements no CAPTCHA solving, fingerprint spoofing or evasion.

### 4.5 Etiquette

- **robots.txt (RFC 9309)** [V] https://www.rfc-editor.org/rfc/rfc9309.html:
  - Match the user-agent product token case-insensitively, otherwise use the `*` group. The **longest matching path wins**, and allow wins ties.
  - Cache ≤ 24 h. **4xx → may crawl; 5xx/unreachable → assume full disallow.**
  - Follow ≥ 5 redirects. Parse ≥ 500 KiB.
  - **Crawl-delay is not part of the standard**, but honor it anyway as courtesy [D].
  - Policy [D]: a user-initiated single-page read may follow the user's agent rules, but a **crawl or multi-page fetch must obey robots.txt**. Record the robots decision in the source record.
- **Identification**: send a truthful `User-Agent: MandatResearch/<ver> (+contact URL)`.
  - The IETF **Web Bot Auth** drafts (HTTP Message Signatures for bots, `Signature-Agent` header, JWKS key directory) are the emerging legitimate way to be a verifiable bot [НП]. Sources: https://datatracker.ietf.org/doc/html/draft-ietf-webbotauth-httpsig-protocol (Sept 2026), https://www.ietf.org/archive/id/draft-meunier-web-bot-auth-architecture-00.html.
  - Track it; implement later if sites start requiring it.
- **Rate limits** [D]:
  - Per-host concurrency 1–2, ≥ 1 s between requests to the same host, exponential backoff with jitter on 429/503, honor `Retry-After`.
  - Conditional GET (`If-None-Match` / `If-Modified-Since`) for re-checks.
  - API-specific politeness: arXiv about 1 req / 3 s, Crossref polite pool, S2 1 rps (research-tools.md).

---

## 5. Showing the process, and what the report contains

### 5.1 Live process UI in leading products

| Product | Before the run | During the run | After the run |
|---|---|---|---|
| ChatGPT deep research | Clarifying questions; **editable plan**; **restrict to specific sites / connectors** [V-sec] | Progress view; **interrupt and redirect** mid-run [V-sec] | **Full-screen report** with ToC (left), **sources panel** (right), **activity history**; export MD/Word/PDF [V-sec] |
| Gemini | **Plan shown, user refines and approves** (`collaborative_planning`) [V] | **Thinking panel**: what it learned, what's next; streaming thought summaries [V] | Multi-page report; audio overview; Canvas; notification when async run completes [V] |
| Claude Code `/deep-research` | **Approval card with phase list + token caution** [V] | `/workflows`: **phases × agent counts**, drill-down to agent prompt, **recent tool calls**, result, **per-agent tokens**; pause/stop/restart; one-line progress in task panel [V] | Cited report; **claims failing cross-check removed**; **unverified claims listed separately** [V] |
| Claude.ai Research | Toggle; connectors | Live display not documented in help center [V: help page silent]; up to about 45 min, hundreds of sources [НП] | Report with citations linking to sources [НП] |
| Perplexity | – | "Steps" / "Tasks" view showing sub-queries [НП] | Sources tab; export PDF/doc/Page [V] |
| Co-STORM | – | **Mind map** of concepts; user can inject turns [V] | Article with citations |

### 5.2 What the final report contains (common denominator plus best-in-class)

- Clickable inline citations. OpenAI policy requires them to be visible and clickable (research-tools.md).
- A source list with title, domain and date.
- The best products add: a ToC, a separate sources panel, an activity log, contradiction handling (Gemini "themes and contradictions" [V]), unverified-claims handling (Claude Code [V]), and export formats.
- **Mandat-specific (PRD 6.13)**: per-claim verdict, quote as exact substring, hash, archive link, as-of date. No surveyed product shows quote-level evidence per claim. This is the differentiator.

---

## 6. Evaluation

### 6.1 Public benchmarks

| Benchmark | What | Size | Notes |
|---|---|---|---|
| **BrowseComp** [V] arXiv 2504.12516 (2025-04) | Hard-to-find, easy-to-verify short answers ("inverted" questions); humans solved 29.2% within 2 h | 1,266 | Launch: Deep Research 51.5%. **Aggregators report frontier systems at about 88–92% by Aug–Sep 2026, near saturation** [НП: benchlm/llm-stats, mostly self-reported] |
| **BrowseComp-Plus** [V] arXiv 2508.06600 | BrowseComp over a **fixed curated corpus** (about 100k docs [НП]) with labelled supporting and hard-negative docs | – | **Reproducible and cheap: no live web.** Isolates retriever vs. agent. GPT-5: 55.9% (BM25) → 70.1% (Qwen3-Embedding-8B) |
| **FRAMES** [V] arXiv 2409.12941 (NAACL 2025) | Multi-hop factuality + retrieval + reasoning; 0.40 accuracy without retrieval → 0.66 with a multi-step pipeline | 824 [НП] | Tongyi 90.6 [V] |
| **SimpleQA** | Short fact-seeking questions with a single indisputable answer; grades correct / incorrect / not attempted | 4,326 [НП; openai.com 403] | Perplexity DR 93.9% [V]. Good for the "quick" depth and abstention calibration |
| **DeepResearch Bench** [V] github.com/Ayanami0730/deep_research_bench | 100 PhD-level report tasks, 22 domains, 50 EN / 50 ZH. **RACE** (report quality vs. reference, adaptive criteria) + **FACT** (statement–URL pairs → citation accuracy, effective citations) | 100 | Judges updated: RACE GPT-5.5 (2026-05-11), FACT GPT-5.4-mini; last update 2026-09-22. ODR runs cost $46–187 per full run [V] |
| **ResearchRubrics** (Scale AI, ICLR 2026) [НП] arXiv 2511.07685 | Expert rubrics; leading DR agents meet **< 68%** of criteria, mostly missing implicit context | 101 prompts, 2,500+ criteria [НП] | Partial-credit rubric grading is a good template for in-house evals |
| **DeepSearchQA** [V] arXiv 2601.20975 | Exhaustive-list answers; tests **when to stop** | 900 | Measures recall/precision and premature stopping |
| HLE, GAIA, xbench-DeepSearch, WebWalkerQA | Reasoning + browsing | – | Used by Tongyi/OpenAI/Perplexity; less relevant to Мандат's source-verification goal |

### 6.2 Cheap in-house evaluation (what to actually run)

1. **Deterministic metrics on every run**, at zero LLM cost [D]:
   - Quote-substring pass rate.
   - Fraction of factual sentences with ≥ 1 citation (the linter).
   - Fraction of URLs that came from tool results (AC-13.3).
   - Distinct registrable domains per claim.
   - Fetch success rate by tier.
   - Duplicate-source rate.
   - Cost, tokens, tool calls and wall time per depth.
2. **Golden set** (AC-13.8):
   - **20 real questions** (Anthropic started with about 20 [V]): project facts, library version facts, a few market/news questions. Each has a reference answer, required facts and acceptable sources.
   - Run the set for each depth × provider mix × model-role mix.
   - Record provider responses as **cassettes** so CI re-runs cost only LLM tokens. A fully offline mode uses fake LLMs.
3. **LLM-judge, single call** with 0.0–1.0 per criterion + pass/fail (Anthropic [V]). Criteria: factual accuracy, citation accuracy, completeness, source quality, tool efficiency. Calibrate the judge against owner labels on 20–30 items.
   - Use a judge from a **different vendor** than the synthesizer [D].
4. **FACT-style citation precision** (DRB [V]): sample statement–URL pairs and check support with a cheap NLI/LLM. Compare with the substring verdicts.
5. **Small slices of public sets**:
   - 50 FRAMES and 50 SimpleQA items for quick and standard depth.
   - 30–50 **BrowseComp-Plus** items with a local BM25/embedding index over its fixed corpus. This tests the loop and stopping logic with no web cost and reproducibly.
   - 5–10 DRB tasks occasionally for report quality (RACE needs a strong judge; budget about $1–2 per task).
6. **Regression gates** [D]:
   - Block a release if the golden-set confirmed-wrong count > 0 (AC-13.8).
   - Block if the quote-substring pass rate drops > 5 points.
   - Block if cost per depth rises > 25% at equal quality.

---

## 7. Recommendations for Мандат

All items here are [D] and derive from the sources above. Fit with Мандат's rules:
- The pipeline is a deterministic skeleton with LLMs only in bounded roles, matching PRD 6.13.
- Keys stay in llm-proxy (AGENTS.md rule 2).
- Fetching happens only through the egress gate with SSRF rules.
- All read content is framed as untrusted.

### 7.1 Pipeline loop (orchestrated in code, not by a free-running agent)

```
research_ask(question, depth, budget, repo)
 0. RECALL     kb lookup (research_recall); fresh → return with "as of" + source states
 1. SCOPE      [T1] clarify? (only if it changes research; agent callers get no question → assumptions listed)
               [T1/T2] write BRIEF {question, as_of, constraints, output_shape, sub-questions[], done_when[] per sub-q}
               UI: show plan; human may edit/approve (auto-approve for agent callers / quick)
 2. FAN-OUT    for each sub-question → worker (parallel ≤ W)  ── shared cached prefix: role prompt + tools + brief
 3. WORKER LOOP (per sub-question, bounded by C tool calls)
     a. queries   [T2] 2–5 short queries + expansions (lang/synonyms/site: primary); embed-dedup vs all run queries
     b. search    ≥2 providers by scope (web/docs/code/papers); collect {url,title,snippet,date,provider}
     c. triage    [T0] canonicalize, dedup (URL + later content hash), domain cap k=2/host, demote list,
                  rerank snippets vs sub-q (BM25+embed → cross-encoder); [T1] pick top-N to read
     d. read      fetch ladder (7.4) → extract → quality gate → SHA-256, final_url, fetched_at, tier
     e. extract   [T0] chunk ~800 chars, rerank vs sub-q → top-k chunks
                  [T1] goal-directed: verbatim quotes + offsets + relevance; [T0] substring check, drop failures
     f. notes     append findings {claim_draft, quote_ids, source_ids} + gaps to worker notes (external store)
     g. reflect   [T2, interleaved] done_when met? novelty in last 2 calls? → stop | new gap queries
    return ≤1.5k-token summary + references (source_ids, quote_ids), never raw pages
 4. LEAD REVIEW [T2 standard / T3 deep] merge notes; unmet done_when → ≤R gap rounds (new workers only for gaps)
 5. CLAIMS     [T1] normalize atomic claims ← quotes; [T0] independence (eTLD+1, not syndicated copy, not same hash)
               [T1→T2 on disagreement] support check: supports | contradicts | irrelevant (NLI second opinion, labelled)
               verdict: confirmed (≥2 independent domains) | single_source | contradicted | unverified
               (errors/rate limits → unverified, never "refuted")
 6. SYNTHESIZE [T2 standard / T3 deep] one pass from claims table (not raw pages); every factual sentence → [n]
 7. LINT       [T0] sentence without citation → rewrite or move to "unverified"; URL not from tool result → reject
 8. DELIVER    report + JSON evidence → agent frame / UI / knowledge_entries; async archive (SPN2) if configured
 STOP/BUDGET   any of: all done_when met · novelty=0 for 2 consecutive rounds · per-worker C calls · gap rounds R
               · $/token/time cap → "beast mode": synthesize partial, label "непълно: бюджет" (AC-13.7)
```

Key choices:
- Single-pass synthesis (ODR, Jina).
- Workers return references, not pages (Anthropic).
- Goal-directed reading (Tongyi).
- Explicit sufficiency criteria (Don't Stop Early).
- Novelty-based stop (Claude Code workflow pattern).
- At most one gap round in standard (Anthropic skill).

### 7.2 Role → model tier

Tier definitions:
- **T0**: code, no LLM.
- **T1**: cheap. Haiku 5.5 or gpt-6-luna (about $0.10 / $0.50 per MTok), or a local 7–32B model.
- **T2**: mid. Sonnet 5.5 or gpt-6-sol (about $2 / $10).
- **T3**: strong. Opus 5.5 or gpt-5.6-sol (about $4 / $20).

Roles map to channels via `routing_rules += role` (spec 5.3). Any mix of vendors and local models is allowed per role.

| Role | Tier (quick / standard / deep) | Why |
|---|---|---|
| Clarify + brief writer | T1 / T1 / T2 | OpenAI's cookbook uses a light model for clarification and rewriting. Deep briefs set the whole run's structure, so go up a tier |
| Planner / decomposer (sub-questions, done_when) | – (skip) / T2 / T3 | Anthropic: the lead's quality drives the 90% gain, and a model upgrade beats 2× tokens. Jina: weak models plan badly |
| Query generation + expansion | T2 / T2 / T2 | Jina: expansion is "surprisingly crucial" and small models are unsuitable. Few output tokens, so a mid tier is cheap here |
| Query/URL dedup, canonicalization, domain diversity | T0 | Jina: LLM dedup was hard to tune; embeddings work. Canonicalization is rules |
| Snippet / page triage (rerank) | T0 (BM25 + embeddings + cross-encoder), optional T1 pick | GPT-Researcher: filtering saves about 65% at better relevance. BrowseComp-Plus: a better retriever means fewer calls |
| Goal-directed page extraction (quotes + offsets) | T1 | Tongyi uses a separate summary model in `visit`. ODR's summarizer is mini. The substring check catches errors deterministically. Highest token volume, so cheapest tier. Don't use the very cheapest if it inflates loops (ODR nano lesson) |
| Worker reflect / gap decision (research loop) | T1 / T2 / T2 | ODR: the research-loop model moved RACE most. Anthropic used Sonnet-class workers. Quick depth has 1 worker and few calls, so T1 is acceptable |
| Compression of worker notes → lead | T1 / T1 / T2 | Mostly restructuring of quotes already extracted. Deep summaries feed a strong lead, so better fidelity is worth it |
| Claim normalization (atomic claims ← quotes) | T1 | Mechanical, schema-constrained, checked against quote IDs |
| Support / contradiction check (NLI) | T1 first pass → T2 on disagreement or "contradicted" | Cheap filter plus escalation. Verdicts that change the outcome (contradicted / confirmed) get the stronger model. Use a different vendor than the synthesizer to avoid self-agreement |
| Lead review / gap rounds | – / T2 / T3 | The sufficiency judgment is where over- and under-search errors come from (2602.03304). Use a strong model when it matters |
| Final synthesis | T2 / T2 / T3 | STORM, GPT-Researcher and ODR all put the writing on the strong model. One pass, so the cost is bounded |
| Citation lint + rewrite of uncited sentences | T0 lint; T1 rewrite | Deterministic rule plus a cheap fix. Anthropic separates citation into its own agent |
| Eval judge | T2–T3, other vendor | Anthropic: a single-call rubric judge. DRB uses a GPT-5.5-class judge for RACE and a mini model for FACT |

Local models:
- Allowed for T1 roles when they pass the golden-set extraction check: ≥ 95% of returned quotes are exact substrings, and ≥ 90% recall vs. the T1 cloud baseline.
- Not for T3 by default.
- A local embedding model and cross-encoder (e.g. bge-reranker-v2-m3 ONNX in Transformers.js; check the license under rule 8) cover T0 rerank.

### 7.3 Per-depth budgets (defaults; owner-configurable; enforced in proxy + pipeline)

| | quick | standard | deep |
|---|---|---|---|
| Planner | none (1 implicit sub-question) | T2, 2–4 sub-questions | T3, 4–8 sub-questions (≤ 12) |
| Workers (parallel) | 1 | 3 (≤ 4) | 5–8 (≤ 10), ≤ 4 concurrent |
| Tool calls per worker (C) | ≤ 6 | ≤ 10 (hard 15) | ≤ 15 (hard 25) |
| Gap rounds (R) | 0 | ≤ 1 | ≤ 3 |
| Search queries total | 3–6 | 12–25 | 40–80 |
| Results considered | ≤ 30 | ≤ 150 | ≤ 600 |
| Pages read (full fetch + extract) | 4–8 | 15–30 | 50–120 |
| Max page text into T1 extractor | 12k tokens/page (top-k chunks) | 12k | 16k |
| Min independent domains for "confirmed" | 2 (else single_source) | 2 | 2; ≥ 3 sources preferred for key claims |
| Total token cap (all roles) | 150k | 1.0M | 4.0M |
| Max output tokens: worker summary / report | 1k / 1.5k | 1.5k / 4k | 2k / 10k |
| Wall-clock target | ≤ 60 s | 2–5 min | 8–20 min (async, notify) |
| **Target $ (typical)** | **≈ $0.05–0.25** | **≈ $0.50–1.50** (default cap $1.00) | **≈ $2–6** (default cap $8.00) |

How the $ figures were derived (Anthropic prices; OpenAI is equivalent):
- **Quick**: T1 extraction ≈ 8 pages × 10k in at $0.10/M ≈ $0.01; T2 loop + synthesis ≈ 40k in / 4k out ≈ $0.12; search 6 × $0.005–0.01 ≈ $0.05.
- **Standard**: 3 workers × about 150k in (half cached) + 8k out on T2 ≈ $0.9; T1 extraction ≈ $0.05; T2 synthesis ≈ $0.15; about 20 searches ≈ $0.15.
- **Deep**: 8 workers × about 200k in / 15k out on T2 ≈ $2–4 with caching; T3 lead + synthesis ≈ $1–2; about 80 searches ≈ $0.6; verification ≈ $0.3.
- References: ODR at about $0.46 per DRB task (gpt-4.1) and $1.87 (Sonnet 4 research model); GPT-Researcher deep at about $0.40; Claude Code deep-research at about 1M tokens per run [НП].
- AC-13.7's $0.50 test cap should sit **inside** standard's range. With the cap it returns a labelled partial.

### 7.4 Fetch-tier ladder (each step only if the previous one fails the quality gate in §4.1)

| Tier | Method | Notes |
|---|---|---|
| 0 | **Cache / KB**: canonical URL + content hash, TTL by source type (news 1 d, docs 7 d, papers 90 d, API/library docs keyed by version) | Conditional GET on re-check |
| 1 | **Structured first-party APIs** instead of scraping: Context7/DeepWiki (docs), GitHub API (code), arXiv/S2/Crossref (papers; arXiv `/abs`+`/html` before PDF), Wikipedia REST | Stable URLs, no HTML noise |
| 2 | **Plain HTTP GET through the egress gate**: robots.txt check (RFC 9309, cache ≤ 24 h), truthful UA, per-host 1–2 concurrency, 20 s timeout, 5 MB cap, SSRF rules, redirects re-checked. Route by content type: HTML → Defuddle (→ Readability fallback) → markdown; PDF → unpdf (page offsets); plain/JSON → as is | Covers most of the web [D] |
| 3 | **Headless Chromium (Playwright) in the sandbox**: fresh context, `domcontentloaded` + main-selector or text-stability wait (≤ 8 s), block image/font/media, nav timeout 20 s, no cookies, no LLM-driven JS. Then the same extraction | Only for JS-thin pages (SPA markers, < 500 chars) |
| 4 | **Provider extract (paid, configurable)**: Jina Reader (`x-engine:browser`, `x-wait-for-selector`), Tavily extract (`advanced`, `query`+`chunks_per_source`), Exa contents (`maxAgeHours:0`), Firecrawl scrape (`onlyMainContent`, `storeInCache:false`), Anthropic web_fetch (no JS; citations) | Per-call budget; provider recorded in source |
| 5 | **Archive**: Wayback availability API → closest snapshot (for 404/410/403/blocked/dead) | Source marked `via:archive@timestamp`; dates shown |
| 6 | **Heavy document sidecar** (optional): Docling for scanned or complex PDFs (OCR, tables) | Python sidecar, off by default |
| 7 | **Commercial unlocker provider** (optional, **off by default**, owner opt-in, owner's ToS responsibility) | Мандат implements no CAPTCHA solving or evasion |
| 8 | **Give up**: source `unreadable(reason)`; the search snippet is kept as `snippet_only` evidence, which **cannot alone make a claim "confirmed"** | Shown in the report's source list |

### 7.5 What the live panel shows (/research and the desktop Research view)

1. **Plan card before the run**: brief, sub-questions with "done when", depth, budget estimate ($, tokens, time) and providers. Buttons: Edit / Approve / Run without approval (for agent callers). This combines Gemini collaborative planning, ChatGPT's editable plan and Claude Code's approval card.
2. **Phase bar**: Scope → Search → Read → Verify → Write, with counts per phase (Claude Code `/workflows`).
3. **Worker cards**, one per sub-question: status, tool calls used out of C, queries issued (text + provider), results count, pages read (favicon, domain, title, tier used, ok/failed reason), quotes extracted, tokens and $. Drill-down shows the full event list.
4. **Live source list**: sortable by domain and date. State per source: queued / fetched / extracted / unreadable / archived / duplicate-of. Plus hash and robots decision.
5. **Claim board**: counters confirmed / single-source / contradicted / unverified, updating live. Clicking a claim shows its quotes highlighted in source context.
6. **Budget meter**: $, tokens and wall time vs. cap. A warning at 80%. The "beast mode" switch is visible when it triggers.
7. **Controls**: pause / stop / "redirect" (add an instruction or exclude a domain, applied at the next worker step) / restrict sources (allow/deny list). This matches ChatGPT's interrupt-and-redirect and source control.
8. A **thinking/notes stream**: short per-step summaries (Gemini thinking panel), never raw page text.

### 7.6 What the final report contains

1. A header with question, **as-of date**, depth, duration, cost and models per role.
2. **BLUF** answer (Anthropic skill pattern).
3. Sections with an inline **[n]** on every factual sentence. Hovering [n] shows the **exact quote**, domain and date.
4. **Claims table**: claim → verdict → quotes → sources (≥ 2 independent domains for "confirmed").
5. **Contradictions section**, showing both quotes side by side (Gemini "contradictions"; AC-13.4).
6. **Unverified / gaps section**, including "not checked due to error" (Claude Code pattern).
7. **Source list**: title, domain, published date, retrieved_at, final URL, SHA-256, archive link, fetch tier, robots status. Rejected sources with the reason (duplicate, content farm, unreadable, URL not from a tool).
8. **Process map**: phases, sub-questions, queries per provider, pages read vs. considered, gap rounds, stop reason (criteria met / novelty / budget). This is a compact version of ChatGPT's activity history and the STORM mind map.
9. **Exports**: Markdown, PDF, and JSON evidence (the machine format for agents and `knowledge_entries`).

### 7.7 Spike RS checklist derived from this report

- [ ] Measure Defuddle vs. Readability (vs. Trafilatura sidecar) F1 on 30 pages from the golden set's sources.
- [ ] Measure quote-substring pass rate for T1 candidates (Haiku 5.5, gpt-6-luna, one local model) on 50 pages.
- [ ] Measure the fetch-ladder success rate by tier on 100 URLs from real research questions.
- [ ] Calibrate the depth budgets with 10 golden questions × 3 depths. Record tokens, $ and time; adjust the caps in 7.3.
- [ ] Build a 30-item BrowseComp-Plus slice with a local BM25 + embedding index to test the stop logic offline.
- [ ] Re-verify every [НП] item used in decisions: OpenAI DR RL training, SimpleQA size, Cohere prices, reranker licenses, Wayback `id_`, Web Bot Auth status.
