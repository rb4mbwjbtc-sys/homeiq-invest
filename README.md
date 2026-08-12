# HomeIQ Invest V5.7.1

## V5.7.1 – Calculation & Score Audit

Basis: stabile V5.5 ohne Bevölkerungsabfrage. Die funktionierende Standortdaten-Pipeline bleibt unverändert.

### Korrigierte Berechnungen
- Bruttorendite = Jahresmiete / Kaufpreis.
- Nettorendite = Nettoertrag vor Finanzierung / Gesamtinvestition.
- Eigenkapitalrendite = Nettoertrag nach Hypothekarzins / Eigenkapital; Amortisation wird nicht als Aufwand behandelt.
- Cash-on-Cash-Rendite = Cashflow nach Zins und Amortisation / Eigenkapital.
- Belehnung (LTV) = Hypothek / Kaufpreis.

### Score-Audit
- HomeIQ-Gewichtung bleibt 35/20/25/12/8.
- Nachfrage bleibt sichtbar, wird aber nicht zusätzlich in den Lage-Score gewichtet.
- Mikrolage bleibt sichtbar, wird aber nicht zusätzlich gewichtet.
- Mikrolage wird direkt aus den bereits berechneten Scores für ÖV, Einkauf, Schule und Verkehr abgeleitet.
- Marktfähigkeit verwendet keine Nachfrage- oder Leerstandswerte mehr, sondern nur objektbezogene Vermietbarkeitsmerkmale.

### Stabilität
- Keine neue externe Datenquelle.
- Keine Änderung an der funktionierenden Lage-/Lärm-/OSM-Pipeline.
- Ergebniswerte werden bei jedem Öffnen aus den gespeicherten Eingaben neu berechnet.

## V5.7.5
- Flächenpassung der Marktfähigkeit symmetrisch verschärft.
- Extreme Unter- und Überdimensionierung werden bei gleicher relativer Abweichung gleich behandelt.
- Ab mehr als 40 % Abweichung wird die Marktfähigkeit als Plausibilitätsregel auf maximal 60/100 begrenzt.
- Gewichtung bleibt unverändert: Zimmersegment 35 %, Flächenpassung 30 %, Objekttyp 20 %, Stockwerk/Zugänglichkeit 15 %.

## V5.7.6
- Nettorendite-Score neu kalibriert: 1.0%=10, 1.5%=20, 2.0%=35, 2.5%=50, 3.0%=65, 3.5%=80, 4.0%=90, 4.5%=97, ab 5.0%=100.
- Eigenkapitalrendite-Score neu kalibriert: 0%=0, 2%=20, 4%=40, 5%=50, 6%=60, 7%=70, 8%=80, 9%=90, ab 10%=100.
- Zwischenwerte werden linear interpoliert.
- Lagequalität, Objektqualität, Marktfähigkeit sowie die Hauptgewichtungen 35/20/25/12/8 bleiben unverändert.

## V5.7.7
- ÖV-Abfrage stabilisiert: echte Stationskoordinaten, eigene Haversine-Distanz und Schutz vor falschen 0-m-Werten.
- transport.opendata.ch wird zuerst kurz abgefragt; danach direkter OSM/Overpass-Fallback mit 2/5/10 km.
- Overpass verwendet den ersten gültigen Endpoint statt auf alle Server zu warten.
- OSM-Fallbacks haben ein gemeinsames Zeitbudget und keine mehrfachen langen Retry-Kaskaden mehr.
- Jede Standortquelle hat ein eigenes maximales Zeitbudget; Teilresultate bleiben verfügbar, wenn eine Quelle langsam ist.
- Bestehende Score-, Rendite-, Lärm-, Leerstands-, Einkaufs-, Schul- und Autobahnlogik wurde inhaltlich nicht verändert.
