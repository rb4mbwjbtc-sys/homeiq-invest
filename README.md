# HomeIQ Independent V3.2

V3.2 stabilisiert die automatische Schweizer Open-Data-Lageanalyse aus V3.1.

## Hauptverbesserungen

- Gesamtes serverseitiges Zeitlimit von 9 Sekunden
- Clientseitiger Abbruch nach 12 Sekunden: kein unendlicher Ladezustand
- Externe Quellen werden weitgehend parallel abgefragt
- `Promise.allSettled`-ähnliche Teilresultate: einzelne Ausfälle blockieren nicht die ganze Analyse
- GeoAdmin bleibt die primäre Quelle für Adresse, Gemeinde, GWR, ÖV-Güteklasse und Lärm
- Nächstgelegene ÖV-Haltestelle über die Schweizer Transport API
- POI-Suche für Einkauf, Schule/Betreuung und Autobahn in einer einzigen, begrenzten Abfrage bis 10 km
- Zwei parallele Overpass-Endpunkte; der erste erfolgreiche Datensatz wird verwendet
- BFS-Leerstand mit kurzem Timeout; bei Ausfall bleiben andere Daten verfügbar
- Cache im Browser für 30 Tage
- zusätzlicher kurzlebiger Server-/CDN-Cache
- transparente Statusdaten je Quelle
- keine simulierten Distanzen in der Benutzeroberfläche

## Verhalten bei Teilausfällen

Die Analyse liefert verfügbare Resultate zurück. Fehlende Teilwerte werden als „nicht verfügbar“ angezeigt und im Score neutral behandelt. Eine langsame oder ausgefallene Quelle hält die App nicht mehr dauerhaft im Ladezustand.

## Datenquellen

- swisstopo / GeoAdmin
- ARE ÖV-Güteklassen
- BAFU Lärmdaten
- BFS Leerwohnungszählung
- Transport API Schweiz
- OpenStreetMap / Overpass

Marktmiete und Marktwert bleiben in V3.2 noch modellbasiert.

## Optionaler persistenter Cache mit Supabase

V3.2 funktioniert auch ohne Supabase. Für einen geräteübergreifenden 30-Tage-Cache kann später `supabase/location_cache.sql` im eigenen Supabase-Projekt ausgeführt werden. Anschliessend werden in Vercel nur serverseitig gesetzt:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Der Service-Role-Key wird nie an den Browser ausgeliefert. Fällt Supabase aus oder ist es nicht konfiguriert, läuft die Analyse weiterhin über Browser-, CDN- und In-Memory-Cache.
