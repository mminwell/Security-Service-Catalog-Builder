"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { labelMap, summarizeAudit } from "@/lib/catalog/audit";
import { activeOptions } from "@/lib/catalog/lookups";
import { DEPTH_META, type AuditEntry, type DepthLevel, type FieldDefinition, type LookupOption, type Visibility } from "@/lib/catalog/types";
import { visibilityLabel, type Tone } from "@/lib/catalog/present";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return <Badge tone={visibility === "internal" ? "accent" : "neutral"}>{visibilityLabel(visibility)}</Badge>;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop confirm-layer" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p className="lede">{message}</p>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={tone === "danger" ? "btn btn-danger" : "btn btn-primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Loading({ label = "Loading catalog…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      {label}
    </div>
  );
}

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <span className="info" ref={ref}>
      <button
        type="button"
        className="info-btn"
        aria-expanded={open}
        aria-label={`About ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      {open ? (
        <div className="popover" role="dialog" aria-label={label}>
          {children}
        </div>
      ) : null}
    </span>
  );
}

export function FieldHelp({
  field,
  lookups,
  selectedCode,
}: {
  field: FieldDefinition;
  lookups: LookupOption[];
  selectedCode?: string | null;
}) {
  const options = field.lookup_field_key ? activeOptions(lookups, field.lookup_field_key) : [];
  const described = options.filter((option) => option.description);
  const selected = options.find((option) => option.code === selectedCode);
  const showAll = described.length > 0 && described.length <= 8;
  return (
    <>
      <p>{field.help_text}</p>
      {showAll ? (
        <div>
          {described.map((option) => (
            <div className="def" key={option.id}>
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </div>
          ))}
        </div>
      ) : selected?.description ? (
        <div className="def">
          <strong>{selected.label}</strong>
          <span>{selected.description}</span>
        </div>
      ) : null}
    </>
  );
}

export function DepthToggle({ value, onChange }: { value: DepthLevel; onChange: (depth: DepthLevel) => void }) {
  return (
    <div className="depth" role="radiogroup" aria-label="Form depth">
      {([1, 2, 3] as const).map((level) => {
        const meta = DEPTH_META[level];
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            onClick={() => onChange(level)}
          >
            <strong>{meta.title}</strong>
            <span>{meta.levelLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LookupSelect({
  id,
  value,
  options,
  disabled,
  placeholder = "Select…",
  onChange,
}: {
  id?: string;
  value: string | null;
  options: LookupOption[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const ref = useDismiss(open, () => setOpen(false));
  const listId = useId();
  const selected = options.find((option) => option.code === value) ?? null;
  const legacy =
    value && !selected ? [{ code: value, label: value, description: null as string | null }] : [];
  const choices = [
    { code: "", label: placeholder, description: null as string | null },
    ...legacy,
    ...options.map((option) => ({
      code: option.code,
      label: option.label,
      description: option.description,
    })),
  ];

  function choose(code: string) {
    onChange(code || null);
    setOpen(false);
  }

  return (
    <div className="lookup" ref={ref}>
      <button
        id={id}
        type="button"
        className="lookup-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          const index = Math.max(0, choices.findIndex((choice) => choice.code === (value ?? "")));
          setCursor(index);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selected?.label ?? (value ? value : placeholder)}</span>
        <span aria-hidden="true" className="muted">▾</span>
      </button>
      {open ? (
        <div
          className="lookup-menu"
          id={listId}
          role="listbox"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((index) => Math.min(choices.length - 1, index + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((index) => Math.max(0, index - 1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const choice = choices[cursor];
              if (choice) choose(choice.code);
            }
          }}
        >
          {choices.map((choice, index) => (
            <button
              type="button"
              role="option"
              key={choice.code || "empty"}
              aria-selected={choice.code === (value ?? "")}
              onMouseEnter={() => setCursor(index)}
              onClick={() => choose(choice.code)}
            >
              <span>{choice.label}</span>
              {choice.description ? <span className="opt-desc">{choice.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AuditDrawer({
  title,
  entries,
  fields,
  onClose,
}: {
  title: string;
  entries: AuditEntry[];
  fields: FieldDefinition[];
  onClose: () => void;
}) {
  const labels = labelMap(fields);
  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="page-head">
          <div>
            <p className="micro">Audit</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="lede">No changes recorded yet.</p>
        ) : (
          <div>
            {entries.map((entry) => {
              const summary = summarizeAudit(entry, labels);
              return (
                <article className="audit-item" key={entry.id}>
                  <p className="micro">{new Date(entry.created_at).toLocaleString()}</p>
                  <p>
                    <strong>{entry.actor_label}</strong> · {summary.title}
                  </p>
                  {summary.changes.length > 0 ? (
                    <ul>
                      {summary.changes.map((change) => (
                        <li key={change.key}>
                          <strong>{change.label}.</strong> <span className="change-from">{change.from}</span> → {change.to}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

function useDismiss(
  open: boolean,
  onClose: () => void,
  extra?: { current: HTMLElement | null },
) {
  const node = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (node.current?.contains(target) || extra?.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, extra]);
  return useCallback((element: HTMLElement | null) => {
    node.current = element;
  }, []);
}

export { useDismiss };
