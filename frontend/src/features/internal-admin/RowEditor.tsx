import { useState } from "react";
import { Column, Row, Table, keyOf, request, title } from "./api";
import { parseJson, stringifyJson } from "./json";
const labels: Record<string, Record<string, string>> = {
  "memberships.role": { 0: "Owner", 1: "Member" },
  "memberships.status": {
    0: "Disabled",
    1: "Active",
    2: "Invited",
    3: "Requested",
  },
  "user_lifecycle_challenges.purpose": {
    0: "Signup",
    1: "Password Reset",
    2: "My Account Unlock",
  },
};
type Field = {
  mode: "value" | "now" | "null" | "omit";
  text: string;
  bool: boolean;
};
function initial(c: Column, row?: Row): Field {
  const v = row?.[c.name];
  return {
    mode: row
      ? v === null && c.type !== "jsonb"
        ? "null"
        : "value"
      : c.default || c.nullable
        ? "omit"
        : "value",
    text:
      v === undefined
        ? ""
        : c.type === "jsonb"
          ? stringifyJson(v, true)
          : v === null
            ? ""
            : String(v),
    bool: v === true,
  };
}
export default function RowEditor({
  table,
  row,
  defaults = {},
  onClose,
  onSaved,
}: {
  table: Table;
  row?: Row;
  defaults?: Row;
  onClose: () => void;
  onSaved: (row: Row) => void;
}) {
  const [fields, setFields] = useState<Record<string, Field>>(() =>
    Object.fromEntries(
      table.columns.map((c) => [
        c.name,
        c.name in defaults ? initial(c, defaults) : initial(c, row),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (name: string, change: Partial<Field>) =>
    setFields((old) => ({ ...old, [name]: { ...old[name], ...change } }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    try {
      const values: Row = {};
      const serverNow: string[] = [];
      for (const c of table.columns) {
        if (c.identity || (row && !c.mutable)) continue;
        const field = fields[c.name];
        if (field.mode === "omit") continue;
        if (field.mode === "now") {
          serverNow.push(c.name);
          continue;
        }
        if (field.mode === "null") {
          values[c.name] = null;
          continue;
        }
        let v: unknown = field.text;
        if (c.type === "jsonb") {
          try {
            v = parseJson(field.text);
          } catch (e) {
            throw Error(`${c.name}: ${(e as Error).message}`);
          }
        }
        if (c.type === "boolean") v = field.bool;
        if (["integer", "smallint"].includes(c.type)) {
          if (!/^-?\d+$/.test(field.text))
            throw Error(`${c.name}: enter an integer`);
          v = Number(field.text);
          const limit = c.type === "smallint" ? 32768 : 2147483648;
          if (
            !Number.isInteger(v) ||
            (v as number) < -limit ||
            (v as number) >= limit
          )
            throw Error(`${c.name}: integer out of range`);
        }
        if (c.type === "bigint" && !/^(0|-?[1-9]\d*)$/.test(field.text))
          throw Error(`${c.name}: enter a decimal integer`);
        if (row && stringifyJson(v) === stringifyJson(row[c.name])) continue;
        values[c.name] = v;
      }
      if (!Object.keys(values).length && !serverNow.length)
        throw Error("No changed fields to update");
      setBusy(true);
      const saved = await request<Row>(
        `/tables/${table.name}/${row ? "row" : "rows"}`,
        row ? "PUT" : "POST",
        row
          ? { key: keyOf(table, row), changes: values, server_now: serverNow }
          : { values, server_now: serverNow },
      );
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const snapshot = table.name.endsWith("snapshots");
  return (
    <section
      className="admin-editor"
      aria-label={`${row ? "Update" : "Create"} ${title(table.name)}`}
    >
      <h2>
        {row ? "Update" : "Create"} {title(table.name)}
      </h2>
      {table.name === "users" && (
        <p className="admin-note">
          password_hash is a raw hash, never plaintext. Increase session_version
          to revoke existing sessions. Changing your own status or version will
          require signing in again.
        </p>
      )}
      {snapshot && (
        <p className="admin-note">
          Raw JSON is permitted. Authenticated Dashboards use a transient zero
          snapshot when the stored payload is unusable; the stored JSON is
          preserved.
        </p>
      )}
      <form onSubmit={save}>
        <div className="admin-fields">
          {table.columns.map((c) => {
            const field = fields[c.name];
            const readonly = c.identity || (!!row && !c.mutable);
            return (
              <div className="admin-field" key={c.name}>
                <label htmlFor={`field-${c.name}`}>
                  {c.name}{" "}
                  <small>
                    {c.type}
                    {c.nullable ? " · nullable" : ""}
                  </small>
                </label>
                {readonly ? (
                  <output id={`field-${c.name}`}>
                    {row ? String(row[c.name]) : "Generated by PostgreSQL"}
                  </output>
                ) : (
                  <>
                    <select
                      aria-label={`${c.name} value mode`}
                      value={field.mode}
                      disabled={busy}
                      onChange={(e) =>
                        update(c.name, {
                          mode: e.target.value as Field["mode"],
                        })
                      }
                    >
                      <option value="value">Value</option>
                      {c.type === "timestamptz" && (
                        <option value="now">Now</option>
                      )}
                      {c.nullable && c.type !== "jsonb" && (
                        <option value="null">SQL NULL</option>
                      )}
                      {(row || c.default || c.nullable) && (
                        <option value="omit">
                          {row
                            ? "Leave unchanged"
                            : "Use database default / omit"}
                        </option>
                      )}
                    </select>
                    {field.mode === "now" && (
                      <small>Server UTC time will be set when saved.</small>
                    )}
                    {field.mode === "value" &&
                      (c.type === "boolean" ? (
                        <input
                          id={`field-${c.name}`}
                          type="checkbox"
                          checked={field.bool}
                          disabled={busy}
                          onChange={(e) =>
                            update(c.name, { bool: e.target.checked })
                          }
                        />
                      ) : c.enum.length ? (
                        <select
                          id={`field-${c.name}`}
                          value={field.text}
                          disabled={busy}
                          onChange={(e) =>
                            update(c.name, { text: e.target.value })
                          }
                        >
                          <option value="" disabled>
                            Select value
                          </option>
                          {c.enum.map((v) => (
                            <option key={v} value={v}>
                              {v}
                              {labels[`${table.name}.${c.name}`]?.[v]
                                ? ` — ${labels[`${table.name}.${c.name}`][v]}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      ) : c.type === "jsonb" ? (
                        <textarea
                          id={`field-${c.name}`}
                          value={field.text}
                          spellCheck={false}
                          rows={9}
                          disabled={busy}
                          onChange={(e) =>
                            update(c.name, { text: e.target.value })
                          }
                        />
                      ) : (
                        <input
                          id={`field-${c.name}`}
                          value={field.text}
                          disabled={busy}
                          placeholder={
                            c.type === "timestamptz"
                              ? "2026-10-08T12:00:00.000000Z"
                              : c.type === "bytea"
                                ? "\\x0123abcd"
                                : ""
                          }
                          onChange={(e) =>
                            update(c.name, { text: e.target.value })
                          }
                        />
                      ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="admin-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="admin-primary" disabled={busy}>
            {busy ? "Saving…" : row ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </section>
  );
}
