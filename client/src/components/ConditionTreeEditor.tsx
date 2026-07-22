import { ConditionNode, LeafCondition } from "@/services/conditionEval";

const INDICATORS: { value: LeafCondition["indicator"]; label: string }[] = [
  { value: "digit_over", label: "Digit OVER" },
  { value: "digit_under", label: "Digit UNDER" },
  { value: "digit_even", label: "Digit EVEN" },
  { value: "digit_odd", label: "Digit ODD" },
  { value: "parity", label: "Parity (0=even,1=odd)" },
  { value: "last_digit", label: "Last digit op" },
  { value: "consecutive_rise", label: "Consecutive RISE" },
  { value: "consecutive_fall", label: "Consecutive FALL" },
  { value: "loss_streak", label: "Loss streak >= N" },
];

const COMPARISONS: { value: NonNullable<LeafCondition["comparison"]>; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "greater_than", label: ">" },
  { value: "less_than", label: "<" },
  { value: "appears", label: "appears >= count (in last 20)" },
  { value: "appears_consecutively", label: "appears consecutively" },
];

function newLeaf(): LeafCondition {
  return { indicator: "digit_over", comparison: "appears", count: 3, barrier: 5 };
}

function LeafEditor({ leaf, onChange, onRemove }: { leaf: LeafCondition; onChange: (l: LeafCondition) => void; onRemove?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-[var(--bg)] border border-[var(--border)] rounded p-2">
      <select
        value={leaf.indicator}
        onChange={(e) => onChange({ ...leaf, indicator: e.target.value as LeafCondition["indicator"] })}
        className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white"
      >
        {INDICATORS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>

      {leaf.indicator === "last_digit" || leaf.indicator === "parity" ? (
        <select
          value={leaf.comparison}
          onChange={(e) => onChange({ ...leaf, comparison: e.target.value as LeafCondition["comparison"] })}
          className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white"
        >
          {COMPARISONS.filter((c) => c.value !== "appears" && c.value !== "appears_consecutively").map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      ) : null}

      {leaf.indicator !== "consecutive_rise" && leaf.indicator !== "consecutive_fall" && leaf.indicator !== "loss_streak" ? (
        <span className="text-xs text-[var(--text-secondary)]">count</span>
      ) : null}
      {leaf.indicator !== "consecutive_rise" && leaf.indicator !== "consecutive_fall" && leaf.indicator !== "loss_streak" ? (
        <input
          type="number" min={1} max={50}
          value={leaf.count ?? 1}
          onChange={(e) => onChange({ ...leaf, count: parseInt(e.target.value) || 1 })}
          className="w-16 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white"
        />
      ) : null}

      {leaf.indicator === "digit_over" || leaf.indicator === "digit_under" || leaf.indicator === "last_digit" || leaf.indicator === "parity" ? (
        <>
          <span className="text-xs text-[var(--text-secondary)]">barrier</span>
          <input
            type="number" min={0} max={9}
            value={leaf.barrier ?? 5}
            onChange={(e) => onChange({ ...leaf, barrier: parseInt(e.target.value) || 0 })}
            className="w-16 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white"
          />
        </>
      ) : null}

      {leaf.indicator === "loss_streak" ? (
        <>
          <span className="text-xs text-[var(--text-secondary)]">streak &gt;=</span>
          <input
            type="number" min={1} max={20}
            value={leaf.barrier ?? 1}
            onChange={(e) => onChange({ ...leaf, barrier: parseInt(e.target.value) || 1 })}
            className="w-16 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white"
          />
        </>
      ) : null}

      {onRemove && (
        <button onClick={onRemove} className="ml-auto text-xs text-[var(--red)] hover:text-[var(--red)]">Remove</button>
      )}
    </div>
  );
}

export default function ConditionTreeEditor({ value, onChange }: { value: ConditionNode; onChange: (n: ConditionNode) => void }) {
  const isGroup = "all" in value || "any" in value || "not" in value;

  const updateLeaf = (leaf: LeafCondition) => onChange(leaf);
  const addChild = (node: ConditionNode) => {
    if ("all" in value) onChange({ all: [...value.all, node] });
    else if ("any" in value) onChange({ any: [...value.any, node] });
    else if ("not" in value) onChange({ not: node });
    else onChange({ all: [value as LeafCondition, node] });
  };
  const updateChild = (idx: number, node: ConditionNode) => {
    if ("all" in value) { const a = [...value.all]; a[idx] = node; onChange({ all: a }); }
    else if ("any" in value) { const a = [...value.any]; a[idx] = node; onChange({ any: a }); }
    else if ("not" in value) onChange({ not: node });
  };
  const removeChild = (idx: number) => {
    if ("all" in value) onChange({ all: value.all.filter((_, i) => i !== idx) });
    else if ("any" in value) onChange({ any: value.any.filter((_, i) => i !== idx) });
  };

  return (
    <div className="border border-[var(--amber-hover)]/40 rounded p-3 bg-[var(--card)]">
      {isGroup && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-[var(--amber-hover)] uppercase">
            {("all" in value) ? "ALL of:" : ("any" in value) ? "ANY of:" : "NOT:"}
          </span>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => addChild(newLeaf())} className="text-xs px-2 py-1 rounded bg-[var(--amber-soft)] text-[var(--amber-hover)] hover:bg-[var(--amber-soft)]">+ Condition</button>
            {!("not" in value) && (
              <>
                <button onClick={() => onChange({ all: "all" in value ? [...value.all] : "any" in value ? value.any : [value as LeafCondition] })} className="text-xs px-2 py-1 rounded bg-[var(--amber-soft)] text-[var(--amber)] hover:bg-[var(--amber-soft)]">AND group</button>
                <button onClick={() => onChange({ any: "any" in value ? [...value.any] : "all" in value ? value.all : [value as LeafCondition] })} className="text-xs px-2 py-1 rounded bg-[var(--amber-soft)] text-[var(--amber)] hover:bg-[var(--amber-soft)]">OR group</button>
                <button onClick={() => onChange({ not: value as ConditionNode })} className="text-xs px-2 py-1 rounded bg-[var(--amber-soft)] text-[var(--amber)] hover:bg-[var(--amber-soft)]">NOT</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {"all" in value && value.all.map((c, i) => (
          <ConditionTreeEditor key={i} value={c} onChange={(n) => updateChild(i, n)} />
        ))}
        {"any" in value && value.any.map((c, i) => (
          <ConditionTreeEditor key={i} value={c} onChange={(n) => updateChild(i, n)} />
        ))}
        {"not" in value && (
          <ConditionTreeEditor value={value.not} onChange={(n) => onChange({ not: n })} />
        )}
        {!isGroup && (
          <LeafEditor leaf={value as LeafCondition} onChange={updateLeaf} onRemove={undefined} />
        )}
      </div>

      {isGroup && "all" in value && value.all.length === 0 && (
        <p className="text-[10px] text-[var(--text-muted)] mt-1">Add at least one condition, or switch back to simple mode.</p>
      )}
    </div>
  );
}