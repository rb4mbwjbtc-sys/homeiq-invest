# HomeIQ Independent v2.5

V2.5 basiert auf V2.4 und enthält:

- HomeIQ Scorekarte nach dem freigegebenen Referenzdesign
- Scorekarte in Dashboard, Ergebnisansicht und PDF
- Google-Maps-Kartenausschnitt mit Objekt-Pin in der Lageanalyse
- Google-Maps-Kartenausschnitt im PDF bei hinterlegtem API-Key
- bestehende Berechnungs-, Markt-, Speicher- und PDF-Funktionen aus V2.4

## Entwicklung

```bash
npm install
npm run dev
```

## Produktions-Build

```bash
npm run build
```

## Google Maps

Der Google-Maps-Kartenausschnitt in der App wird anhand der eingegebenen Adresse erzeugt.

Damit der Kartenausschnitt auch im erzeugten PDF erscheint, muss in Vercel folgende Environment Variable hinterlegt werden:

```text
VITE_GOOGLE_MAPS_API_KEY=<Google Maps API Key>
```

Für diesen Schlüssel muss die **Maps Static API** im Google-Cloud-Projekt aktiviert sein. Der Schlüssel sollte auf die produktive HomeIQ-Domain eingeschränkt werden.
