import { Button } from "@/components/ui/button";
import { DEMO_ROLES, type DemoRole } from "@/lib/demo/token";

const ROLE_SUMMARIES: Record<DemoRole, string> = {
  owner: "Everything, including reports, stock and staff.",
  host_server: "The door, the floor, tables and tabs.",
  bar_kitchen: "Tickets and the bar's side of the night.",
};

/**
 * Sign-in for the demo build. There is no password: each button posts a role
 * to `/api/auth/demo`, which sets a session that only the demo understands.
 * A plain form, so it works before any JavaScript has loaded.
 */
export function DemoEntry() {
  return (
    <div>
      <p className="mkt-eyebrow mb-2.5 text-text-muted">Demo</p>
      <h1 className="auth-title mb-[var(--space-16)]">Work a sample evening</h1>
      <p className="mb-[var(--space-32)] max-w-[38ch] text-[length:var(--ui-size)] leading-[var(--ui-lh)] text-text-secondary">
        Pick a role to see what it sees, and run the night: book, seat, order,
        send to the pass, settle. What you change stays in this browser, and no
        guest is ever contacted.
      </p>

      <ul className="flex flex-col gap-[var(--space-16)]">
        {(Object.keys(DEMO_ROLES) as DemoRole[]).map((role) => (
          <li key={role}>
            <form action="/api/auth/demo" method="post">
              <input type="hidden" name="role" value={role} />
              <Button
                type="submit"
                size="auth"
                variant={role === "owner" ? "primary" : "secondary"}
                className="w-full font-semibold"
                aria-describedby={`demo-role-${role}`}
              >
                Enter as {DEMO_ROLES[role].label}
              </Button>
              <p
                id={`demo-role-${role}`}
                className="mt-[var(--space-4)] text-[length:var(--ui-size)] leading-[var(--ui-lh)] text-text-muted"
              >
                {ROLE_SUMMARIES[role]}
              </p>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
