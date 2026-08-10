# HomeIQ Independent V5.3 – Robust Modular Micro-Location

V5.3 baut auf V5.2 auf. Alle bereits funktionierenden Standortquellen bleiben unverändert. Geändert wurde gezielt die Mikrolage.

Neu in V5.3:
- fünf unabhängige Mikrolage-Module: Grün/Natur, Gewässer, Freizeit/Familie, Wohnumfeld, lokale Urbanität
- ein technischer Ausfall eines Moduls verwirft nicht mehr die übrigen Teilergebnisse
- OSM-Wege und -Flächen werden mit Geometrie ausgewertet; bei grossen Polygonen zählt der Abstand zur tatsächlichen Geometrie statt zum Mittelpunkt (wichtig z.B. für Seen, Parks und Wälder)
- Gewässer bleiben Bonusfaktor: kein Gewässer bis 2 km verursacht keinen Malus
- dynamische Gewichtung nur über tatsächlich aktive Mikrolage-Komponenten
- separate Mikrolage-Datenabdeckung und transparente Teilwerte in der Ergebnisansicht
- ÖV, Einkauf, Schule, Autobahn, Leerstand, GWR und Lärm bleiben technisch unverändert

Version: 5.3.0
