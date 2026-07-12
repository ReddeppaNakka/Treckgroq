@echo off
REM Daily staged enrichment for Atlas. Regenerates only destinations whose rich
REM content is missing the current deep-schema fields, newest gaps first. Safe to
REM run every day: once every destination is deep it finds nothing and exits.
REM Stops making the free Groq 100k-tokens/day cap a blocker by spreading the work.
cd /d "c:\Users\yacha\OneDrive\Desktop\TreckGroq\backend"
echo ==== %DATE% %TIME% ==== >> "enrich_stale.log"
".\venv\Scripts\python.exe" enrich.py --stale >> "enrich_stale.log" 2>&1
