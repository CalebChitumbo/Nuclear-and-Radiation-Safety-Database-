"use client";

/**
 * A type-ahead text field for the border scan form.
 *
 * The point is to make the known answer the cheapest one to give without ever
 * blocking a new one: an officer logging 400 trucks a shift types two or three
 * letters and presses Enter, but the truck carrying something the list has
 * never seen is still one keystroke away from being recorded truthfully.
 *
 * Keyboard: ↑/↓ move through the list, Enter accepts the highlighted
 * suggestion (or keeps what was typed when nothing is highlighted), Escape
 * closes the list. Enter never submits the form while the list is open, so a
 * fast typist cannot save a half-picked value by accident.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SuggestOption {
  value: string;
  /** Small grey line under the value — a class, a hint, a last-seen note. */
  hint?: string;
  /** Right-aligned chip — used for the cargo class. */
  badge?: string;
}

export function Suggest({
  label,
  value,
  onChange,
  onPick,
  options,
  placeholder,
  error,
  note,
  autoFocus,
  inputRef,
  uppercase,
  onEnterWhenClosed,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Fired when a suggestion is chosen (click or Enter) rather than typed. */
  onPick?: (o: SuggestOption) => void;
  options: SuggestOption[];
  placeholder?: string;
  error?: string;
  note?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  uppercase?: boolean;
  /** Enter pressed with no suggestion list open — usually "save the scan". */
  onEnterWhenClosed?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || ownRef;

  const visible = useMemo(() => options.slice(0, 8), [options]);

  useEffect(() => {
    setActive(0);
  }, [value]);

  // Clicking anywhere else closes the list (a phone tap counts as a click).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const accept = (o: SuggestOption) => {
    onChange(o.value);
    onPick?.(o);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!visible.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + visible.length) % visible.length;
      });
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      if (open && visible.length) {
        e.preventDefault();
        accept(visible[active]);
        return;
      }
      if (onEnterWhenClosed) {
        e.preventDefault();
        onEnterWhenClosed();
      }
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        className="input"
        style={{
          textTransform: uppercase ? "uppercase" : undefined,
          borderColor: error ? "var(--status-stalled)" : undefined,
        }}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize={uppercase ? "characters" : "words"}
        spellCheck={false}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={`${id}-list`}
        aria-expanded={open && visible.length > 0}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {error ? (
        <div className="text-[11px] mt-1" style={{ color: "var(--status-stalled)" }}>
          {error}
        </div>
      ) : note ? (
        <div className="text-[11px] mt-1 text-gunmetal/60">{note}</div>
      ) : null}

      {open && visible.length ? (
        <ul
          id={`${id}-list`}
          className="popover absolute z-30 left-0 right-0 mt-1 overflow-hidden"
          style={{ maxHeight: 280, overflowY: "auto" }}
          role="listbox"
        >
          {visible.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => accept(o)}
                className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2"
                style={{
                  background: i === active ? "rgba(0,160,80,0.10)" : "transparent",
                }}
              >
                <span>
                  <span className="block text-sm font-bold">{o.value}</span>
                  {o.hint ? (
                    <span className="block text-[11px] text-gunmetal/60">
                      {o.hint}
                    </span>
                  ) : null}
                </span>
                {o.badge ? (
                  <span className="chip shrink-0">{o.badge}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
