# HomeIQ Invest V5.5.3

Basis: stabile V5.2. Alle funktionierenden Standort- und Marktdaten-Pipelines bleiben unverändert.

## V5.5.3 – Nachfrageindikator mit Bevölkerungsentwicklung

Die Mikrolage wird ausschliesslich aus bereits geladenen Standortdaten berechnet. Es gibt keinen separaten Mikrolage-/Overpass-Aufruf mehr.

Gewichtung:
- Einkauf: 30 %
- Schule / Betreuung: 25 %
- ÖV-Distanz: 25 %
- Autobahnanschluss: 20 %

Fehlende Werte werden aus dem Nenner entfernt; die vorhandenen Gewichte werden proportional normalisiert. Die Datenabdeckung der Mikrolage wird separat ausgewiesen. Lärm und Leerstand werden nicht nochmals in die Mikrolage eingerechnet, da sie eigene Lagefaktoren sind.

Autobahnanschluss nutzt einen Sweet-Spot: unmittelbare Autobahnnähe ist nicht automatisch optimal; 0.75–3 km erhält die beste Bewertung.


### V5.4 Änderung
- Mikrolage bleibt sichtbar und wird wie in V5.3 aus ÖV, Einkauf, Schule/Betreuung und Autobahn berechnet.
- Mikrolage wird nicht mehr zusätzlich in den Lage-Gesamtscore gewichtet.
- Die übrigen Lagefaktoren werden proportional auf 100 % normalisiert.
- Datenabdeckung des Lage-Scores basiert nur auf den tatsächlich gewichteten Kernfaktoren.
- Mikrolage wird nicht nochmals als Stärke/Risiko in der Gesamtbeurteilung gezählt.


### V5.5.3 Änderung
- Nachfrageindikator: 70 % Leerstand, 20 % 5-Jahres-Bevölkerungsentwicklung, 10 % ÖV.
- Bevölkerungsentwicklung wird über BFS STATPOP/PxWeb anhand der bereits bekannten BFS-Gemeindenummer geladen.
- Fehlende Bevölkerungsdaten werden nicht geschätzt; vorhandene Komponenten werden proportional neu gewichtet.
- Die bestehende V5.4 Standort-, Mikrolage- und Lärmpipeline bleibt unverändert.
