# HomeIQ Independent V5.2 – OSM Micro-Location Environment

V5.2 baut auf V5.1 auf. Alle bereits funktionierenden Standortquellen (Adresse/GWR, ÖV, Einkauf, Schule/Betreuung, Autobahn, Leerstand und Lärm) bleiben unverändert.

Neu in V5.2:

- Mikrolage wird nicht mehr aus ÖV, Einkauf, Schule, Lärm oder Leerstand abgeleitet.
- Eine separate OpenStreetMap/Overpass-Umfeldanalyse betrachtet das unmittelbare Wohnumfeld bis 2 km.
- Gewichtung Mikrolage: Grün & Natur 30 %, Gewässer 15 %, Freizeit & Familie 20 %, Wohnumfeld 25 %, lokale Urbanität/Dienstleistungen 10 %.
- Grünflächen werden nicht nur nach dem nächsten Treffer, sondern zusätzlich nach Dichte innerhalb 500 m / 1 km bewertet.
- Erfasst werden u. a. Parks, Wald/Natur, Seen/Flüsse/Bäche, Spielplätze, Sport-/Freizeitanlagen, Wohngebiet, Industrie/Gewerbe, Hauptverkehrsachsen sowie lokale Dienstleistungen.
- Strassen-/Bahnlärm wird in der Mikrolage bewusst nicht nochmals bewertet, da dafür ein eigener Lärmfaktor existiert.
- Die Ergebnisansicht zeigt statt "x/100 Qualität" eine transparente Kurzbeschreibung, z. B. "Grün/Natur 250 m · Gewässer 600 m · Freizeit 400 m · Wohngebiet im Umfeld".
- Fehlen die Mikrolagedaten technisch, wird der Mikrolagefaktor nicht als gemessener Wert ausgegeben.

Die öffentliche Photon-/Overpass-Infrastruktur bleibt ein Fallback-/Open-Data-Zugriff. Für hohe Produktionslast sollte später ein eigener oder vertraglich abgesicherter OSM-Dienst verwendet werden.
