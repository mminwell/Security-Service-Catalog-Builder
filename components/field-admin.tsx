"use client";

import { useState } from "react";
import { isIdentityField, type FieldGroupId } from "@/lib/catalog/fields";
import { lookupToggleFor } from "@/lib/catalog/lookup-toggle";
import { DEPTH_META, type DepthLevel, type FieldDefinition, type Visibility } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { Badge, VisibilityBadge } from "@/components/widgets";

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
    fields: api.fields
      .filter((field) => field.depth_level === level)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.sort_order - b.sort_order),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Admin</p>
          <h1>Fields</h1>
          <p className="lede">
            Visibility and depth are per workspace. Marking a field internal keeps it out of a public export. Retire a
            field to hide it from the service form, filters, completeness, and exports without deleting values already
            stored on a service. Service code and name stay active.
          </p>
        </div>
      </div>
      <section className="panel pad" style={{ marginBottom: 16 }}>
        <h2>Optional groups</h2>
        <p className="lede">
          Geography and privacy are off until a workspace admin turns them on. Turning a group on adds its fields to the
          form and to completeness. Turning it off hides them and leaves stored values in place. The fields record what
          the workspace entered. They do not decide whether a law applies.
        </p>
        <GroupToggle group="geography" title="Geography" />
        <GroupToggle group="privacy" title="Privacy" />
      </section>
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

function GroupToggle({ group, title }: { group: FieldGroupId; title: string }) {
  const api = useCatalog();
  const members = api.fields.filter((field) => field.field_group === group);
  const enabled = members.length > 0 && members.every((field) => field.is_active);
  return (
    <label className="check" style={{ marginTop: 10 }}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => void api.setFieldGroup(group, event.target.checked)}
      />
      {title}
      <span className="hint">
        {" "}
        {enabled ? "On" : "Off"} · {members.length} fields
      </span>
    </label>
  );
}

function LookupToggle({ field }: { field: FieldDefinition }) {
  const api = useCatalog();
  const toggle = lookupToggleFor(field);
  return (
    <div style={{ marginTop: 8 }}>
      <label className="check">
        <input
          type="checkbox"
          checked={toggle.checked}
          disabled={toggle.disabled}
          aria-label={`${field.field_key} Lookup`}
          onChange={(event) => void api.setFieldLookup(field.id, event.target.checked)}
        />
        Lookup
      </label>
      {toggle.reason ? <p className="hint">{toggle.reason}</p> : null}
    </div>
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

  const locked = isIdentityField(field.field_key);
  return (
    <div className={field.is_active ? "field-admin" : "field-admin retired"}>
      <div>
        <p className="code">{field.field_key}</p>
        {field.is_active ? null : <Badge tone="neutral">Retired</Badge>}
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
        <LookupToggle field={field} />
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
      <div>
        {locked ? (
          <span className="micro">Core ID</span>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => save({ is_active: !field.is_active })}
          >
            {field.is_active ? "Retire" : "Reactivate"}
          </button>
        )}
      </div>
    </div>
  );
}
