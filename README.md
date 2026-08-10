# HomeIQ Independent V4.6 – Federated Swiss Data Gateway

V4.6 baut technisch auf V3.1 auf und ersetzt die Idee einer selbst zu pflegenden Schweizer Voll-Datenbank durch eine föderierte Quellenarchitektur.

## Datenebene 1 – schweizweite offene/amtliche Quellen

Aktiv eingebunden:

- swisstopo / GeoAdmin: Adresse, Koordinaten, Gemeinde
- BFS / GWR: Gebäudedaten und Leerwohnungsziffer
- ARE: ÖV-Güteklasse
- BAFU: Strassen- und Bahnlärm
- OpenTransportData / transport.opendata.ch: nächster ÖV-Servicepunkt
- OpenStreetMap als nicht blockierender Fallback für Einkauf, Schule/Betreuung und Autobahn

ESTV ist in der Quellenmatrix vorgesehen. V4.6 verwendet bewusst keinen undokumentierten Webseiten-Scraper für den Steuerrechner.

## Datenebene 2 – kantonale und kommunale Open Data

HomeIQ durchsucht automatisiert den Metadatenkatalog von opendata.swiss nach lokalen Miet- und Immobilienpreisdaten. Wo ein unterstützter offener Datensatz verfügbar ist, wird der Benchmark automatisch übernommen.

Als erster konkreter Adapter sind offene Zürcher Miet-/Transaktionsdaten vorgesehen. Fehlende Werte werden nicht erfunden.

## Datenebene 3 – kommerzielle Marktdaten

Die Architektur enthält die Quellenhierarchie für:

- Raiffeisen Gemeindeinfo
- ImmoScout24 / SMG
- Comparis Immobilien

Diese Adapter sind in V4.6 bewusst deaktiviert, solange kein offizieller API-/Lizenzzugang besteht. Es wird kein automatisiertes Scraping eingebaut.

## Verhalten bei fehlenden Marktdaten

Wenn Ebene 1 und 2 keinen belastbaren lokalen CHF/m²- oder Miet-Benchmark liefern, bleiben Marktwert bzw. Marktmiete deaktiviert. Die App zeigt transparent, welche Datenquellen gefunden wurden und warum keine Berechnung erfolgt. Dadurch werden keine scheinpräzisen Werte erfunden.

## Performance

- Client-Timeout für den Gesamtabruf: 12 Sekunden
- Einzelquellen haben kurze Server-Timeouts
- externe Quellen werden weitgehend parallel geladen
- OpenStreetMap kann ausfallen, ohne die restliche Analyse zu blockieren
- erfolgreiche Resultate werden im Vercel-/Memory-Cache zwischengespeichert

## Deployment

Wie bisher über GitHub → Vercel. Es sind für V4.6 keine neuen Environment Variables erforderlich.


## V4.6 – Reliable Location Data

- Lage & Markt ist vollständig automatisch; technische Eingabefelder wurden entfernt.
- POI-Suche erweitert adaptiv: Einkauf/Schule bis 20 km, Autobahnanschlüsse bis 50 km.
- Fehlende Lagewerte werden neutral gewichtet.
- Marktwert und Marktmiete werden nur bei einem positiven, belastbaren Benchmark berechnet.
- Keine CHF-0-Benchmarks oder künstlichen Ersatzwerte.
- PDF-Layout wurde für den A4-Einseitenexport stabilisiert.

## V4.6 – Hybrid POI & Noise Reliability

- ÖV bleibt auf der spezialisierten Schweizer Open-Transport-Pipeline.
- Schulen/Betreuung: offizielle kantonale/kommunale Ressourcen von opendata.swiss zuerst; Parser unterstützt nun WGS84 sowie Schweizer LV03/LV95-Koordinaten. OSM dient als Fallback.
- Einkauf: zwei unabhängige OSM-Zugriffswege (Photon und Overpass), getrennte Kategorien und gestaffelte Radien 3/8/20 km.
- Autobahn: Photon + Overpass mit `motorway_junction`, gestaffelte Radien 10/25/50 km.
- Lärm: BAFU-Strassen-/Bahnlärm plus BAV-Layer für effektive Eisenbahnlärm-Immissionen als zusätzliche offizielle Quelle.
- Die Quellenanzeige weist für Einkauf, Schule, Autobahn und Lärm die tatsächlich verwendete Quelle aus.
