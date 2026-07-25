# HomeIQ Independent V2.8

V2.8 basiert auf V2.6 und ersetzt Google Maps vollständig durch OpenStreetMap.

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
