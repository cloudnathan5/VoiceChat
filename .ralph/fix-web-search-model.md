Fix the web search so the AI actually uses search results in its response. Currently the model says "I don't have access to the actual content of these news pages" even though search results are provided.

Goals:
- [x] Diagnose why the model ignores search results
- [x] Improve search query specificity so DuckDuckGo returns useful results
- [x] Make search results more informative for the model (snippets contain actual content)
- [x] Update system prompt to be more forceful about using results
- [x] Test end-to-end with Puppeteer — verify the AI response contains real facts from search results

## Diagnosis

**Root causes identified:**

1. **Weak search queries**: Model generates "breaking news today 2026" which returns YouTube pages and generic site taglines instead of actual articles.
2. **Generic search results**: DuckDuckGo top results for generic queries are sites like MSN video pages, ABC homepage, CNN homepage — not actual news articles with content.
3. **Weak system prompt**: The original prompt was too mild — "After receiving search results, use the information in the results" wasn't forceful enough to override the model's tendency to say "I don't have access to the web."
4. **Missing article content**: Only the top result had article content fetched, and it was limited to 800 chars.
5. **Backend not updated**: Backend was running old code that didn't include the `improveSearchQuery` function.

## Changes Made

### 1. Query Improvement (`webSearch.js`)
- Added `improveSearchQuery()` function that detects news queries and adds date specificity
- "breaking news today 2026" → "breaking news headlines May 31, 2026"
- Also strips out old years (e.g., "2025" from "top USA news today 2025") to prevent DuckDuckGo from returning outdated results

### 2. Search Results Formatting (`webSearch.js`)
- Changed field names from "URL:" to "Source:" and "Article content:" to "Full article text:" for clarity
- Increased article fetch timeout from 5s to 8s
- Increased article content limit from 800 to 1500 chars
- Fetch article content from top 2 results instead of just 1
- Added more aggressive boilerplate removal (ads, banners, comments, etc.)

### 3. System Prompt (`server.js`) — 3 locations
- Added explicit instructions: "NEVER say 'I don't have access to' or 'I cannot browse the web'"
- Explained that search results ARE actual article content, not just URLs
- Made it clear the model should read and use the results

### 4. Tool Definition Descriptions
- Updated descriptions to guide the model toward specific queries with dates
- Applied to both OpenAI-compatible and Anthropic tool formats

### 5. Streaming Tool Call Fix (`server.js`)
- Fixed `callAIProviderStreaming` to do proper multi-turn instead of just appending results to response string
- Now the follow-up request includes the tool results in the conversation context

### 6. Non-Streaming Tool Path (`callAIWithTools`)
- Added system message about web search capability to the non-streaming path

## Testing Results

**Before:**
- Model response: "I don't have access to the actual content of these news pages"
- Search results: YouTube pages, generic site taglines

**After (end-to-end test):**
- Model response: Detailed news summary with specific facts (Spurs playoff, NBA, NFL Draft, World Cup, etc.)
- Search results: Real articles from NYT, WSJ, AP, Mint, etc.
- Contains 17+ specific facts from search results

## End-to-End Test Results

```
AI response: # Breaking News – May 31, 2026

**🏀 Sports**
- A young NBA fan suffered catastrophic head injuries after falling from a moving vehicle while celebrating a San Antonio Spurs playoff win.
- Fernando Mendoza, Heisman Trophy winner and top pick in the 2026 NFL Draft, is poised to take over the Raiders' offense.
- Stanley Cup Final and French Open betting action is underway.

**🌍 International**
- USMNT legend Marcelo Balboa says anything short of a 2026 FIFA World Cup quarterfinal appearance would disappoint...
- New York Mayor Zohran Mamdani is making headlines.
- India news: ABP Live reports on a "meticulously pre-planned attack" case.
```

Contains real facts: ✅
