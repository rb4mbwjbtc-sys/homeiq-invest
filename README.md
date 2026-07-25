# HomeIQ Independent V3.0

Automatische Lageanalyse mit echten offenen Schweizer Daten.

## Datenquellen

- swisstopo / GeoAdmin: amtliche Adresssuche und Koordinaten
- BFS: Gebäude- und Wohnungsregister sowie Leerwohnungszählung
- ARE: ÖV-Güteklassen
- BAFU: Strassen- und Bahnlärm
- OpenStreetMap / Overpass: Distanzen zu ÖV, Einkauf, Schulen und Autobahnanschlüssen

Die App simuliert bei der Lageanalyse keine Standortwerte mehr. Nicht verfügbare Teilwerte werden transparent ausgewiesen und neutral gewichtet. Marktpreis und Marktmiete bleiben in V3.0 weiterhin separate, modellbasierte Module.

## Deployment

Das Projekt enthält die Vercel Function `api/location.js`. Keine API-Schlüssel erforderlich.

```bash
npm install
npm run build
```
