import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// Mock sonner toast (used by LoginForm for error toasts)
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
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

describe("LoginForm", () => {
  it("renders email and password fields", async () => {
    renderLoginForm();

    // Wait for auth context to finish loading
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
  });

  it("renders auth method toggle buttons", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByText("Email & Password")).toBeInTheDocument();
    });
    expect(screen.getByText("Phone & OTP")).toBeInTheDocument();
  });

  it("shows error message on failed login", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/email/i), "wrong@example.com");
    await user.type(screen.getByLabelText(/password/i), "badpassword");
    await user.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("does not show error on successful login", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /login/i }));

    // Give it a moment and verify no error appears
    await waitFor(() => {
      expect(
        screen.queryByText(/invalid email or password/i)
      ).not.toBeInTheDocument();
    });
  });

  it("switches to OTP form when Phone & OTP is clicked", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByText("Phone & OTP")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Phone & OTP"));

    await waitFor(() => {
      expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument();
  });

  it("has a link to the registration page", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByText(/sign up/i)).toBeInTheDocument();
    });

    const signUpLink = screen.getByText(/sign up/i);
    expect(signUpLink.closest("a")).toHaveAttribute("href", "/auth/register");
  });
});
