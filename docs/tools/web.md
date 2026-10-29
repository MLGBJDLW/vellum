# Search and page extraction

Vellum 0.5.1 provides `search_tool` for web search and `fetch_tool` for readable page content. Both are available to the main agent and the researcher worker. Existing `web_search` calls share the search implementation; `web_fetch` remains available for explicit HTTP methods, headers and request bodies.

## Start with an existing DeepSeek key

If DeepSeek is already configured in Vellum's credential manager, or `DEEPSEEK_API_KEY` is set, both new tools can use that key automatically. A DeepSeek model selected through another gateway does not make that gateway's key a DeepSeek credential.

```text
/websearch engine auto
/websearch fetch auto
/websearch show
```

No second key is needed. This uses DeepSeek's standalone [Search](https://api-docs.deepseek.com/api/search/) and [Fetch](https://api-docs.deepseek.com/api/fetch/) APIs. Account access and billing remain subject to those services. Nexa's existing integrations informed the adapters; Vellum does not read or migrate Nexa's private credential store.

## Configure providers

Run `/websearch` or `/webtools` to open the configuration menu. Settings take effect on the next invocation, including after restarting Vellum.

```text
/websearch engine brave
/websearch fetch deepseek
/websearch key brave
/websearch endpoint searxng https://search.example.com
/websearch results 8
/websearch depth advanced
/websearch timeout 45000
/websearch fallback off
/websearch disable deepseek
/websearch enable deepseek
```

The `key` command without a key argument opens a masked prompt. New dedicated web keys use the existing encrypted/keychain credential store under `web:<provider>`, leaving model keys intact. Dedicated keys override shared model/environment keys. Earlier `search.tavilyApiKey` and `search.serpApiKey` settings remain readable; saving a replacement through the command removes the old plaintext override. `show` and `test` report configuration status without exposing secrets or issuing paid requests.

Use `/websearch endpoint <provider> default` to remove an endpoint override. DeepSeek accepts its root URL, `/v1`, or a complete `/v1/tools/search` or `/v1/tools/fetch` URL. Other services accept their full API endpoint; SearXNG accepts an instance root. Endpoints must be HTTP(S) URLs without embedded credentials, query strings or fragments.

| Service | Search | Fetch | Environment key |
| --- | --- | --- | --- |
| DeepSeek | Yes | Yes | `DEEPSEEK_API_KEY` |
| Brave | Yes | — | `BRAVE_SEARCH_API_KEY` or `BRAVE_API_KEY` |
| Tavily | Yes | — | `TAVILY_API_KEY` |
| Exa | Yes | — | `EXA_API_KEY` |
| Serper | Yes | — | `SERPER_API_KEY` |
| SerpAPI | Google/Bing | — | `SERPAPI_API_KEY` or `SERPAPI_KEY` |
| AnySearch | Yes | — | `ANYSEARCH_API_KEY` when required by the deployment |
| SearXNG | Yes | — | Instance URL required; optional `SEARXNG_API_KEY` for authenticated deployments |
| DuckDuckGo | Yes | — | None |
| Jina Reader | — | Yes | `JINA_API_KEY`; explicit anonymous use is supported |
| Firecrawl | — | Yes | `FIRECRAWL_API_KEY` |
| direct | — | Yes | None |

Provider endpoint environment overrides use `<PROVIDER>_BASE_URL`, for example `DEEPSEEK_BASE_URL` or `SEARXNG_BASE_URL`. Non-secret preferences live in the existing `~/.vellum/settings.json` `search` section.

## Selection and limits

When no per-call provider is supplied, the configured default applies. Auto search prefers an enabled DeepSeek credential, then Brave, Tavily, Exa, Serper, SerpAPI, configured AnySearch/SearXNG and finally DuckDuckGo. Auto fetch prefers DeepSeek, then configured Firecrawl/Jina, then direct reading.

Explicitly selected providers never silently switch. Auto fallback is limited to transient network, rate-limit and server failures, within one overall timeout. Invalid requests, authentication failures, permission denials and cancellation do not trigger a different service. Disabled providers stay disabled.

Search filters constrain provider selection: domain filters require Tavily or Exa; `searchDepth` requires Tavily; `needContent` requires DeepSeek, Tavily or Exa. Unsupported filters produce an explicit error rather than being dropped. DeepSeek search permits 1–128 Unicode characters and up to 50 results; other services have their own result caps.

`fetch_tool` returns the provider used, title, content, final URL and truncation status. `maxChars` defaults to 12000. Cloud services return Markdown; direct reading extracts static readable text and does not run page JavaScript. Permissions, DNS/URL checks, response-size bounds and a shared deadline apply to requests and redirects. Retrieved content is untrusted source material.

## Verification

The regression suite exercises the real CLI settings/credential callbacks, tool execution and serialized HTTP requests with local or intercepted fixtures. It covers key reuse, dedicated-key precedence, changes without restart, disabled services, cancellation, timeouts, bounded retries, redirects and filter-preserving fallback. These tests do not establish paid-account access or successful live inference/search for every vendor.
