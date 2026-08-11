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
