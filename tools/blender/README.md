# Engine asset pipeline (Track A)

Source model: "Disassembled V8 Engine Block" by Tomaso, Sketchfab uid
`3026bd87ca3945d6829d24c86ce695f0`, CC BY 4.0. Credit is in `web/src/content/site.ts` (footer).
Part separation is UNVERIFIED until `inspect_engine.py` has run on the import.

Sources live in `assets-src/` (git-ignored). Record a sha256 of every downloaded archive in
`assets-src/README.md`.

## Steps

1. Enable Sketchfab in the BlenderMCP panel (N sidebar): tick "Use assets from Sketchfab", paste
   the API key, restart the Claude connection. Then download the model through the MCP
   `download_sketchfab_model` tool, or manually from the Sketchfab page into `assets-src/`.
2. `inspect_engine.py` in Blender. Read `engine-inspect.json` and the `a1_gate.verdict`. Time-box 2h.
   The model is "disassembled", so budget time to move parts back into assembled positions:
   crank on the Y axis at the origin, pistons in their bores, banks 90° apart.
3. `decimate.py` (set `LC_TARGET_TRIS`, default 150000). Then `bake_maps()` for normal + AO.
4. `rig_bake.py`. Fill `MAPPING` with the source names from the inspect report. Exports
   `engine-raw.glb` next to the .blend.
5. `tools/blender/export.sh assets-src/engine-raw.glb 1`. Produces versioned desktop and mobile
   glbs in `web/public/models/`.
6. In the site, `?engine=glb` switches from the procedural placeholder to the asset.

## Fallback ladder (decide at step 2)

1. Single mesh with many loose parts: Edit Mode > Separate > By Loose Parts, re-run inspect.
2. Separable by material: Separate > By Material.
3. Fused: keep the Tomaso shell as the static exterior, model the internals (crank, pistons, rods
   are cylinders and boxes) in Blender, use a cutaway for the dive.
4. Model C (`6e920e47959d4da797eff437beeaa3f3`, Free Standard licence, static shell) for the
   exterior only, or a paid rigged model from CGTrader / RenderHub.
5. Ship the procedural placeholder. It already honours the node contract.
