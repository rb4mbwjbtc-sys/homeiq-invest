# HomeIQ Independent V2.8

Korrekturversion auf Basis V2.7.

- Score ohne überlagerndes Icon
- Dashboard ohne Statistik-Kacheln und Schnellstart-Karte
- stabile, kostenlose Kartendarstellung mit OpenStreetMap-Daten / CARTO-Kacheln
- Karte zeigt nur den Immobilien-Pin
- überarbeitetes Einseiten-PDF im HomeIQ-Design

# HomeIQ Independent V2.7

V2.7 basiert auf V2.6 und ersetzt Google Maps vollständig durch OpenStreetMap.

## Neu

- kostenlose OpenStreetMap-Karte ohne API-Key
- Adressauflösung über Nominatim
- Objekt-Pin auf der Ergebnisseite
- derselbe Kartenausschnitt im PDF
- OpenStreetMap-Quellenhinweis
- keine Google-Maps-Umgebungsvariable erforderlich

## Deployment

```bash
npm install
npm run build
```

Vercel: Framework Vite, Build `npm run build`, Output `dist`.
