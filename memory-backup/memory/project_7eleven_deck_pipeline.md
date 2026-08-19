---
name: 7eleven-deck-pipeline
description: "Re-runnable PPTX brand-fix pipeline for Scott's customer decks at C:\\Claude\\projects\\7eleven-deck"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6e28f82e-15f7-4ebf-8a24-16727d0bae5a
---

Built 2026-06-12: brand/font/divider overhaul of the 7-Eleven executive review deck. The pipeline is reusable for any customer deck Scott exports from Google Slides.

**Workflow (all in `C:\Claude\projects\7eleven-deck`):** unpack PPTX with the pptx skill's `unpack.py` → run `build.py` (idempotent — always re-unpack fresh before re-running, it asserts on missing shapes) → `pack.py` → render via PowerPoint COM (`$pres.Export(dir,"PNG",1280,720)`; LibreOffice/poppler NOT installed, thumbnail.py fails on Windows with AF_UNIX error).

**Brand assets generated once and reusable:** `assets/wordmark-white.png` (transparent, official /\ letterform, 5.76:1 ratio) and `assets/aimark-green.png`, rendered from the brand skill's SVGs via headless Edge (`msedge --headless=new --screenshot --default-background-color=00000000`), wordmark alpha derived from luminance with PIL.

**Deck conventions learned (Scott's exec-review template):** footer text/page numbers are sz 650 Roboto Mono #595959 at y=4745736; eyebrows are `[` sz1400 mono #737373 + label sz 900 bold Inter #C7E913 + `]`; left margin 411480 EMU; slide size 9144000×5143500; Google Slides text boxes often carry 91425 EMU insets (compensate x when aligning); fonts must stay Inter + Roboto Mono (both native in Google Slides for round-trip).

**Flagged to Scott, unresolved:** "Abnormal Behavior Platform" (corporate slide 15) vs "Abnormal Behavioral Platform" (agenda/dividers) naming inconsistency — corporate slide 15 is itself inconsistent internally; left as agenda had it.
