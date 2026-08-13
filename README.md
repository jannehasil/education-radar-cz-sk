# Education Radar CZ/SK

Denní český monitoring online vzdělávání, AI learning a corporate L&D.

Veřejná stránka: https://jannehasil.github.io/education-radar-cz-sk/

Design je inspirovaný vizuálním jazykem Seduo.cz, ale používá vlastní značku Education Radar.

## Automatická aktualizace

GitHub Actions aktualizují report každý den v 7:07 a 12:07 podle `Europe/Prague`. Běh načte aktuální zprávy, vybere relevantní kandidáty, provede testy, uloží výsledek do `main` a přímo nasadí GitHub Pages.

Stav posledního běhu je v `data/automation-status.json`. Automatizace nepotřebuje zapnutý osobní počítač ani spuštěný Codex.
