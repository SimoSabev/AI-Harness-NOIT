-- D-480…D-485: MCP servers and skills imported from outside (pasted JSON, a client's config on this machine, GitHub, npm,
-- a catalog, a URL). They enter the same catalog with the same vetting; `origin` says where they came from (a pinned
-- commit for GitHub). An imported skill keeps its text (it is materialized only with the approved hash).
alter table public.mcp_servers drop constraint if exists mcp_servers_source_check;
alter table public.mcp_servers add constraint mcp_servers_source_check
  check (source in ('registry', 'manual', 'json', 'github', 'npm', 'catalog', 'url', 'local'));
alter table public.mcp_servers add column if not exists origin text check (length(origin) <= 300);

alter table public.skills
  add column if not exists content text check (length(content) <= 65536),
  add column if not exists origin text check (length(origin) <= 300);
