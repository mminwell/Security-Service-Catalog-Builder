"use client";

import { useMemo, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppHref } from "@/components/app-path";
import {
  AISLES,
  BLUEPRINTS,
  BUNDLES,
  blueprintById,
  blueprintIdsInCatalog,
  filterBlueprints,
  type AisleId,
  type Blueprint,
  type BlueprintBundle,
} from "@/lib/catalog/blueprints";
import {
  ALREADY_IN_CATALOG_LABEL,
  cycleBlueprintView,
  readBlueprintView,
  SKIP_EXISTING_LABEL,
  subscribeBlueprintView,
  writeBlueprintView,
  type BlueprintView,
} from "@/lib/catalog/blueprint-view";
import { hintsForBlueprint } from "@/lib/catalog/artifacts";
import { addPackToCart, toggleCart } from "@/lib/catalog/cart";
import { cartIdsFor, setCartIdsFor, subscribeCart } from "@/lib/catalog/cart-store";
import { STARTER_FIELDS } from "@/lib/catalog/fields";
import { activeOptions, optionLabel } from "@/lib/catalog/lookups";
import { shortTier } from "@/lib/catalog/present";
import { useCatalog } from "@/components/catalog-provider";
import { CartIcon } from "@/components/icons";
import { Badge } from "@/components/widgets";

const CSF_SHORT: Record<string, string> = {
  govern: "GV",
  identify: "ID",
  protect: "PR",
  detect: "DE",
  respond: "RS",
  recover: "RC",
};

const TEMPLATE_PAGE_SIZE = 24;

