# Education Radar CZ/SK

Pravidelný český monitoring online vzdělávání, AI learning a corporate L&D.

Veřejná stránka: https://jannehasil.github.io/education-radar-cz-sk/

Design je inspirovaný vizuálním jazykem Seduo.cz, ale používá vlastní značku Education Radar.

## Automatická aktualizace

GitHub Actions aktualizují report pouze třikrát týdně: v pondělí, středu a pátek v 10:00 podle `Europe/Prague`. Automatické spuštění při každém pushi je vypnuté; mimo plán lze běh spustit jen ručně. Běh prochází 25 přímých RSS/Atom zdrojů v češtině, slovenštině, angličtině, němčině, francouzštině a španělštině. Významné cizojazyčné zprávy přeloží do češtiny, ale na kartě vždy ponechá přímý odkaz na původní zdroj.

Monitoring pracuje s oknem posledních 72 hodin, aby mezi pátečním a pondělním během nevznikla mezera. Filtr vyřazuje návody, žebříčky, slevy, webináře a další běžný marketingový obsah. Po sběru provede testy, uloží výsledek do `main` a přímo nasadí GitHub Pages.

Stav posledního běhu je v `data/automation-status.json`. Automatizace nepotřebuje zapnutý osobní počítač ani spuštěný Codex.
