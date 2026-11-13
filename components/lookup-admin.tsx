"use client";

import Link from "next/link";
import { useState } from "react";
import { visibleLookupGroups } from "@/lib/catalog/lookups";
import type { LookupOption } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { LookupImportControls } from "@/components/lookup-import";

export function LookupAdmin() {
  const api = useCatalog();
  const [fieldKey, setFieldKey] = useState("service_tier");
  const groups = visibleLookupGroups(api.fields, api.lookups);
  const group = groups.find((item) => item.field_key === fieldKey) ?? groups[0];
  const options = api.lookups
    .filter((option) => option.field_key === group?.field_key)
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.sort_order - b.sort_order);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [prefix, setPrefix] = useState("");

  if (!api.canAdmin) {
    return (
      <section className="empty">
        <h2>Lookup admin is limited to workspace admins.</h2>
      </section>
    );
  }
  if (!group) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Admin</p>
          <h1>Dropdowns</h1>
          <p className="lede">
            Add options, edit labels and the hover description, change sort order, and retire options you no longer
            offer. Retired options stay on historical services. They are never deleted. Service Owners are people, so
            they live on their own page.
          </p>
          <p>
            <Link href="/admin/owners">Open Service Owners</Link>
          </p>
        </div>
      </div>
      <div className="admin-layout">
        <nav className="panel group-nav" aria-label="Lookup groups">
          {groups.map((item) => (
            <button
              type="button"
              key={item.field_key}
              aria-current={item.field_key === group.field_key}
              onClick={() => setFieldKey(item.field_key)}
            >
              {item.title}
            </button>
          ))}
        </nav>
        <section className="panel pad">
          <p className="micro">{group.field_key}</p>
          <h2>{group.title}</h2>
          <p className="lede">{group.blurb}</p>
          <LookupImportControls fieldKey={group.field_key} />
          <form
            className="form-grid"
            style={{ margin: "16px 0" }}
            onSubmit={(event) => {
              event.preventDefault();
              void api
                .addLookup({
                  field_key: group.field_key,
                  code,
                  label,
                  description,
                  code_prefix: prefix,
                  sort_order: (options.length + 1) * 10,
                })
                .then(() => {
                  setCode("");
                  setLabel("");
                  setDescription("");
                  setPrefix("");
                });
            }}
          >
            <input className="input" placeholder="code_name" aria-label="New code" value={code} onChange={(event) => setCode(event.target.value)} />
            <input className="input" placeholder="Display label" aria-label="New label" value={label} onChange={(event) => setLabel(event.target.value)} />
            <textarea className="textarea span-2" placeholder="Hover description" aria-label="New description" value={description} onChange={(event) => setDescription(event.target.value)} />
            {group.field_key === "category" ? (
              <input className="input" placeholder="Prefix, e.g. SOC" aria-label="Code prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
            ) : null}
            <button type="submit" className="btn btn-primary">
              Add option
            </button>
          </form>
          {options.map((option) => (
            <OptionEditor key={option.id} option={option} showPrefix={group.field_key === "category"} />
          ))}
        </section>
      </div>
    </>
  );
}

function OptionEditor({ option, showPrefix }: { option: LookupOption; showPrefix: boolean }) {
  const api = useCatalog();
  const [label, setLabel] = useState(option.label);
  const [description, setDescription] = useState(option.description ?? "");
  const [prefix, setPrefix] = useState(option.code_prefix ?? "");
  const [sortOrder, setSortOrder] = useState(String(option.sort_order));

  function save(patch: Partial<LookupOption> = {}) {
    void api.saveLookup({
      ...option,
      label,
      description,
      code_prefix: prefix,
      sort_order: Number(sortOrder),
      ...patch,
    });
  }

  return (
    <article className={option.is_active ? "option-card" : "option-card retired"}>
      <div>
        <p className="code">{option.code}</p>
        <input className="input" aria-label={`${option.code} label`} value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => save()} />
        <textarea
          className="textarea"
          style={{ marginTop: 8 }}
          aria-label={`${option.code} description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => save()}
        />
        {showPrefix ? (
          <input
            className="input"
            style={{ marginTop: 8 }}
            aria-label={`${option.code} prefix`}
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            onBlur={() => save()}
          />
        ) : null}
      </div>
      <label>
        <span className="micro">Sort</span>
        <input
          className="input"
          type="number"
          value={sortOrder}
          aria-label={`${option.code} sort order`}
          onChange={(event) => setSortOrder(event.target.value)}
          onBlur={() => save()}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => save({ is_active: !option.is_active, label, description, code_prefix: prefix, sort_order: Number(sortOrder) })}
      >
        {option.is_active ? "Retire" : "Reactivate"}
      </button>
    </article>
  );
}
