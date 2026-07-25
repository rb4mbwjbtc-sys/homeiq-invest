# HomeIQ Independent V3.1

V3.1 verbessert die automatische Schweizer Open-Data-Lageanalyse aus V3.0.

## Änderungen gegenüber V3.0

- Adaptive Umkreissuche für OpenStreetMap-Daten: 1 km, 2.5 km, 5 km und maximal 10 km.
- Mehrere Overpass-Endpunkte als technische Ausweichmöglichkeit.
- Erweiterte Suche nach ÖV-Haltestellen, Einkauf, Schulen/Betreuung und Autobahnanschlüssen.
- Gemeinde- und GWR-Zuordnung direkt über GeoAdmin-Layer.
- Fehlende Distanzen werden nicht mehr durch scheinbar konkrete Standardwerte dargestellt.
- Nicht verfügbare Felder bleiben sichtbar leer und werden als „nicht verfügbar“ bezeichnet.
- Der verwendete Suchradius wird je Kategorie transparent angezeigt.
- Im Score werden fehlende Teilwerte weiterhin neutral gewichtet.
- Die Datenqualität richtet sich nach der Zahl tatsächlich gefundener Teilwerte.

## Datenquellen

- swisstopo / GeoAdmin
- Bundesamt für Raumentwicklung ARE
- Bundesamt für Umwelt BAFU
- Bundesamt für Statistik BFS
- OpenStreetMap / Overpass

## Wichtige Abgrenzung

Die Lageanalyse verwendet echte offene Daten. Marktmiete und Marktwert bleiben in V3.1 noch modellbasierte Module und werden in einem separaten Entwicklungsschritt durch belastbare Marktdaten ersetzt.

## Lokal starten

```bash
npm install
npm run dev
```

## Produktions-Build

```bash
npm run build
```
