# HomeIQ Independent v2

Unabhängige HomeIQ-Version mit beibehaltenem Design.

## Neu in V2

- Transparente Lageanalyse mit acht Faktoren
- Marktwertschätzung mit regionalem CHF/m²-Benchmark
- Marktmietschätzung
- Beim Mehrfamilienhaus: Marktmiete für jede Wohnung separat
- Marktwert- und Mietpreisbandbreiten
- PDF-/Druckbericht im HomeIQ-App-Design
- Datenradius bis maximal 10 km

## Wichtiger Hinweis

V2 verwendet vom Benutzer eingegebene regionale Benchmarks und ein transparentes Rechenmodell. Es werden noch keine Live-Daten eines externen Immobilien-Datenanbieters abgerufen.

## Start

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## V2.4 – angeforderte Anpassungen

- Standort- und Marktdaten bleiben leer, bis «Laden» angeklickt wird.
- Marktwert-Aktion direkt im Bereich Finanzierung unter dem Kaufpreis.
- Marktmiet-Aktion direkt unter der Nettomiete; beim MFH aggregiert aus den einzelnen Wohnungen.
- Score-Ring und Bewertungsbalken mit kontinuierlicher Farblogik von Rot bis Grün.
- Separates, kompaktes A4-Einseitenlayout für den PDF-/Druckexport im HomeIQ-Design.


## V2.4 Änderungen
- Standortdaten-Lader auf Seite Lage & Markt verschoben
- Marktwert- und Marktmietresultate im erweiterten HomeIQ-Layout
- Marktmiete automatisch berechnen
- Dynamische Eigenkapitalquote / Finanzierungsbeurteilung


## V2.4
- Neues HomeIQ-Logo in Navigation und PDF
- Dynamisches Score-Design im HomeIQ-Look
- Score-Faktoren: Nettorendite 35 %, Eigenkapitalrendite 20 %, Lage 25 %, Objektqualität 12 %, Marktfähigkeit 8 %
- Objektqualität berücksichtigt Zustand, Baujahr, Renovation und Ausbaustandard
- Marktfähigkeit berücksichtigt Vermietbarkeit, Nachfrage, Leerstand und relevante Ausstattungsmerkmale
