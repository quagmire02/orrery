# Orrery

Map the papers around your research question as a 3D solar system in deep space. Drag to orbit, scroll to zoom, click the sun, any planet or gap to fly to it. Your question is the sun. Papers orbit it in five rings, **Core → Close → Adjacent → Outer → Fringe**, based on how closely they bear on your study. Lines show which papers cite, extend, reuse or challenge each other. Dashed **?** rings are research gaps the AI found between them.

**Try it: https://quagmire02.github.io/orrery/**

No accounts and no server. Everything runs and saves in the browser.

*Privacy: the hosted site counts anonymous visits and feature use with [GoatCounter](https://www.goatcounter.com/) (no cookies, no personal data). Your papers, notes and API keys are never sent anywhere except the AI provider you choose.*

## Use it

- **Add papers:** paste arXiv links, DOIs, Semantic Scholar URLs or plain titles (one per line), or drop in as many PDFs as you like.
- **The sun:** click it to set your research question and paste your own workings (hypotheses, methods, drafts). Orrery uses these to judge closeness.
- **Relevance / Fields:** orbit papers by closeness to your question, or group them into field planets with the papers as moons.
- **Summaries:** click any paper for its key sentences, picked from the abstract (and the conclusion, for uploaded PDFs) with no AI, plus Semantic Scholar's one-line TL;DR when available.
- **Analyze:** a model of your choice reads everything and returns relevance scores, typed connections and gaps.
- Drag to orbit, right-drag to pan, scroll or pinch to zoom. Click anything to fly to it; click empty space or double-click to fly home. Space pauses the orbits.

### Without an AI key
Orrery still works. It fetches metadata and reference lists from Semantic Scholar and OpenAlex (both free), links papers that cite each other, scores relevance by word overlap with your question and workings, and clusters papers into fields. Only **gap-finding** needs a model.

### With your own key (BYOK)
Open Settings and pick a provider:

| Provider | Notes |
|---|---|
| Anthropic (Claude) | Called straight from the browser. |
| OpenAI | Any chat model. |
| OpenRouter | One key for Kimi, Gemini, Llama, DeepSeek and more. |
| Local / custom | Any OpenAI-compatible endpoint. For Ollama, start it with `OLLAMA_ORIGINS=*` so the browser may call it. |

The key stays in the browser's localStorage and is sent only to the provider you choose. Exports never include it.

## Run locally

```bash
node serve.mjs
```

Then open http://localhost:5173. There's no build step and nothing to install. (The server is only needed because ES modules don't load over `file://`.)

## Deploy
It's a static folder. Push it to GitHub and turn on **Pages**, or drop it on Netlify, Vercel or Cloudflare Pages.

## Files
- `js/sky.js`: three.js renderer (toon-shaded planets, nebulae, orbits, fly-to camera)
- `js/papers.js`: link/DOI/title/PDF → paper record (Semantic Scholar, OpenAlex, pdf.js)
- `js/analyze.js`: local TF-IDF relevance, k-means fields, citation links, and the AI prompt and providers
- `js/main.js`: state, panels, wiring
- `js/demo.js`: the sample system shown on first visit
- `js/tour.js`: the first-run tutorial (replay it from Settings)
