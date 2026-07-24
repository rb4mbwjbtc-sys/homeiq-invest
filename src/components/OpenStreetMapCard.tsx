import { ExternalLink, Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  street: string;
  postalCode: string;
  city: string;
  print?: boolean;
};

type Coordinates = { lat: number; lon: number };

const geocodeCache = new Map<string, Coordinates | null>();
const TILE_SIZE = 256;
const ZOOM = 15;

const addressText = (street: string, postalCode: string, city: string) =>
  [street, postalCode, city, "Schweiz"].filter(Boolean).join(", ");

function lonToTileX(lon: number, zoom: number) {
  return ((lon + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number) {
  const radians = (lat * Math.PI) / 180;
  return (
    (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) /
    2
  ) * 2 ** zoom;
}

async function geocode(address: string): Promise<Coordinates | null> {
  if (geocodeCache.has(address)) return geocodeCache.get(address) ?? null;

  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    limit: "1",
    countrycodes: "ch",
    "accept-language": "de",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) throw new Error("Standort konnte nicht geladen werden.");

  const data = (await response.json()) as Array<{ lat: string; lon: string }>;
  const first = data[0];
  const result = first
    ? { lat: Number.parseFloat(first.lat), lon: Number.parseFloat(first.lon) }
    : null;

  geocodeCache.set(address, result);
  return result;
}

function TileMap({ coordinates, address, print }: { coordinates: Coordinates; address: string; print: boolean }) {
  const tileX = lonToTileX(coordinates.lon, ZOOM);
  const tileY = latToTileY(coordinates.lat, ZOOM);
  const baseX = Math.floor(tileX) - 1;
  const baseY = Math.floor(tileY) - 1;
  const fractionX = tileX - Math.floor(tileX);
  const fractionY = tileY - Math.floor(tileY);

  const tiles = useMemo(() => {
    const output: Array<{ x: number; y: number; col: number; row: number }> = [];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        output.push({ x: baseX + col, y: baseY + row, col, row });
      }
    }
    return output;
  }, [baseX, baseY]);

  const osmUrl = `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lon}#map=${ZOOM}/${coordinates.lat}/${coordinates.lon}`;

  return (
    <div
      className={`osm-map-card ${print ? "print-osm-map" : ""}`}
      data-map-ready="true"
      aria-label={`OpenStreetMap-Kartenausschnitt für ${address}`}
    >
      <div className="osm-map-viewport">
        <div
          className="osm-tile-layer"
          style={{
            left: `calc(50% - ${TILE_SIZE * (1 + fractionX)}px)`,
            top: `calc(50% - ${TILE_SIZE * (1 + fractionY)}px)`,
          }}
        >
          {tiles.map((tile) => (
            <img
              key={`${tile.x}-${tile.y}`}
              src={`https://tile.openstreetmap.org/${ZOOM}/${tile.x}/${tile.y}.png`}
              alt=""
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              style={{ left: tile.col * TILE_SIZE, top: tile.row * TILE_SIZE }}
            />
          ))}
        </div>
        <div className="osm-property-marker" aria-hidden="true">
          <MapPin size={print ? 20 : 34} fill="currentColor" />
        </div>
        <div className="osm-attribution">© OpenStreetMap-Mitwirkende</div>
      </div>
      {!print && (
        <a href={osmUrl} target="_blank" rel="noreferrer" className="map-open-link">
          <MapPin size={16} /> {address || "Standort in OpenStreetMap öffnen"} <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

export function OpenStreetMapCard({ street, postalCode, city, print = false }: Props) {
  const address = addressText(street, postalCode, city);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(
    () => geocodeCache.get(address) ?? null,
  );
  const [loading, setLoading] = useState(!geocodeCache.has(address));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    if (!street && !postalCode && !city) {
      setCoordinates(null);
      setLoading(false);
      return () => { cancelled = true; };
    }

    const cached = geocodeCache.get(address);
    if (cached !== undefined) {
      setCoordinates(cached);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    void geocode(address)
      .then((result) => {
        if (!cancelled) {
          setCoordinates(result);
          if (!result) setError("Adresse wurde nicht gefunden.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Karte konnte nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [address, city, postalCode, street]);

  if (coordinates) {
    return <TileMap coordinates={coordinates} address={address} print={print} />;
  }

  return (
    <div className={`osm-map-card ${print ? "print-osm-map" : ""}`} data-map-ready="false">
      <div className="map-print-fallback">
        {loading ? <Loader2 className="spin" size={print ? 18 : 28} /> : <MapPin size={print ? 18 : 28} />}
        <strong>{address || "Standort"}</strong>
        <span>{loading ? "OpenStreetMap wird geladen …" : error || "Keine Adresse vorhanden."}</span>
      </div>
    </div>
  );
}
