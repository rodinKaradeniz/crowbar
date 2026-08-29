import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/handlers";
import { AuthProvider } from "@/contexts/auth-context";
import { LoginForm } from "@/components/login-form";

// Mock next/navigation (used by LoginForm for router.push)
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Start MSW server
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderLoginForm() {
  return render(
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}

async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  await waitFor(() => {
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
}

describe("LoginForm", () => {
  it("renders email and password fields", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("keeps removed customer and OTP login paths out of the MVP", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /open your workspace/i })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/phone & otp/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /forgot your password/i })
    ).toHaveAttribute("href", "/auth/forgot-password");
  });

  it("names nothing about any venue before sign-in", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    // A sign-in page does not know who is arriving. No venue name, no live
    // status, no service times — see the Auth canvas notes.
    expect(screen.queryByText(/doors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/service open/i)).not.toBeInTheDocument();
  });

  it("says what to check on the first failure, and offers a way out", async () => {
    renderLoginForm();
    await signIn("wrong@example.com", "badpassword");

    await waitFor(() => {
      expect(
        screen.getByText(/that email and password don't match/i)
      ).toBeInTheDocument();
    });

    // Never "invalid input" — the message names the likeliest cause and the
    // notice carries a route out.
    expect(
      screen.getByRole("link", { name: /send me a reset link instead/i })
    ).toHaveAttribute("href", "/auth/forgot-password");
  });

  it("reveals the password after a failure and never claims an attempt count", async () => {
    renderLoginForm();
    await signIn("wrong@example.com", "badpassword");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
    });

    // Mistyping in the dark is the likeliest cause, so the password is shown.
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "text");

    // The backend has no lockout counter, so the screen must not invent one.
    expect(screen.queryByText(/attempts? left/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/attempts? remaining/i)).not.toBeInTheDocument();
  });

  it("counts down from the server's own Retry-After when throttled", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json(
          { error: "Too many requests." },
          { status: 429, headers: { "Retry-After": "900" } }
        )
      )
    );

    renderLoginForm();
    await signIn("someone@example.com", "badpassword");

    // The clock is live, so a second may have passed by the time this asserts.
    await waitFor(() => {
      expect(
        screen.getByText(/^Locked · 1[45]:\d{2} remaining$/)
      ).toBeInTheDocument();
    });

    // "You are not locked out of the venue" — both routes back in are offered.
    expect(
      screen.getByRole("link", { name: /email me a reset link/i })
    ).toBeInTheDocument();
  });

  it("does not show error on successful login", async () => {
    renderLoginForm();
    await signIn("test@example.com", "test-password-1234");

    await waitFor(() => {
      expect(
        screen.queryByText(/that email and password don't match/i)
      ).not.toBeInTheDocument();
    });
  });

  it("has a link to business registration", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByText(/create an account/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/create an account/i).closest("a")).toHaveAttribute(
      "href",
      "/auth/register"
    );
  });
});
