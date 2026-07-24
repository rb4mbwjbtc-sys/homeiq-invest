import { ExternalLink, MapPin } from "lucide-react";

type Props = {
  street: string;
  postalCode: string;
  city: string;
  print?: boolean;
};

const encodeAddress = (street: string, postalCode: string, city: string) =>
  encodeURIComponent([street, postalCode, city, "Schweiz"].filter(Boolean).join(", "));

export function GoogleMapCard({ street, postalCode, city, print = false }: Props) {
  const address = [street, postalCode, city].filter(Boolean).join(" ");
  const query = encodeAddress(street, postalCode, city);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  const embedUrl = `https://www.google.com/maps?q=${query}&output=embed`;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const staticUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${query}&zoom=15&size=900x430&scale=2&maptype=roadmap&markers=color:0x0b6a55%7C${query}&key=${encodeURIComponent(apiKey)}`
    : "";

  if (print) {
    return (
      <div className="google-map-card print-google-map">
        {staticUrl ? (
          <img src={staticUrl} alt={`Google Maps Kartenausschnitt für ${address}`} crossOrigin="anonymous" />
        ) : (
          <div className="map-print-fallback">
            <MapPin size={28} />
            <strong>{address || "Standort"}</strong>
            <span>Für den Google-Maps-Kartenausschnitt im PDF bitte VITE_GOOGLE_MAPS_API_KEY in Vercel hinterlegen.</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="google-map-card">
      <iframe
        title={`Google Maps – ${address}`}
        src={embedUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <a href={mapsUrl} target="_blank" rel="noreferrer" className="map-open-link">
        <MapPin size={16} /> {address || "Standort in Google Maps öffnen"} <ExternalLink size={14} />
      </a>
    </div>
  );
}
