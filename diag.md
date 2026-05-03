# Diagnostic Status: The Neverhood Web Worker Port

## Synthesis of Learnings

### What is Happening?
The goal is to direct-boot "The Neverhood" within a Cloudflare Worker-backed instance of ScummVM running entirely inside a Web Worker.

1. **WASM Initialization Failures:** We resolved initial startup crashes within Emscripten. The worker environment required robust stubbing. Mocks for `window`, `document`, `screen`, and crucially, event listener registrations (`addEventListener` / `removeEventListener`) are now present. `emscripten_set_window_title` was also necessary to satisfy WASM imports.
2. **Virtual Filesystem Crashing:** ScummVM uses an internal HTTP-backed virtual file system (`HTTPFilesystemNode`). We found that returning raw `[]` or text fallbacks for `/data/index.json` queries caused `RuntimeError: memory access out of bounds`. We fixed this by serving a valid JSON mapping.
3. **ScummVM Detection and Auto-boot:** The engine currently drops to the ScummVM UI Launcher rather than booting the game. ScummVM uses `AdvancedDetector` to verify game files. To auto-boot The Neverhood:
   - ScummVM needs the exact byte sizes of the `.blb` files exposed in `/data/index.json`.
   - We configured `worker.v1.js` to write a `scummvm.ini` specifying the `[neverhood]` engine profile with `path=/data/`.
   - We passed arguments `['--path=/data/', 'neverhood']` to force auto-boot.
4. **Input & Cursor Issues:** The user reported no working cursor. This happens because while `index.html` forwards DOM events to the worker, `worker.v1.js` lacked the actual implementation to dispatch those synthetic events onto the mocked canvas.

### Current State
- The WASM module successfully instantiates.
- ScummVM starts but drops into the GUI Launcher.
- The browser fetches `/data/index.json` but doesn't subsequently try to download `A.BLB` or `a.blb`. This indicates `AdvancedDetector` rejects the files based on the `index.json` listing, or the INI config fails to route the game engine properly.
- The worker event listeners are properly mocked, but full event synthesis for mouse tracking isn't completely functional yet.

## Current Todos
1. **Force Game Detection:** Figure out why ScummVM ignores the file sizes provided in `/data/index.json` and drops to the launcher. This likely involves tweaking `scummvm.ini` or verifying the exact byte sizes/casing expected by the `neverhood.dat` detector.
2. **Fix Cursor/Input Proxying:** Ensure `index.html` event forwarding correctly translates to Emscripten canvas events in `worker.v1.js` so the hardware cursor renders.
3. **Trace HTTP Loading:** Ascertain if `createLazyFile` is interfering with `HTTPFilesystemNode`, or if bypassing `HTTPFilesystemNode` using Emscripten's pre-run data packager would be more reliable.

## Theories & Directions for Continuing

1. **Bypassing the HTTPFilesystemNode Completely:**
   ScummVM's `HTTPFilesystemNode` might just be incredibly fragile. Instead of coercing it to read our custom `index.json`, we could pre-package the initial detection chunks of the files using Emscripten's `file_packager`, or rely on `FS.createLazyFile` combined with explicit byte overrides if the engine supports it.
2. **Missing Meta-files:**
   The logs indicate missing `translations.dat` and `shaders.dat`. While usually non-fatal, the absence of specific engine data (like `neverhood.dat` if it was split off) might be preventing the auto-detector from functioning.
3. **Event Emulation:**
   To fix the cursor, we need to ensure the synthetic `Event` object constructed in `worker.v1.js` from `e.data.event` matches the browser standards exactly. Emscripten inspects properties like `e.clientX`, `e.clientY`, and `e.button`. We should pass those explicitly and call the registered `eventListeners`.