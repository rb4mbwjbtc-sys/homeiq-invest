# HomeIQ Invest V5.3

Basis: stabile V5.2. Alle funktionierenden Standort- und Marktdaten-Pipelines bleiben unverändert.

## V5.3 – robuste Mikrolage ohne zusätzliche Datenabfrage

Die Mikrolage wird ausschliesslich aus bereits geladenen Standortdaten berechnet. Es gibt keinen separaten Mikrolage-/Overpass-Aufruf mehr.

Gewichtung:
- Einkauf: 30 %
- Schule / Betreuung: 25 %
- ÖV-Distanz: 25 %
- Autobahnanschluss: 20 %

Fehlende Werte werden aus dem Nenner entfernt; die vorhandenen Gewichte werden proportional normalisiert. Die Datenabdeckung der Mikrolage wird separat ausgewiesen. Lärm und Leerstand werden nicht nochmals in die Mikrolage eingerechnet, da sie eigene Lagefaktoren sind.

Autobahnanschluss nutzt einen Sweet-Spot: unmittelbare Autobahnnähe ist nicht automatisch optimal; 0.75–3 km erhält die beste Bewertung.
