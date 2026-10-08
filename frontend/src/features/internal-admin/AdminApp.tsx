import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AdminFailure,
  Page,
  Row,
  Table,
  request,
  rowQuery,
  title,
} from "./api";
import { stringifyJson } from "./json";
import RowEditor from "./RowEditor";
import "./Admin.css";
type Context = {
  organisation: Row;
  snapshot_exists: boolean;
  sites: Array<{
    id: string;
    name: string;
    enabled: boolean;
    max_capacity: number;
    snapshot_exists: boolean;
    device_count: string;
    gateway_id: string | null;
  }>;
  memberships: Row[];
  next_cursor: string | null;
  next_membership_cursor: string | null;
};
export default function AdminApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [checked, setChecked] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [selected, setSelected] = useState("organisations");
  const [data, setData] = useState<Page | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Array<string | null>>([]);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<{
    table: Table;
    row?: Row;
    defaults?: Row;
  } | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [contextId, setContextId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const generation = useRef(0);
  const fail = useCallback(
    (e: unknown) => {
      setError((e as Error).message);
      if (e instanceof AdminFailure && e.status === 401) {
        setUser(null);
        navigate("/admin/login", { replace: true });
      }
    },
    [navigate],
  );
  useEffect(() => {
    let live = true;
    request<{
      user: {
        id: string;
        username: string;
      };
    }>("/me")
      .then((v) => {
        if (live) setUser(v.user);
      })
      .catch((e) => {
        if (live && (!(e instanceof AdminFailure) || e.status !== 401))
          setError((e as Error).message);
      })
      .finally(() => {
        if (live) setChecked(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!checked) return;
    if (!user && location.pathname !== "/admin/login")
      navigate("/admin/login", { replace: true });
    if (user && location.pathname === "/admin/login")
      navigate("/admin", { replace: true });
  }, [checked, user, location.pathname, navigate]);
  useEffect(() => {
    if (user)
      request<{
        tables: Table[];
      }>("/tables")
        .then((v) => setTables(v.tables))
        .catch(fail);
  }, [user, fail]);
  useEffect(() => {
    if (!user || !tables.length || context) return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    const q = new URLSearchParams(filter);
    if (cursor) q.set("cursor", cursor);
    request<Page>(
      `/tables/${selected}/rows?${q}`,
      "GET",
      undefined,
      abort.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!abort.signal.aborted) fail(e);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [user, tables, selected, cursor, filter, revision, context, fail]);
  const select = (name: string, filters: Record<string, string> = {}) => {
    generation.current++;
    setSelected(name);
    setCursor(null);
    setPrevious([]);
    setFilter(filters);
    setFilterDraft(filters);
    setEditor(null);
    setContext(null);
    setMessage("");
    setError("");
  };
  const open = async (name: string, key: Row, create = false) => {
    const t = tables.find((t) => t.name === name)!;
    generation.current++;
    if (create) {
      setEditor({ table: t, defaults: key });
      return;
    }
    const current = ++generation.current;
    try {
      const row = await request<Row>(`/tables/${name}/row?${rowQuery(t, key)}`);
      if (generation.current === current) setEditor({ table: t, row });
    } catch (e) {
      fail(e);
    }
  };
  const loadContext = async (
    id: string,
    next?: string | null,
    members?: string | null,
  ) => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (next) q.set("cursor", next);
      if (members) q.set("membership_cursor", members);
      const value = await request<Context>(
        `/organisations/${encodeURIComponent(id)}/context?${q}`,
      );
      if (generation.current === current) {
        setContext(value);
        setEditor(null);
        setContextId(id);
      }
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  };
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setError("");
    try {
      const v = await request<{
        user: {
          id: string;
          username: string;
        };
      }>("/login", "POST", { username, password });
      setPassword("");
      setUser(v.user);
      navigate("/admin", { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setPassword("");
    } finally {
      setLoginBusy(false);
    }
  };
  if (!checked)
    return (
      <main className="admin-app">
        <p role="status">Checking Admin session…</p>
      </main>
    );
  if (!user)
    return (
      <main className="admin-app admin-login">
        <h1>camOS Admin</h1>
        <p>Internal PostgreSQL administration</p>
        <form onSubmit={login}>
          <label htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loginBusy}
          />
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loginBusy}
          />
          {error && <p role="alert">{error}</p>}
          <button className="admin-primary" disabled={loginBusy}>
            {loginBusy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    );
  const table = tables.find((t) => t.name === selected);
  const cell = (value: unknown) =>
    value === null
      ? "NULL"
      : typeof value === "object"
        ? stringifyJson(value)
        : String(value);
  return (
    <div className="admin-app">
      <header>
        <h1>camOS Admin</h1>
        <span>{user.username}</span>
        <button
          onClick={async () => {
            try {
              await request("/logout", "POST", {});
              setUser(null);
              setTables([]);
              setData(null);
              setContext(null);
              setEditor(null);
              navigate("/admin/login", { replace: true });
            } catch (e) {
              fail(e);
            }
          }}
        >
          Logout
        </button>
      </header>
      <div className="admin-layout">
        <nav aria-label="Admin tables">
          {tables.map((t) => (
            <button
              key={t.name}
              aria-current={
                selected === t.name && !context ? "page" : undefined
              }
              onClick={() => select(t.name)}
            >
              {title(t.name)}
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadContext(contextId);
            }}
          >
            <label htmlFor="admin-context">Organisation context ID</label>
            <input
              id="admin-context"
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
              required
            />
            <button disabled={loading}>Open context</button>
          </form>
        </nav>
        <main>
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          {loading && <p role="status">Loading…</p>}
          {editor ? (
            <RowEditor
              key={`${editor.table.name}:${editor.row ? rowQuery(editor.table, editor.row) : stringifyJson(editor.defaults ?? {})}`}
              {...editor}
              onClose={() => setEditor(null)}
              onSaved={(saved) => {
                setEditor(null);
                setMessage("Row saved.");
                setRevision((n) => n + 1);
                if (context) void loadContext(String(context.organisation.id));
                if (editor.table.name === "users" && saved.id === user.id)
                  void request<{
                    user: typeof user;
                  }>("/me")
                    .then((v) => setUser(v.user))
                    .catch(fail);
              }}
            />
          ) : context ? (
            <>
              <h2>{String(context.organisation.name)} — context</h2>
              <div className="admin-actions">
                <button
                  onClick={() =>
                    void loadContext(String(context.organisation.id))
                  }
                >
                  Refresh context
                </button>
                <button
                  onClick={() =>
                    void open("organisations", context.organisation)
                  }
                >
                  Edit Organisation
                </button>
                <button
                  onClick={() =>
                    open(
                      "sites",
                      { organisation_id: context.organisation.id },
                      true,
                    )
                  }
                >
                  + Site
                </button>
              </div>
              <p>
                Organisation snapshot:{" "}
                <strong>
                  {context.snapshot_exists ? "EXISTS" : "MISSING"}
                </strong>{" "}
                <button
                  onClick={() =>
                    void open(
                      "organisation_snapshots",
                      { organisation_id: context.organisation.id },
                      !context.snapshot_exists,
                    )
                  }
                >
                  {context.snapshot_exists
                    ? "Edit Snapshot"
                    : "+ Create Snapshot"}
                </button>
              </p>
              <h3>Memberships</h3>
              {context.memberships.map((m) => (
                <button
                  key={String(m.user_id)}
                  onClick={() => void open("memberships", m)}
                >
                  User {String(m.user_id)} · role {String(m.role)} · status{" "}
                  {String(m.status)}
                </button>
              ))}
              {!context.memberships.length && <p>No memberships</p>}
              {context.next_membership_cursor && (
                <button
                  onClick={() =>
                    void loadContext(
                      String(context.organisation.id),
                      null,
                      context.next_membership_cursor,
                    )
                  }
                >
                  Next memberships
                </button>
              )}
              <h3>Sites</h3>
              {context.sites.map((s) => (
                <section className="admin-site" key={s.id}>
                  <h4>
                    {s.name} · {s.id}
                  </h4>
                  <div className="admin-actions">
                    <button onClick={() => void open("sites", { id: s.id })}>
                      Edit Site
                    </button>
                    <button
                      onClick={() => select("devices", { site_id: s.id })}
                    >
                      Devices ({s.device_count})
                    </button>
                    <button
                      onClick={() =>
                        void open("devices", { site_id: s.id }, true)
                      }
                    >
                      + Device
                    </button>
                    {s.gateway_id ? (
                      <button
                        onClick={() =>
                          void open("gateways", { gateway_id: s.gateway_id })
                        }
                      >
                        Edit Gateway
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          void open("gateways", { site_id: s.id }, true)
                        }
                      >
                        + Gateway
                      </button>
                    )}
                  </div>
                  <p>
                    Site snapshot:{" "}
                    <strong>{s.snapshot_exists ? "EXISTS" : "MISSING"}</strong>{" "}
                    <button
                      onClick={() =>
                        void open(
                          "site_snapshots",
                          { site_id: s.id },
                          !s.snapshot_exists,
                        )
                      }
                    >
                      {s.snapshot_exists
                        ? "Edit Site Snapshot"
                        : "+ Create Site Snapshot"}
                    </button>
                  </p>
                </section>
              ))}
              {!context.sites.length && <p>No sites</p>}
              {context.next_cursor && (
                <button
                  onClick={() =>
                    void loadContext(
                      String(context.organisation.id),
                      context.next_cursor,
                    )
                  }
                >
                  Next sites
                </button>
              )}
            </>
          ) : (
            table && (
              <>
                <h2>{title(table.name)}</h2>
                <div className="admin-actions">
                  <button
                    className="admin-primary"
                    onClick={() => setEditor({ table })}
                  >
                    + Add Row
                  </button>
                  <button onClick={() => setRevision((n) => n + 1)}>
                    Refresh
                  </button>
                  {["organisations", "sites", "devices", "gateways"]
                    .filter((n) => n !== table.name)
                    .map((n) => (
                      <button
                        key={n}
                        onClick={() => {
                          const t = tables.find((t) => t.name === n)!;
                          setEditor({ table: t });
                        }}
                      >
                        + {title(n).replace(/s$/, "")}
                      </button>
                    ))}
                </div>
                {!!table.filters.length && (
                  <form
                    className="admin-actions"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setFilter(
                        Object.fromEntries(
                          Object.entries(filterDraft).filter(
                            ([, v]) => v !== "",
                          ),
                        ),
                      );
                      setCursor(null);
                      setPrevious([]);
                    }}
                  >
                    {table.filters.map((n) => (
                      <label key={n}>
                        {n}
                        <input
                          value={filterDraft[n] ?? ""}
                          onChange={(e) =>
                            setFilterDraft((old) => ({
                              ...old,
                              [n]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                    <button>Apply filters</button>
                  </form>
                )}
                {data && (
                  <>
                    <div className="admin-grid">
                      <table>
                        <thead>
                          <tr>
                            <th>Actions</th>
                            {table.columns.map((c) => (
                              <th key={c.name}>
                                {c.name}
                                <small>{c.type}</small>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((r) => (
                            <tr key={rowQuery(table, r)}>
                              <td>
                                <button
                                  onClick={() => void open(table.name, r)}
                                >
                                  Edit
                                </button>
                                {table.name === "organisations" && (
                                  <button
                                    onClick={() =>
                                      void loadContext(String(r.id))
                                    }
                                  >
                                    Context
                                  </button>
                                )}
                              </td>
                              {table.columns.map((c) => (
                                <td key={c.name} title={cell(r[c.name])}>
                                  {c.name.includes("password") ||
                                  c.name === "code_hash" ||
                                  c.name === "commission_hash"
                                    ? "Open editor to inspect"
                                    : cell(r[c.name])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!data.items.length && <p>No rows</p>}
                    <div className="admin-actions">
                      <button
                        disabled={!previous.length}
                        onClick={() => {
                          setCursor(previous[previous.length - 1]);
                          setPrevious((old) => old.slice(0, -1));
                        }}
                      >
                        Previous
                      </button>
                      <button
                        disabled={!data.next_cursor}
                        onClick={() => {
                          setPrevious((old) => [...old, cursor]);
                          setCursor(data.next_cursor);
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}
              </>
            )
          )}
        </main>
      </div>
    </div>
  );
}
