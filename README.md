# HomeIQ Independent V5.0 – Calibrated Location Scoring

V5.0 baut auf V4.9 auf. Die funktionierenden Datenquellen bleiben unverändert. Neu kalibriert HomeIQ die Lagebewertung fachlich strenger und stabilisiert die OSM-Fallbacks.

## Neu
- Distanzkurven getrennt für ÖV, Einkauf, Schule/Betreuung und Autobahn
- Autobahnanschlüsse in 7–10 km Entfernung erhalten keine nahezu maximale Bewertung mehr
- Lärm wird aus dB-Kategorie und räumlicher Aussagekraft getrennt bewertet
- entfernte Lärmraster reduzieren die Verlässlichkeit, nicht den dB-Wert selbst
- Lage-Rating zeigt bei <40 % Datenabdeckung explizit eingeschränkte Aussagekraft
- Photon und Overpass erhalten interne Retries; technische Ausfälle werden nicht mit einem echten „kein Treffer“ gleichgesetzt
- alle in V4.9 funktionierenden Schweizer Datenconnectoren bleiben bestehen
