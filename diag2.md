# Diagnostic Continuation: Neverhood Worker Port

## Current Confirmed State

- [`diag.md`](diag.md) was reviewed and its prior conclusions are still broadly correct.
- [`src/index.ts`](src/index.ts) is serving a synthetic [`/data/index.json`](src/index.ts) manifest and proxies R2-backed game data from the [`ASSETS`](src/index.ts:2) bucket.
- [`public/worker.v1.js`](public/worker.v1.js) now has materially stronger worker-side browser shims than before:
  - global [`window`](public/worker.v1.js:3) aliasing
  - broader element method stubs
  - better event forwarding compatibility
  - canvas rect propagation from [`public/index.html`](public/index.html)
- [`public/index.html`](public/index.html) forwards richer pointer event data to the worker.
- [`public/neverhood.dat`](public/neverhood.dat) was added locally and uploaded to R2.
- R2 contents were verified through Cloudflare MCP and exact object sizes match the hardcoded values used in [`src/index.ts`](src/index.ts).

## What Was Learned In This Pass

### 1. Boot stability is better than detection stability

The system now consistently reaches the ScummVM launcher instead of failing immediately on worker startup.

That means the dominant blocker has shifted:

- less about raw worker bootstrap failure
- more about ScummVM web discovery / manifest semantics

### 2. [`neverhood.dat`](public/neverhood.dat) was necessary but not sufficient

Adding [`neverhood.dat`](public/neverhood.dat) removed one likely cause of failure, but it did **not** cause direct game boot.

ScummVM still does not proceed to request any `.BLB` payloads after reading [`/data/index.json`](src/index.ts).

### 3. The current manifest format is still probably wrong for this web backend

Playwright traces repeatedly show this pattern:

- GET `/`
- GET `/worker.v1.js`
- GET `/engine_v2.js`
- GET `/scummvm.wasm`
- GET [`/data/index.json`](src/index.ts)
- **no subsequent GETs for `/data/a.blb`, `/data/c.blb`, etc.**

That strongly suggests the web backend is rejecting the directory listing before `AdvancedDetector` performs actual file reads.

### 4. Brave search surfaced a likely missing implementation detail

Search results for the unofficial ScummVM web demo strongly suggest the web `index.json` can be **structured**, not just a flat filename-to-size map.

Observed example shape from that deployment:

```json
{
  "gui-icons": {},
  "shaders": {},
  "games": {
    "baseUrl": "https://scummvm-data.kuendig.io"
  }
}
```

That implies our current manifest in [`src/index.ts`](src/index.ts) may be too naive. It may need:

- nested directory objects
- a `baseUrl`
- or a split between engine-data assets and game-data assets

### 5. Dual-case aliases reduce one issue and create another

Providing both uppercase and lowercase names in [`/data/index.json`](src/index.ts) matches prior theory about case sensitivity, but it also triggers repeated ScummVM cache `name clash` warnings.

Those warnings may be benign, but at minimum they make the detection path noisier and may interact badly with this specific web filesystem implementation.

## Files Modified During This Pass

- [`src/index.ts`](src/index.ts)
- [`public/index.html`](public/index.html)
- [`public/worker.v1.js`](public/worker.v1.js)
- [`public/neverhood.dat`](public/neverhood.dat)

## Important Operational Notes

- Static changes to [`public/worker.v1.js`](public/worker.v1.js) and [`public/index.html`](public/index.html) were uploaded to R2 manually, per project rules.
- Local [`wrangler dev`](wrangler.toml) works for iteration against remote bindings, but direct deployment via local Wrangler auth currently fails due invalid token state in the shell environment.
- Cloudflare MCP was still able to inspect the remote R2 bucket successfully, so Cloudflare-side verification remained possible.

## Highest-Value Next Experiments

### A. Change [`/data/index.json`](src/index.ts) to a structured manifest

Most likely next fix:

- stop using only a flat filename-size object
- test a structure closer to the ScummVM demo’s directory-style manifest
- potentially expose:
  - engine data entries
  - a `games` object with `baseUrl`
  - a subdirectory representing Neverhood assets

### B. Separate game files from engine-data semantics

Potential target structure to test in [`src/index.ts`](src/index.ts):

- root [`/data/index.json`](src/index.ts) describes directories
- game files live under something like `/data/games/neverhood/`
- manifest points ScummVM there through `baseUrl` or a directory object

### C. Reduce mock-related nonfatal errors in [`public/worker.v1.js`](public/worker.v1.js)

Even though direct boot is the primary blocker, the worker shim still needs refinement for eventual playability:

- cursor/style handling
- audio auto-resume hooks
- more browser-like `document` / `Element` behavior
- ensure event targets always provide expected methods

### D. Only validate cursor once direct file reads happen

Input testing is currently premature because the app is still landing in launcher state instead of entering the game.

## Suggested Immediate Direction

If continuing from here, the most efficient next step is:

1. rewrite [`/data/index.json`](src/index.ts) into a structured manifest format modeled on the ScummVM web demo
2. point it at a dedicated Neverhood asset subtree
3. watch with Playwright for the first successful `.BLB` fetch
4. then tune boot arguments in [`public/worker.v1.js`](public/worker.v1.js)

## Bottom Line

This is no longer mainly a worker-crash problem.

It is now primarily a **ScummVM web filesystem manifest compatibility** problem, with worker DOM/input shims as the secondary issue.
