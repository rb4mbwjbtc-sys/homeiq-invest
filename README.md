# HomeIQ Invest V5.6

## V5.6 – Calculation & Score Audit

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
