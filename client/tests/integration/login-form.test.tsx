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
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("keeps removed customer and OTP login paths out of the MVP", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /staff login/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/phone & otp/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("shows error message on failed login", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/email/i), "wrong@example.com");
    await user.type(screen.getByLabelText(/password/i), "badpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

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
    await user.click(screen.getByRole("button", { name: /log in/i }));

    // Give it a moment and verify no error appears
    await waitFor(() => {
      expect(
        screen.queryByText(/invalid email or password/i)
      ).not.toBeInTheDocument();
    });
  });

  it("has a link to business registration", async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByText(/register the business/i)).toBeInTheDocument();
    });

    const registrationLink = screen.getByText(/register the business/i);
    expect(registrationLink.closest("a")).toHaveAttribute("href", "/auth/register");
  });
});
