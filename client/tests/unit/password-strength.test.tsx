import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  gradePassword,
  PasswordStrength,
  PASSWORD_MIN_LENGTH,
} from "@/components/auth/password-strength";

describe("gradePassword", () => {
  it("says nothing about an empty field", () => {
    expect(gradePassword("")).toEqual({ score: 0, label: "", tone: "neutral" });
  });

  it("marks a password below the real minimum invalid", () => {
    const verdict = gradePassword("short");
    expect(verdict.tone).toBe("invalid");
    expect(verdict.label).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("uses the server's minimum of 12, not the canvas's 10", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(gradePassword("a".repeat(10)).tone).toBe("invalid");
    expect(gradePassword("a".repeat(12)).tone).not.toBe("invalid");
  });
});

describe("PasswordStrength", () => {
  // The bug this guards: the meter rendered the validation colour from the
  // first keystroke, so every password field flashed an error before the
  // person had done anything wrong.
  it("does not show the invalid tone before the field is touched", () => {
    const verdict = gradePassword("abc");
    expect(verdict.tone).toBe("invalid");

    const { container } = render(<PasswordStrength verdict={verdict} />);
    expect(container.querySelector(".text-field-invalid")).toBeNull();
    expect(container.querySelector(".bg-field-invalid")).toBeNull();
  });

  it("shows the invalid tone once the field has been blurred", () => {
    const verdict = gradePassword("abc");
    const { container } = render(
      <PasswordStrength verdict={verdict} touched />,
    );
    expect(container.querySelector(".text-field-invalid")).not.toBeNull();
  });

  it("never uses a severity token — a password hint is not a service alarm", () => {
    const { container } = render(
      <PasswordStrength verdict={gradePassword("abc")} touched />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain("attend");
    expect(html).not.toContain("critical");
  });

  it("reports a strong password through brand, not through a severity", () => {
    const verdict = gradePassword("Str0ng-Passw0rd-Here!");
    expect(verdict.tone).toBe("brand");
    render(<PasswordStrength verdict={verdict} touched />);
    expect(screen.getByText("Strong enough")).toBeTruthy();
  });
});
