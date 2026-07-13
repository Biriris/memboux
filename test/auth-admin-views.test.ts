import { describe, expect, it } from "vitest";
import { adminLocale, adminShell } from "../src/views/admin";
import { authPage } from "../src/views/auth";

describe("authentication and admin views", () => {
  it("renders distinct login and registration forms", () => {
    const login = authPage("en", "login");
    const register = authPage("en", "register");

    expect(login).toContain("Sign in");
    expect(login).toContain('autocomplete="current-password"');
    expect(login).not.toContain('name="name"');
    expect(register).toContain("Create account");
    expect(register).toContain('name="name"');
    expect(register).toContain('autocomplete="new-password"');
  });

  it("keeps Google and email callbacks inside the selected locale", () => {
    const html = authPage("el", "login");

    expect(html).toContain("provider:'google'");
    expect(html).toContain("callbackURL:'/'+locale+'/account'");
    expect(html).toContain('href="/en/login"');
  });

  it("reads a valid admin locale cookie and defaults to English", () => {
    expect(adminLocale(new Request("https://memboux.com/admin"))).toBe("en");
    expect(adminLocale(new Request("https://memboux.com/admin", {
      headers: { Cookie: "memboux_admin_locale=el" },
    }))).toBe("el");
    expect(adminLocale(new Request("https://memboux.com/admin", {
      headers: { Cookie: "memboux_admin_locale=invalid" },
    }))).toBe("en");
  });

  it("renders localized admin navigation and preserves supplied content", () => {
    const english = adminShell("Library", "<main>content</main>", "en");
    const greek = adminShell("Βιβλιοθήκη", "<main>περιεχόμενο</main>", "el");

    expect(english).toContain("Event library");
    expect(english).toContain("Reported media");
    expect(english).toContain("<main>content</main>");
    expect(greek).toContain("Βιβλιοθήκη events");
    expect(greek).toContain("Κάδος φωτογραφιών");
  });
});
