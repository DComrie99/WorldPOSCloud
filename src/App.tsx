import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./supabase";
import type { Profile, Site, StaffMember, Terminal, View } from "./types";

const nav: { id: View; label: string; hint: string; mark: string }[] = [
  { id: "dashboard", label: "Dashboard", hint: "Overview", mark: "D" },
  { id: "staff", label: "Staff Setup", hint: "People & access", mark: "S" },
  { id: "terminals", label: "Terminal Setup", hint: "Point of sale", mark: "T" },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (checking) return <Loading label="Opening WorldPOS Cloud" />;
  if (!session) return <Login />;
  return <Workspace session={session} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    if (!isConfigured) { setError("Supabase public configuration has not been added yet."); setBusy(false); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setBusy(false);
  };

  return <main className="login-page">
    <section className="login-brand">
      <Logo />
      <div className="login-message">
        <span className="eyebrow">Cloud back office</span>
        <h1>Your business,<br />clearly connected.</h1>
        <p>Secure access to WorldPOS administration, wherever the day takes you.</p>
      </div>
      <small>WorldPOS Cloud · Proof of concept</small>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">Welcome back</span>
        <h2>Sign in to WorldPOS</h2>
        <p>Use the account provided by your WorldPOS administrator.</p>
        <label>Email address<input autoFocus type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.co.za" /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button primary wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="secure-note"><i /> Authentication is securely managed by Supabase</div>
      </form>
    </section>
  </main>;
}

function Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<View>("dashboard");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [profileResult, sitesResult, staffResult, terminalResult] = await Promise.all([
      supabase.from("app_users").select("id,display_name,role").eq("id", session.user.id).maybeSingle(),
      supabase.from("sites").select("id,code,name").order("name"),
      supabase.from("staff_members").select("*").order("last_name"),
      supabase.from("terminals").select("*").order("terminal_number"),
    ]);
    const firstError = profileResult.error || sitesResult.error || staffResult.error || terminalResult.error;
    if (firstError) setError(firstError.message);
    setProfile(profileResult.data as Profile | null);
    setSites((sitesResult.data ?? []) as Site[]);
    setStaff((staffResult.data ?? []) as StaffMember[]);
    setTerminals((terminalResult.data ?? []) as Terminal[]);
    setLoading(false);
  }, [session.user.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!siteId && sites[0]) setSiteId(sites[0].id); }, [siteId, sites]);

  if (loading) return <Loading label="Loading your workspace" />;
  if (!profile) return <AccessPending email={session.user.email ?? "Signed-in user"} error={error} />;

  const current = nav.find(item => item.id === view)!;
  const currentSite = sites.find(site => site.id === siteId);
  const siteStaff = staff.filter(item => item.site_id === siteId);
  const siteTerminals = terminals.filter(item => item.site_id === siteId);
  const canEdit = profile.role === "administrator" || profile.role === "manager";

  return <div className="app-shell">
    <aside className={mobileNav ? "sidebar open" : "sidebar"}>
      <div className="sidebar-brand"><Logo compact /><button className="nav-close" onClick={() => setMobileNav(false)} aria-label="Close navigation">×</button></div>
      <nav>{nav.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMobileNav(false); }}><span className="nav-mark">{item.mark}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</nav>
      <div className="account-card"><span className="avatar">{initials(profile.display_name)}</span><div><strong>{profile.display_name}</strong><small>{roleLabel(profile.role)}</small></div><button onClick={() => supabase.auth.signOut()} title="Sign out" aria-label="Sign out">↗</button></div>
    </aside>
    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <main className="workspace">
      <header className="topbar">
        <button className="menu-toggle" onClick={() => setMobileNav(true)} aria-label="Open navigation">☰</button>
        <div><span className="eyebrow">{current.hint}</span><h1>{current.label}</h1></div>
        <label className="site-picker"><span>Current site</span><select value={siteId} onChange={e => setSiteId(e.target.value)}>{sites.map(site => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label>
      </header>
      {error && <div className="page-alert">{error}<button onClick={load}>Retry</button></div>}
      <section className="page-content">
        {view === "dashboard" && <Dashboard site={currentSite} staff={siteStaff} terminals={siteTerminals} profile={profile} />}
        {view === "staff" && <StaffSetup siteId={siteId} rows={siteStaff} canEdit={canEdit} refresh={load} />}
        {view === "terminals" && <TerminalSetup siteId={siteId} rows={siteTerminals} canEdit={canEdit} refresh={load} />}
      </section>
      <footer>WorldPOS Cloud · Secure client workspace</footer>
    </main>
  </div>;
}

function Dashboard({ site, staff, terminals, profile }: { site?: Site; staff: StaffMember[]; terminals: Terminal[]; profile: Profile }) {
  return <>
    <section className="welcome-card"><div><span className="eyebrow">Good day, {firstName(profile.display_name)}</span><h2>{site ? `${site.name} is ready.` : "Your workspace is ready."}</h2><p>Use the setup areas to manage the people and terminals that keep your operation moving.</p></div><div className="cloud-orb"><strong>Cloud</strong><small>Connected</small></div></section>
    <section className="summary-grid">
      <Summary label="Active staff" value={staff.filter(x => x.is_active).length} note={`${staff.length} staff records`} tone="blue" />
      <Summary label="Active terminals" value={terminals.filter(x => x.is_active).length} note={`${terminals.length} terminals configured`} tone="green" />
      <Summary label="Access level" value={roleLabel(profile.role)} note="Supabase protected" tone="navy" />
    </section>
    <section className="panel quick-panel"><div><span className="eyebrow">Getting started</span><h3>Setup overview</h3></div><div className="setup-status"><StatusRow label="Staff setup" complete={staff.length > 0} detail={staff.length ? `${staff.length} records available` : "Add your first staff member"} /><StatusRow label="Terminal setup" complete={terminals.length > 0} detail={terminals.length ? `${terminals.length} terminals available` : "Add your first terminal"} /></div></section>
  </>;
}

function StaffSetup({ siteId, rows, canEdit, refresh }: { siteId: string; rows: StaffMember[]; canEdit: boolean; refresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<StaffMember> | null>(null);
  const filtered = useMemo(() => rows.filter(row => `${row.staff_number} ${row.first_name} ${row.last_name} ${row.role_title ?? ""}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  return <><PageIntro eyebrow="People & access" title="Staff members" text="Maintain the people who work at this site." action={canEdit ? () => setEditing({ site_id: siteId, is_active: true }) : undefined} actionLabel="Add staff member" />
    <section className="panel data-panel"><Toolbar value={search} onChange={setSearch} count={filtered.length} label="staff members" /><div className="table-scroll"><table><thead><tr><th>Staff no.</th><th>Name</th><th>Role</th><th>Email</th><th>Status</th><th /></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td className="mono">{row.staff_number}</td><td><strong>{row.first_name} {row.last_name}</strong></td><td>{row.role_title || "—"}</td><td>{row.email || "—"}</td><td><Status active={row.is_active} /></td><td>{canEdit && <button className="text-button" onClick={() => setEditing(row)}>Edit</button>}</td></tr>)}</tbody></table></div>{!filtered.length && <Empty message="No staff members match this view." />}</section>
    {editing && <StaffModal value={editing} siteId={siteId} close={() => setEditing(null)} saved={async () => { setEditing(null); await refresh(); }} />}
  </>;
}

function TerminalSetup({ siteId, rows, canEdit, refresh }: { siteId: string; rows: Terminal[]; canEdit: boolean; refresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Terminal> | null>(null);
  const filtered = useMemo(() => rows.filter(row => `${row.terminal_number} ${row.name} ${row.location ?? ""}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  return <><PageIntro eyebrow="Point of sale" title="Terminals" text="Configure the tills assigned to this site." action={canEdit ? () => setEditing({ site_id: siteId, terminal_type: "POS", is_active: true }) : undefined} actionLabel="Add terminal" />
    <section className="panel data-panel"><Toolbar value={search} onChange={setSearch} count={filtered.length} label="terminals" /><div className="terminal-grid">{filtered.map(row => <article className="terminal-card" key={row.id}><div className="terminal-icon">{String(row.terminal_number).padStart(2, "0")}</div><div><span className="eyebrow">Terminal {row.terminal_number}</span><h3>{row.name}</h3><p>{row.location || "Location not specified"}</p></div><Status active={row.is_active} />{canEdit && <button className="text-button" onClick={() => setEditing(row)}>Edit</button>}</article>)}</div>{!filtered.length && <Empty message="No terminals match this view." />}</section>
    {editing && <TerminalModal value={editing} siteId={siteId} close={() => setEditing(null)} saved={async () => { setEditing(null); await refresh(); }} />}
  </>;
}

function StaffModal({ value, siteId, close, saved }: { value: Partial<StaffMember>; siteId: string; close: () => void; saved: () => Promise<void> }) {
  const [form, setForm] = useState({ staff_number: value.staff_number ?? "", first_name: value.first_name ?? "", last_name: value.last_name ?? "", role_title: value.role_title ?? "", email: value.email ?? "", is_active: value.is_active ?? true });
  return <Editor title={value.id ? "Edit staff member" : "Add staff member"} close={close} save={async () => { const payload = { ...form, site_id: siteId, email: form.email || null, role_title: form.role_title || null }; return value.id ? supabase.from("staff_members").update(payload).eq("id", value.id) : supabase.from("staff_members").insert(payload); }} saved={saved}>
    <div className="form-grid"><Field label="Staff number"><input required value={form.staff_number} onChange={e => setForm({ ...form, staff_number: e.target.value })} /></Field><Field label="Role / job title"><input value={form.role_title} onChange={e => setForm({ ...form, role_title: e.target.value })} /></Field><Field label="First name"><input required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></Field><Field label="Last name"><input required value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></Field><Field label="Email address" wide><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field><Toggle active={form.is_active} onChange={active => setForm({ ...form, is_active: active })} /></div>
  </Editor>;
}

function TerminalModal({ value, siteId, close, saved }: { value: Partial<Terminal>; siteId: string; close: () => void; saved: () => Promise<void> }) {
  const [form, setForm] = useState({ terminal_number: value.terminal_number ?? 1, name: value.name ?? "", location: value.location ?? "", terminal_type: value.terminal_type ?? "POS", is_active: value.is_active ?? true });
  return <Editor title={value.id ? "Edit terminal" : "Add terminal"} close={close} save={async () => { const payload = { ...form, site_id: siteId, location: form.location || null }; return value.id ? supabase.from("terminals").update(payload).eq("id", value.id) : supabase.from("terminals").insert(payload); }} saved={saved}>
    <div className="form-grid"><Field label="Terminal number"><input required min="1" type="number" value={form.terminal_number} onChange={e => setForm({ ...form, terminal_number: Number(e.target.value) })} /></Field><Field label="Terminal type"><select value={form.terminal_type} onChange={e => setForm({ ...form, terminal_type: e.target.value })}><option>POS</option><option>Back Office</option><option>Kiosk</option></select></Field><Field label="Terminal name" wide><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main Counter" /></Field><Field label="Location" wide><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Front of house" /></Field><Toggle active={form.is_active} onChange={active => setForm({ ...form, is_active: active })} /></div>
  </Editor>;
}

function Editor({ title, children, close, save, saved }: { title: string; children: React.ReactNode; close: () => void; save: () => Promise<{ error: { message: string } | null }>; saved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); const result = await save(); if (result.error) { setError(result.error.message); setBusy(false); return; } await saved(); setBusy(false); };
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}><form className="editor" onSubmit={submit}><div className="editor-head"><div><span className="eyebrow">Setup</span><h2>{title}</h2></div><button type="button" onClick={close} aria-label="Close">×</button></div>{children}{error && <div className="form-error">{error}</div>}<div className="editor-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div></form></div>;
}

function Logo({ compact = false }: { compact?: boolean }) { return <div className={compact ? "logo compact" : "logo"}><img className="logo-mark" src="/world.png" alt="WorldPOS globe" /><span><strong>WorldPOS</strong><small>Cloud</small></span></div>; }
function Loading({ label }: { label: string }) { return <div className="loading"><Logo /><div className="spinner" /><span>{label}</span></div>; }
function AccessPending({ email, error }: { email: string; error: string }) { return <main className="pending"><Logo /><section><span className="eyebrow">Access pending</span><h1>Your sign-in worked.</h1><p>{error || `${email} has not yet been assigned a WorldPOS role and site.`}</p><button className="button primary" onClick={() => supabase.auth.signOut()}>Return to sign in</button></section></main>; }
function Summary({ label, value, note, tone }: { label: string; value: string | number; note: string; tone: string }) { return <article className={`summary ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function StatusRow({ label, detail, complete }: { label: string; detail: string; complete: boolean }) { return <div className="status-row"><span className={complete ? "check complete" : "check"}>{complete ? "✓" : "·"}</span><div><strong>{label}</strong><small>{detail}</small></div><span>{complete ? "Ready" : "Not started"}</span></div>; }
function PageIntro({ eyebrow, title, text, action, actionLabel }: { eyebrow: string; title: string; text: string; action?: () => void; actionLabel: string }) { return <section className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>{action && <button className="button primary" onClick={action}>+ {actionLabel}</button>}</section>; }
function Toolbar({ value, onChange, count, label }: { value: string; onChange: (value: string) => void; count: number; label: string }) { return <div className="toolbar"><div><strong>{count}</strong><span>{label}</span></div><input aria-label={`Search ${label}`} value={value} onChange={e => onChange(e.target.value)} placeholder={`Search ${label}`} /></div>; }
function Status({ active }: { active: boolean }) { return <span className={active ? "status active" : "status"}><i />{active ? "Active" : "Inactive"}</span>; }
function Empty({ message }: { message: string }) { return <div className="empty"><span>○</span><strong>{message}</strong></div>; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "field wide" : "field"}>{label}{children}</label>; }
function Toggle({ active, onChange }: { active: boolean; onChange: (value: boolean) => void }) { return <label className="toggle-row"><input type="checkbox" checked={active} onChange={e => onChange(e.target.checked)} /><span className="toggle" /><span><strong>Active record</strong><small>Available for use at this site</small></span></label>; }
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
const firstName = (name: string) => name.split(" ")[0] || name;
const roleLabel = (role: string) => role.replace("administrator", "Administrator").replace("manager", "Manager").replace("viewer", "Read only");
