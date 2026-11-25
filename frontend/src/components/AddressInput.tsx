import { useEffect, useId, useRef, useState } from "react";
import { api, GeoHit } from "../lib/api";
import { useI18n } from "../lib/i18n";

interface Props {
  value: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onSelect: (hit: GeoHit) => void;
}

/** Address field with suggestions limited to LV/LT/EE. Arrow keys + Enter pick a suggestion, Esc closes the list. */
export default function AddressInput({ value, placeholder, onChange, onSelect }: Props) {
  const { t } = useI18n();
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const [searching, setSearching] = useState(false);
  const typed = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (!typed.current || value.trim().length < 4) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const tm = setTimeout(() => {
      api.geocode(value)
        .then((h) => {
          setHits(h);
          setHl(0);
          setOpen(true);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 600);
    return () => clearTimeout(tm);
  }, [value]);

  const pick = (h: GeoHit) => {
    typed.current = false;
    onSelect(h);
    setOpen(false);
    setHits([]);
  };

  const showList = open && hits.length > 0;
  return (
    <div className="ac">
      <input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHl((i) => (i + 1) % hits.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHl((i) => (i - 1 + hits.length) % hits.length); }
          else if (e.key === "Enter") { e.preventDefault(); pick(hits[hl]); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}
      />
      {searching && <span className="small faint" style={{ position: "absolute", right: 14, top: 13 }}>{t("searching")}</span>}
      {showList && (
        <div className="ac-list" id={listId} role="listbox">
          {hits.map((h, i) => (
            <button type="button" key={`${h.lat},${h.lon}`} role="option" aria-selected={i === hl} className={i === hl ? "hl" : ""}
              onMouseDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setHl(i)}>
              <span className="pill">{h.country_code.toUpperCase()}</span>
              <span>{h.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
