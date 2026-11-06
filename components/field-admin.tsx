"use client";

import { useState } from "react";
import { DEPTH_META, type DepthLevel, type FieldDefinition, type Visibility } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { VisibilityBadge } from "@/components/widgets";

export function FieldAdmin() {
  const api = useCatalog();
  if (!api.canAdmin) {
    return (
      <section className="empty">
        <h2>Field admin is limited to workspace admins.</h2>
      </section>
    );
  }
  const groups = ([1, 2, 3] as const).map((level) => ({
    level,
    fields: api.fields.filter((field) => field.depth_level === level).sort((a, b) => a.sort_order - b.sort_order),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Admin</p>
          <h1>Fields</h1>
          <p className="lede">
            Visibility and depth are per workspace. Marking a field internal removes it from public preview and the
            public CSV. Changing depth hides it on shallower forms and does not clear values already stored on a
            service.
          </p>
        </div>
      </div>
      {groups.map((group) => (
        <section className="panel pad" key={group.level} style={{ marginBottom: 16 }}>
          <h2>
            {DEPTH_META[group.level].title} · {DEPTH_META[group.level].levelLabel}
          </h2>
          {group.fields.map((field) => (
            <FieldRow key={field.id} field={field} />
          ))}
        </section>
      ))}
    </>
  );
}

function FieldRow({ field }: { field: FieldDefinition }) {
  const api = useCatalog();
  const [label, setLabel] = useState(field.label);
  const [help, setHelp] = useState(field.help_text);
  const [sortOrder, setSortOrder] = useState(String(field.sort_order));

  function save(patch: Partial<FieldDefinition> = {}) {
    void api.saveField({
      ...field,
      label,
      help_text: help,
      sort_order: Number(sortOrder),
      ...patch,
    });
  }

  return (
    <div className="field-admin">
      <div>
        <p className="code">{field.field_key}</p>
        <input className="input" aria-label={`${field.field_key} label`} value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => save()} />
        <textarea
          className="textarea"
          style={{ marginTop: 8 }}
          aria-label={`${field.field_key} help`}
          value={help}
          onChange={(event) => setHelp(event.target.value)}
          onBlur={() => save()}
        />
      </div>
      <div>
        <p className="micro">Visibility</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => save({ visibility: field.visibility === "public" ? "internal" : "public" })}
        >
          <VisibilityBadge visibility={field.visibility as Visibility} />
        </button>
      </div>
      <div>
        <p className="micro">Depth</p>
        <select
          className="select"
          aria-label={`${field.field_key} depth`}
          value={field.depth_level}
          onChange={(event) => save({ depth_level: Number(event.target.value) as DepthLevel })}
        >
          <option value={1}>Core</option>
          <option value={2}>Operations</option>
          <option value={3}>Governance</option>
        </select>
        <label className="check" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={field.is_required}
            onChange={(event) => save({ is_required: event.target.checked })}
          />
          Required
        </label>
      </div>
      <label>
        <span className="micro">Sort</span>
        <input
          className="input"
          type="number"
          aria-label={`${field.field_key} sort order`}
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          onBlur={() => save()}
        />
      </label>
    </div>
  );
}
