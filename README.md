# HomeIQ Independent V5.3 – Isolated Micro-Location

V5.3 baut bewusst auf der stabilen V5.2 auf. Die funktionierende Kernpipeline für Adresse/GWR, ÖV, Einkauf, Schule/Betreuung, Autobahn, Leerstand und Lärm bleibt unverändert.

Neu in V5.3:
- Mikrolage ist aus `/api/location` herausgelöst und kann die Standortanalyse nicht mehr blockieren.
- Ein Klick auf „Standortdaten automatisch laden“ lädt zuerst die stabile Kernpipeline.
- Nach erfolgreichem Kern-Load wird die Mikrolage separat und optional über `/api/micro-location` geladen.
- Scheitert oder timed-out die Mikrolage, bleiben alle Kern-Standortdaten sichtbar; es erscheint kein Gesamtfehler wegen Mikrolage.
- Mikrolage nutzt eine einzige kompakte OSM/Overpass-Abfrage bis 2 km statt mehrerer Module/Requests.
- Vier einfache Faktoren: Grün & Natur 30 %, Gewässer 20 % (Bonus, bei Fehlen aus Gewichtung entfernt), Freizeit & Familie 25 %, Nahversorgung 25 %.
- Distanzbasierte, nachvollziehbare Schwellen statt komplexer Umfeldmodelle.
- Mikrolage wird nur in den Lage-Score aufgenommen, wenn die optionale Abfrage erfolgreich war.
