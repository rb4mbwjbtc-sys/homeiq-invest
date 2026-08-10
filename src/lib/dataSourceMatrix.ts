export const DATA_SOURCE_MATRIX = [
  { tier: 1, source: "swisstopo / GeoAdmin", purpose: "Adresse, Koordinaten, Gemeinde", mode: "aktiv" },
  { tier: 1, source: "BFS / GWR", purpose: "Gebäude und Leerwohnungsziffer", mode: "aktiv" },
  { tier: 1, source: "ARE", purpose: "ÖV-Güteklasse", mode: "aktiv" },
  { tier: 1, source: "BAFU", purpose: "Strassen- und Bahnlärm", mode: "aktiv" },
  { tier: 1, source: "OpenTransportData", purpose: "Nächster ÖV-Servicepunkt", mode: "aktiv" },
  { tier: 1, source: "OpenStreetMap", purpose: "Einkauf, Schule/Betreuung, Autobahn", mode: "Fallback" },
  { tier: 1, source: "ESTV", purpose: "Steuerdaten", mode: "Adapter vorbereitet; kein undokumentiertes Scraping" },
  { tier: 2, source: "opendata.swiss", purpose: "Kantonale und kommunale Markt-/Mietdaten", mode: "aktiv – automatische Metadatensuche" },
  { tier: 2, source: "Open Data Zürich / Kanton Zürich", purpose: "Miet- und Transaktionsbenchmarks", mode: "aktiv, sofern passend" },
  { tier: 3, source: "Raiffeisen Gemeindeinfo", purpose: "Marktmiete, Marktpreis, Nachfrage", mode: "vorbereitet – offizieller Zugang erforderlich" },
  { tier: 3, source: "ImmoScout24 / SMG", purpose: "Angebotspreise und Angebotsmieten", mode: "vorbereitet – API/Lizenz erforderlich" },
  { tier: 3, source: "Comparis Immobilien", purpose: "Vergleichsangebote und Historie", mode: "vorbereitet – API/Lizenz erforderlich" },
] as const;
