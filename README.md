# Education Radar CZ/SK

Denní český monitoring online vzdělávání, AI learning a corporate L&D.

Veřejná stránka: https://jannehasil.github.io/education-radar-cz-sk/

Design je inspirovaný vizuálním jazykem Seduo.cz, ale používá vlastní značku Education Radar.

## Automatická aktualizace

GitHub Actions aktualizují report každý den v 7:07 a 12:07 podle `Europe/Prague`. Běh prochází 25 přímých RSS/Atom zdrojů v češtině, slovenštině, angličtině, němčině, francouzštině a španělštině. Významné cizojazyčné zprávy přeloží do češtiny, ale na kartě vždy ponechá přímý odkaz na původní zdroj.

Monitoring pracuje s oknem posledních 24 hodin a filtrem, který vyřazuje návody, žebříčky, slevy, webináře a další běžný marketingový obsah. Po sběru provede testy, uloží výsledek do `main` a přímo nasadí GitHub Pages.

Stav posledního běhu je v `data/automation-status.json`. Automatizace nepotřebuje zapnutý osobní počítač ani spuštěný Codex.