export function BlueprintStore() {
  const api = useCatalog();
  const router = useRouter();
  const to = useAppHref();
  const tenantId = api.activeTenant?.id ?? null;
  const [query, setQuery] = useState("");
  const [aisle, setAisle] = useState<AisleId | "all">("all");
  const [bundleId, setBundleId] = useState<string | "all">("all");
  const [preview, setPreview] = useState<Blueprint | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [status, setStatus] = useState("draft");
  const [owner, setOwner] = useState("");
  const [delivery, setDelivery] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const view = useSyncExternalStore(subscribeBlueprintView, readBlueprintView, () => "list" as const);

  const cart = useSyncExternalStore(
    subscribeCart,
    () => cartIdsFor(tenantId),
    () => cartIdsFor(null),
  );

  const teams = activeOptions(api.lookups, "team");
  const statuses = activeOptions(api.lookups, "status");
  const ownerValue = owner || teams.find((team) => team.code === "corp_security_grc")?.code || teams[0]?.code || "";

  const inCatalog = useMemo(() => blueprintIdsInCatalog(api.services), [api.services]);
  const visible = useMemo(() => filterBlueprints({ query, aisle, bundleId }), [query, aisle, bundleId]);
  const filterKey = `${aisle}\u0000${bundleId}\u0000${query}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const pageCount = Math.max(1, Math.ceil(visible.length / TEMPLATE_PAGE_SIZE));
  const currentPage = Math.min(pageState.key === filterKey ? pageState.page : 1, pageCount);
  const pageStart = (currentPage - 1) * TEMPLATE_PAGE_SIZE;
  const paged = visible.slice(pageStart, pageStart + TEMPLATE_PAGE_SIZE);
  const sizePacks = BUNDLES.filter((bundle) => bundle.kind === "size");
  const industryPacks = BUNDLES.filter((bundle) => bundle.kind === "industry");

  function setPage(next: number) {
    setPageState({ key: filterKey, page: next });
  }

  function persist(next: string[]) {
    if (!tenantId) return;
    setCartIdsFor(tenantId, next);
  }

  function addIds(ids: readonly string[]) {
    const result = addPackToCart(cart, ids, { skip: skipExisting ? inCatalog : undefined });
    persist(result.cart);
    setNote(
      result.added.length === 0
        ? "Those templates are already in the cart or in this catalog."
        : result.skipped.length
          ? `Added ${result.added.length}. Skipped ${result.skipped.length} already selected or in the catalog.`
          : `Added ${result.added.length} to the cart.`,
    );
    setDrawer(true);
  }

  function addPack(bundle: BlueprintBundle) {
    addIds(bundle.blueprintIds);
  }

  function addEntireStore() {
    addIds(BLUEPRINTS.map((blueprint) => blueprint.id));
    setConfirmAll(false);
  }

  async function checkout() {
    if (!ownerValue) return;
    setBusy(true);
    try {
      await api.checkoutBlueprints({
        blueprintIds: cart,
        status,
        ownerTeam: ownerValue,
        deliveryTeam: delivery || null,
      });
      persist([]);
      setDrawer(false);
      router.push(to("/catalog"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Templates</p>
          <h1>Templates</h1>
          <p className="lede">
            {BLUEPRINTS.length} practitioner-grade security services. Add a pack, one template, or every template in the
            store to the cart, then review every item before it lands in the catalog.
          </p>
        </div>
        <div className="store-head-actions">
          <BlueprintViewToggle
            view={view}
            onChange={(next) => {
              writeBlueprintView(next);
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => setDrawer(true)}>
            <CartIcon />
            Cart · {cart.length}
          </button>
        </div>
      </div>

      <div data-section="browse">
        <div className="toolbar catalog-toolbar">
          <input
            className="input search"
            placeholder="Search templates"
            aria-label="Search templates"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select className="select" aria-label="Bundle filter" value={bundleId} onChange={(event) => setBundleId(event.target.value)}>
            <option value="all">All bundles</option>
            {BUNDLES.map((bundle) => (
              <option key={bundle.id} value={bundle.id}>
                {bundle.title}
              </option>
            ))}
          </select>
        </div>
        <div className="aisle-row" role="tablist" aria-label="Domain aisles">
          <button type="button" role="tab" aria-selected={aisle === "all"} onClick={() => setAisle("all")}>
            All
          </button>
          {AISLES.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={aisle === item.id} onClick={() => setAisle(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div data-section="results" data-view={view}>
        {visible.length > 0 ? (
          <TemplatePager
            pageStart={pageStart}
            pageCount={pageCount}
            currentPage={currentPage}
            total={visible.length}
            onPage={setPage}
          />
        ) : null}
        {view === "list" ? (
          <ul className="blueprint-list">
            {paged.map((blueprint) => (
              <BlueprintListRow
                key={blueprint.id}
                blueprint={blueprint}
                lookups={api.lookups}
                inCart={cart.includes(blueprint.id)}
                owned={inCatalog.has(blueprint.id)}
                onPreview={() => setPreview(blueprint)}
                onToggle={() => persist(toggleCart(cart, blueprint.id))}
              />
            ))}
          </ul>
        ) : (
          <div className="blueprint-grid">
            {paged.map((blueprint) => (
              <BlueprintCard
                key={blueprint.id}
                blueprint={blueprint}
                lookups={api.lookups}
                inCart={cart.includes(blueprint.id)}
                owned={inCatalog.has(blueprint.id)}
                onPreview={() => setPreview(blueprint)}
                onToggle={() => persist(toggleCart(cart, blueprint.id))}
              />
            ))}
          </div>
        )}
        {visible.length === 0 ? (
          <section className="empty">
            <h2>No templates match.</h2>
          </section>
        ) : pageCount > 1 ? (
          <TemplatePager
            pageStart={pageStart}
            pageCount={pageCount}
            currentPage={currentPage}
            total={visible.length}
            onPage={setPage}
          />
        ) : null}
        <div className="store-add-all">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmAll(true)}>
            Add all {BLUEPRINTS.length} to cart
          </button>
        </div>
      </div>

      <section className="pack-shelf" aria-label="Starter packs" data-section="starter-packs">
        <div className="pack-head">
          <h2>Starter packs</h2>
          <label className="check skip-existing">
            <input type="checkbox" checked={skipExisting} onChange={(event) => setSkipExisting(event.target.checked)} />
            {SKIP_EXISTING_LABEL}
          </label>
        </div>
        <p className="micro">Company size</p>
        <div className="pack-grid">
          {sizePacks.map((bundle) => (
            <PackCard key={bundle.id} bundle={bundle} onAdd={() => addPack(bundle)} />
          ))}
        </div>
        <p className="micro">Industry / domain overlays</p>
        <div className="pack-grid">
          {industryPacks.map((bundle) => (
            <PackCard key={bundle.id} bundle={bundle} onAdd={() => addPack(bundle)} />
          ))}
        </div>
        <div className="store-add-all store-add-all-shelf">
          <button type="button" className="btn btn-ghost btn-compact" onClick={() => setConfirmAll(true)}>
            Add all {BLUEPRINTS.length} to cart
          </button>
        </div>
        {note ? <p className="hint">{note}</p> : null}
      </section>

      {cart.length > 0 ? (
        <div className="cart-sticky">
          <span>{cart.length} in the cart</span>
          <button type="button" className="btn btn-primary" onClick={() => setDrawer(true)}>
            Review cart
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPreview(null)}>
          <div className="modal-card preview-card" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className="micro">Preview</p>
            <h2 id="preview-title">{preview.name}</h2>
            <PreviewBody blueprint={preview} lookups={api.lookups} />
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPreview(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  persist(toggleCart(cart, preview.id));
                  setPreview(null);
                }}
              >
                {cart.includes(preview.id) ? "Remove from cart" : "+ Add to Cart"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAll ? (
        <div className="modal-backdrop confirm-layer" role="presentation" onMouseDown={() => setConfirmAll(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-all-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="add-all-title">Add all {BLUEPRINTS.length} to cart</h2>
            <p>
              Add {BLUEPRINTS.length} templates to the cart? This adds the whole store, not only the current page.
              You can remove any of them before checkout.
            </p>
            <p className="hint">
              Templates already in the cart are skipped.
              {skipExisting ? " Templates already in this catalog are skipped too." : ""}
            </p>
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmAll(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={addEntireStore}>
                Add all
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {drawer ? (
        <div className="overlay" role="presentation" onMouseDown={() => setDrawer(false)}>
          <aside className="drawer cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart" onMouseDown={(event) => event.stopPropagation()}>
            <p className="micro">Cart</p>
            <div className="cart-heading">
              <h2>Cart · {cart.length}</h2>
              {cart.length > 0 ? (
                <button type="button" className="text-link" onClick={() => persist([])}>
                  Clear cart
                </button>
              ) : null}
            </div>
            {cart.length === 0 ? <p className="lede">The cart is empty. Add a pack or a template first.</p> : null}
            <ul className="cart-list">
              {cart.map((id) => {
                const blueprint = blueprintById(id);
                if (!blueprint) return null;
                return (
                  <li key={id}>
                    <div>
                      <strong>{blueprint.name}</strong>
                      <div className="micro">{optionLabel(api.lookups, "category", blueprint.category)}</div>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => persist(toggleCart(cart, id))}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
            <label className="field-label" htmlFor="cart-status">Initial status</label>
            <select id="cart-status" className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((item) => (
                <option key={item.id} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="cart-owner">Default owner team</label>
            <select id="cart-owner" className="select" value={ownerValue} onChange={(event) => setOwner(event.target.value)}>
              <option value="">Choose a team</option>
              {teams.map((item) => (
                <option key={item.id} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="cart-delivery">Default delivery team</label>
            <select id="cart-delivery" className="select" value={delivery} onChange={(event) => setDelivery(event.target.value)}>
              <option value="">Use each template&apos;s suggestion</option>
              {teams.map((item) => (
                <option key={item.id} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="hint">Company-specific fields stay blank: internal name, support contact, tooling, providers, and internal notes.</p>
            <button type="button" className="btn btn-primary" disabled={busy || cart.length === 0 || !ownerValue || !api.canWrite} onClick={() => void checkout()}>
              {busy ? "Adding…" : `Add ${cart.length} Service${cart.length === 1 ? "" : "s"} to Catalog`}
            </button>
            {api.canWrite ? null : <p className="hint">You need edit access to add services.</p>}
          </aside>
        </div>
      ) : null}
    </>
  );
}

function TemplatePager({
  pageStart,
  pageCount,
  currentPage,
  total,
  onPage,
}: {
  pageStart: number;
  pageCount: number;
  currentPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const end = Math.min(pageStart + TEMPLATE_PAGE_SIZE, total);
  return (
    <div className="store-pager">
      <p className="micro" aria-live="polite">
        {pageCount > 1 ? `Showing ${pageStart + 1}–${end} of ${total}` : `${total} template${total === 1 ? "" : "s"}`}
      </p>
      {pageCount > 1 ? (
        <div className="aisle-row store-pages" role="navigation" aria-label="Template pages">
          <button type="button" disabled={currentPage === 1} onClick={() => onPage(currentPage - 1)}>
            Previous
          </button>
          {Array.from({ length: pageCount }, (_, index) => {
            const number = index + 1;
            return (
              <button
                key={number}
                type="button"
                aria-current={number === currentPage ? "page" : undefined}
                onClick={() => onPage(number)}
              >
                {number}
              </button>
            );
          })}
          <button type="button" disabled={currentPage === pageCount} onClick={() => onPage(currentPage + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BlueprintViewToggle({ view, onChange }: { view: BlueprintView; onChange: (view: BlueprintView) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = cycleBlueprintView(view, event.key);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    const target = event.currentTarget.querySelector<HTMLButtonElement>(`button[data-view="${next}"]`);
    target?.focus();
  }

  return (
    <div className="segmented" role="radiogroup" aria-label="Template layout" aria-orientation="horizontal" onKeyDown={onKeyDown}>
      <button
        type="button"
        role="radio"
        data-view="cards"
        aria-checked={view === "cards"}
        tabIndex={view === "cards" ? 0 : -1}
        onClick={() => onChange("cards")}
      >
        Cards
      </button>
      <button
        type="button"
        role="radio"
        data-view="list"
        aria-checked={view === "list"}
        tabIndex={view === "list" ? 0 : -1}
        onClick={() => onChange("list")}
      >
        List
      </button>
    </div>
  );
}

function AlreadyInCatalog({ owned }: { owned: boolean }) {
  if (!owned) return null;
  return <p className="already">{ALREADY_IN_CATALOG_LABEL}</p>;
}

function BlueprintActions({
  inCart,
  onPreview,
  onToggle,
}: {
  inCart: boolean;
  onPreview: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="row-actions">
      <button type="button" className="btn btn-secondary" onClick={onPreview}>
        Preview
      </button>
      <button type="button" className={inCart ? "btn btn-secondary" : "btn btn-primary"} aria-pressed={inCart} onClick={onToggle}>
        {inCart ? "✓ In Cart" : "+ Add to Cart"}
      </button>
    </div>
  );
}

function BlueprintCard({
  blueprint,
  lookups,
  inCart,
  owned,
  onPreview,
  onToggle,
}: {
  blueprint: Blueprint;
  lookups: import("@/lib/catalog/types").LookupOption[];
  inCart: boolean;
  owned: boolean;
  onPreview: () => void;
  onToggle: () => void;
}) {
  return (
    <article className="blueprint-card">
      <div className="blueprint-meta">
        <span className="micro">{optionLabel(lookups, "category", blueprint.category)}</span>
        <Badge tone="neutral">{shortTier(optionLabel(lookups, "service_tier", blueprint.service_tier))}</Badge>
        <Badge tone="info">{CSF_SHORT[blueprint.primary_csf_function] ?? blueprint.primary_csf_function}</Badge>
      </div>
      <h3>{blueprint.name}</h3>
      <p>{blueprint.summary}</p>
      <AlreadyInCatalog owned={owned} />
      <BlueprintActions inCart={inCart} onPreview={onPreview} onToggle={onToggle} />
    </article>
  );
}

function BlueprintListRow({
  blueprint,
  lookups,
  inCart,
  owned,
  onPreview,
  onToggle,
}: {
  blueprint: Blueprint;
  lookups: import("@/lib/catalog/types").LookupOption[];
  inCart: boolean;
  owned: boolean;
  onPreview: () => void;
  onToggle: () => void;
}) {
  const category = optionLabel(lookups, "category", blueprint.category);
  const tier = shortTier(optionLabel(lookups, "service_tier", blueprint.service_tier));
  const csf = CSF_SHORT[blueprint.primary_csf_function] ?? blueprint.primary_csf_function;
  return (
    <li className="blueprint-row">
      <div className="blueprint-row-main">
        <h3>{blueprint.name}</h3>
        <div className="blueprint-row-tags">
          <span className="micro">{category}</span>
          <Badge tone="neutral">{tier}</Badge>
          <Badge tone="info">{csf}</Badge>
          <AlreadyInCatalog owned={owned} />
        </div>
      </div>
      <p className="blueprint-row-summary" title={blueprint.summary}>
        {blueprint.summary}
      </p>
      <BlueprintActions inCart={inCart} onPreview={onPreview} onToggle={onToggle} />
    </li>
  );
}

function PackCard({ bundle, onAdd }: { bundle: BlueprintBundle; onAdd: () => void }) {
  return (
    <article className="pack-card">
      <p className="micro">{bundle.kind === "size" ? "Company size" : "Industry"}</p>
      <h3>{bundle.title}</h3>
      <p className="hint">{bundle.audience}</p>
      <p>{bundle.summary}</p>
      <button type="button" className="btn btn-secondary" onClick={onAdd}>
        Add Pack to Cart · {bundle.blueprintIds.length}
      </button>
    </article>
  );
}

function PreviewBody({
  blueprint,
  lookups,
}: {
  blueprint: Blueprint;
  lookups: import("@/lib/catalog/types").LookupOption[];
}) {
  const groups = ([1, 2, 3] as const).map((level) => ({
    level,
    title: level === 1 ? "Core" : level === 2 ? "Operations" : "Governance",
    fields: STARTER_FIELDS.filter((field) => field.depth_level === level),
  }));
  return (
    <div className="preview-body">
      {groups.map((group) => (
        <section key={group.level}>
          <h3>{group.title}</h3>
          {group.fields.map((field) => {
            const value = previewValue(blueprint, field.field_key, lookups);
            if (!value) return null;
            return (
              <div className="preview-row" key={field.field_key}>
                <span className="micro">{field.label}</span>
                <p>{value}</p>
              </div>
            );
          })}
          {group.level === 2 ? (
            <div className="preview-row">
              <span className="micro">Escalation path</span>
              <p>{blueprint.escalation_path}</p>
            </div>
          ) : null}
        </section>
      ))}
      <ArtifactHints blueprintId={blueprint.id} lookups={lookups} />
      <section>
        <h3>Suggested NIST CSF 2.0 subcategories</h3>
        <p>{blueprint.nist_csf.join(", ")}</p>
        <p className="hint">Hints only. Checkout stores them on the service and does not count them as coverage until someone saves an assessment.</p>
      </section>
    </div>
  );
}

function ArtifactHints({
  blueprintId,
  lookups,
}: {
  blueprintId: string;
  lookups: import("@/lib/catalog/types").LookupOption[];
}) {
  const hints = hintsForBlueprint(blueprintId);
  if (hints.length === 0) return null;
  return (
    <section>
      <h3>Typical supporting artifacts</h3>
      {hints.map((hint) => (
        <div className="preview-row" key={`${hint.artifact_type}-${hint.name}`}>
          <span className="micro">{optionLabel(lookups, "artifact_type", hint.artifact_type) || hint.artifact_type}</span>
          <p>
            {hint.name}. {hint.note}
          </p>
        </div>
      ))}
      <p className="hint">Hints only. Adding this template does not create these documents.</p>
    </section>
  );
}

function previewValue(
  blueprint: Blueprint,
  fieldKey: string,
  lookups: import("@/lib/catalog/types").LookupOption[],
): string {
  switch (fieldKey) {
    case "name":
      return blueprint.name;
    case "category":
      return optionLabel(lookups, "category", blueprint.category);
    case "service_tier":
      return optionLabel(lookups, "service_tier", blueprint.service_tier);
    case "summary":
      return blueprint.summary;
    case "in_scope":
      return blueprint.in_scope;
    case "description":
      return blueprint.description;
    case "deliverables":
      return blueprint.deliverables;
    case "out_of_scope":
      return blueprint.out_of_scope;
    case "prerequisites":
      return blueprint.prerequisites;
    case "target_audience":
      return blueprint.target_audience.map((code) => optionLabel(lookups, "target_audience", code)).join(", ");
    case "intake_method":
      return blueprint.intake_method.map((code) => optionLabel(lookups, "intake_method", code)).join(", ");
    case "approval_required":
      return blueprint.approval_required ? "Yes" : "No";
    case "approver":
      return blueprint.approver ?? "";
    case "lead_time":
      return blueprint.lead_time;
    case "hours_of_coverage":
      return optionLabel(lookups, "hours_of_coverage", blueprint.hours_of_coverage);
    case "sla_response_target":
      return blueprint.sla_response_target;
    case "sla_resolution_target":
      return blueprint.sla_resolution_target;
    case "primary_csf_function":
      return optionLabel(lookups, "primary_csf_function", blueprint.primary_csf_function);
    case "delivery_model":
      return optionLabel(lookups, "delivery_model", blueprint.delivery_model);
    case "delivery_team":
      return `Suggested: ${optionLabel(lookups, "team", blueprint.suggested_delivery_team)}`;
    case "owner_team":
      return `Suggested: ${optionLabel(lookups, "team", blueprint.suggested_owner_team)}. Checkout applies the cart default.`;
    case "threats_addressed":
      return blueprint.threats_addressed;
    case "data_classification_handled":
      return optionLabel(lookups, "data_classification", blueprint.data_classification_handled);
    case "kpis_and_metrics":
      return blueprint.kpis_and_metrics;
    case "review_cadence":
      return optionLabel(lookups, "review_cadence", blueprint.review_cadence);
    case "internal_name":
    case "support_contact":
    case "current_tooling_notes":
    case "third_party_providers":
    case "internal_notes":
      return "Left blank — add your organization’s detail after checkout.";
    default:
      return "";
  }
}
