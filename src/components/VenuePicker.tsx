"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

// Dynamically import Leaflet components (SSR-safe)
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const useMapEvents = dynamic(
  () => import("react-leaflet").then((m) => m.useMapEvents),
  { ssr: false }
);
const useMap = dynamic(
  () => import("react-leaflet").then((m) => m.useMap),
  { ssr: false }
);

interface VenueResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface VenuePickerProps {
  value: { venue: string; lat: number | null; lng: number | null };
  onChange: (val: { venue: string; lat: number | null; lng: number | null }) => void;
}

function DraggableMarker({
  position,
  onMove,
}: {
  position: [number, number];
  onMove: (pos: [number, number]) => void;
}) {
  const markerRef = useRef<any>(null);

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        onMove([e.latlng.lat, e.latlng.lng]);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  return (
    <>
      <MapClickHandler />
      <Marker
        draggable={true}
        position={position}
        ref={markerRef}
        eventHandlers={{
          dragend() {
            const m = markerRef.current;
            if (m) {
              const pos = m.getLatLng();
              onMove([pos.lat, pos.lng]);
              reverseGeocode(pos.lat, pos.lng);
            }
          },
        }}
      />
    </>
  );
}

let L: any = null;
let icon: any = null;

async function ensureLeaflet() {
  if (typeof window === "undefined") return;
  if (!L) {
    const leaflet = await import("leaflet");
    L = leaflet;

    // Fix default marker icon (webpack issue with Leaflet images)
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }
}

const REVERSE_CACHE = new Map<string, string>();

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (REVERSE_CACHE.has(key)) return REVERSE_CACHE.get(key)!;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { "User-Agent": "TUAH.com/1.0" } }
    );
    const data = await res.json();
    const name = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    REVERSE_CACHE.set(key, name);
    return name;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

function MapView({
  lat,
  lng,
  onMove,
}: {
  lat: number;
  lng: number;
  onMove: (pos: [number, number]) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    ensureLeaflet();
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-[300px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
        Loading map...
      </div>
    );
  }

  return (
    <div className="w-full h-[300px] rounded-xl overflow-hidden border border-gray-200">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        className="w-full h-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <DraggableMarker position={[lat, lng]} onMove={onMove} />
      </MapContainer>
    </div>
  );
}

export default function VenuePicker({ value, onChange }: VenuePickerProps) {
  const [searchQuery, setSearchQuery] = useState(value.venue || "");
  const [results, setResults] = useState<VenueResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    value.lat && value.lng ? [value.lat, value.lng] : [3.139, 101.6869] // Default: Kuala Lumpur
  );
  const [useMap, setUseMap] = useState(!!(value.lat && value.lng));
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Search Nominatim
  const searchNominatim = async (query: string) => {
    if (!query || query.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=my,sg,id,th`,
        { headers: { "User-Agent": "TUAH.com/1.0" } }
      );
      const data = await res.json();
      setResults(data || []);
      setShowResults(data?.length > 0);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchInput = (q: string) => {
    setSearchQuery(q);
    onChange({ ...value, venue: q });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchNominatim(q), 500);
  };

  const selectResult = (r: VenueResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    setSearchQuery(r.display_name);
    setMapCenter([lat, lng]);
    setUseMap(true);
    setShowResults(false);
    onChange({ venue: r.display_name, lat, lng });
  };

  const handleMapMove = (pos: [number, number]) => {
    setMapCenter(pos);
    reverseGeocode(pos[0], pos[1]).then((name) => {
      setSearchQuery(name);
      onChange({ venue: name, lat: pos[0], lng: pos[1] });
    });
  };

  // Click outside to close results
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Venue <span className="text-gray-400 text-xs">(search or click map)</span>
      </label>
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
          placeholder="Search for a venue or click the map..."
        />
        {searching && (
          <span className="absolute right-4 top-3 text-sm text-gray-400">Searching...</span>
        )}
        {showResults && results.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                className="w-full text-left px-4 py-3 text-sm hover:bg-emerald-50 border-b border-gray-100 last:border-0 transition-colors"
                onClick={() => selectResult(r)}
              >
                <span className="block text-gray-900 font-medium truncate">
                  {r.display_name.split(",")[0]}
                </span>
                <span className="block text-gray-400 text-xs truncate mt-0.5">
                  {r.display_name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        {useMap ? (
          <MapView lat={mapCenter[0]} lng={mapCenter[1]} onMove={handleMapMove} />
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseMap(true)}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              + Select on map
            </button>
            {value.venue && (
              <span className="text-xs text-gray-400">
                Coordinates will be set when map is used
              </span>
            )}
          </div>
        )}
        <div className="mt-2 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
          {value.lat && value.lng && (
            <span>
              📍 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </span>
          )}
          {value.lat && value.lng && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=16/${value.lat}/${value.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline"
            >
              View on OSM →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
