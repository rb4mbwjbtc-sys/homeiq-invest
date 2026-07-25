# HomeIQ Independent V2.9

V2.9 basiert auf V2.6 und ersetzt Google Maps vollständig durch OpenStreetMap.

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


## Änderungen in V2.9

- Score-Ring ohne zusätzliches Symbol über der Zahl
- Kartenkacheln über CARTO/OpenStreetMap ohne 403-Referrer-Fehler
- fixer Header auf Desktop und Mobile
- Gratis-Kontingent: insgesamt drei Analysen, mit verbleibender Anzahl
- stabilisiertes Einseiten-PDF ohne überlappende Score-Faktoren
