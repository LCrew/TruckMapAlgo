import { useEffect, useRef, useState } from "react";
import { api, GeoHit } from "../lib/api";

interface Props {
  value: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onSelect: (hit: GeoHit) => void;
}

/** Address field with Nominatim suggestions limited to LV/LT/EE. */
export default function AddressInput({ value, placeholder, onChange, onSelect }: Props) {
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [open, setOpen] = useState(false);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || value.trim().length < 4) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api.geocode(value).then((h) => {
        setHits(h);
        setOpen(true);
      }).catch(() => setHits([]));
    }, 700);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="ac">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && hits.length > 0 && (
        <div className="ac-list">
          {hits.map((h) => (
            <div
              key={`${h.lat},${h.lon}`}
              onMouseDown={() => {
                typed.current = false;
                onSelect(h);
                setOpen(false);
              }}
            >
              <span className="tag">{h.country_code}</span> {h.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
