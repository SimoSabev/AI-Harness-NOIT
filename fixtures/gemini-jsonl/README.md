# gemini-jsonl

Handwritten `gemini -p … --output-format stream-json` lines (D-423). The shape follows the CLI's own types
(`packages/core/src/output/types.ts` of google-gemini/gemini-cli, main b8fa817, 28.10.2026) and the test snapshot
`packages/cli/src/__snapshots__/nonInteractiveCli.test.ts.snap`; tool names (`run_shell_command`, `replace`,
`mcp_<server>_<tool>`) follow the docs. Synthetic until a live run records a real stream (live part waits for Simo).
