# HomeIQ Invest V5.5

Basis: stabile V5.2. Alle funktionierenden Standort- und Marktdaten-Pipelines bleiben unverändert.

## V5.5 – Stabile Nachfrageberechnung ohne Bevölkerungsentwicklung

Die Mikrolage wird ausschliesslich aus bereits geladenen Standortdaten berechnet. Es gibt keinen separaten Mikrolage-/Overpass-Aufruf mehr.

Gewichtung:
- Einkauf: 30 %
- Schule / Betreuung: 25 %
- ÖV-Distanz: 25 %
- Autobahnanschluss: 20 %

Fehlende Werte werden aus dem Nenner entfernt; die vorhandenen Gewichte werden proportional normalisiert. Die Datenabdeckung der Mikrolage wird separat ausgewiesen. Lärm und Leerstand werden nicht nochmals in die Mikrolage eingerechnet, da sie eigene Lagefaktoren sind.

Autobahnanschluss nutzt einen Sweet-Spot: unmittelbare Autobahnnähe ist nicht automatisch optimal; 0.75–3 km erhält die beste Bewertung.


### V5.5 Änderung
- Mikrolage bleibt sichtbar und wird wie in V5.3 aus ÖV, Einkauf, Schule/Betreuung und Autobahn berechnet.
- Mikrolage wird nicht mehr zusätzlich in den Lage-Gesamtscore gewichtet.
- Die übrigen Lagefaktoren werden proportional auf 100 % normalisiert.
- Datenabdeckung des Lage-Scores basiert nur auf den tatsächlich gewichteten Kernfaktoren.
- Mikrolage wird nicht nochmals als Stärke/Risiko in der Gesamtbeurteilung gezählt.

## Nachfrage in V5.5

Die experimentelle STATPOP-Bevölkerungsentwicklung wurde vollständig entfernt. Die Nachfrage bleibt bewusst bei der stabilen, bereits bewährten Ableitung aus Leerstandsrisiko und ÖV-Qualität. Es werden dafür keine zusätzlichen API-Aufrufe ausgeführt.

Formel im bestehenden Standort-Service:

- Leerstand ist der dominante Faktor.
- ÖV-Güteklasse wirkt als kleiner Zu-/Abschlag.
- Fehlt die Leerwohnungsziffer, bleibt das bestehende neutrale Fallback-Verhalten erhalten.

Alle funktionierenden Datenquellen und die V5.4-Mikrolage-Logik bleiben unverändert.
