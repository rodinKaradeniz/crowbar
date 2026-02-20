import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { server } from "../mocks/handlers";
import { AuthProvider, useAuth } from "@/contexts/auth-context";

// Start MSW server
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Minimal consumer component that exposes AuthContext state for assertions.
 */
function TestConsumer() {
  const { user, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.name : "none"}</span>
      <span data-testid="user-type">{user ? user.type : "none"}</span>
      <button onClick={() => login("test@example.com", "password123")}>
        Login
      </button>
      <button onClick={() => login("wrong@example.com", "bad")}>
        Bad Login
      </button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  it("starts in loading state then resolves to no user", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Eventually loading completes (session check returns 401)
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("sets user after successful login", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Wait for initial load to finish
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    // Trigger login
    await act(async () => {
      screen.getByText("Login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("Test User");
      expect(screen.getByTestId("user-type").textContent).toBe("customer");
    });
  });

  it("remains with no user after failed login", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    await act(async () => {
      screen.getByText("Bad Login").click();
    });

    // User should still be "none" after failed login
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("none");
    });
  });

  it("clears user after logout", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    // Login first
    await act(async () => {
      screen.getByText("Login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("Test User");
    });

    // Then logout
    await act(async () => {
      screen.getByText("Logout").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("none");
    });
  });
});
