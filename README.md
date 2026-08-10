# HomeIQ Independent V5.1 – Noise Split & Reliability

V5.1 baut auf V5.0 auf. Alle bereits funktionierenden Lagequellen bleiben unverändert.

Neu in V5.1:

- Strassen- und Bahnlärm werden technisch getrennt abgefragt und gespeichert.
- BAFU-WMS-Layer Strasse Tag/Nacht und Bahn Tag/Nacht werden einzeln abgefragt, damit unterschiedliche WMS-Antwortformate keinen Layer verschlucken.
- BAV-Eisenbahnimmissionen bleiben als zusätzliche offizielle Bahnquelle aktiv.
- Für Lärm gewinnt der nächstgelegene belastbare Rastertreffer; ein weiter entfernter, lauterer Wert ersetzt keinen näheren Wert.
- Entfernung reduziert nur den negativen Einfluss eines Fallback-Treffers, niemals den gemessenen dB-Wert.
- Die Lageanalyse zeigt Strasse und Bahn mit eigener Distanz und eigenem Einfluss transparent an.
- Bei einem temporären Fehler während "Neu laden" bleiben bereits geladene Standortdaten sichtbar.
- Ein vorhandener serverseitiger Cache kann bei einem temporären Quellenfehler als transparenter Stale-Fallback verwendet werden.

Unverändert bleiben insbesondere ÖV, Einkauf, Schule/Betreuung, Autobahnanschluss, Leerstand, GWR/Gebäude, Kartenanzeige sowie die in V5.0 kalibrierten Distanzkurven.
