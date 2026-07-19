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

    expect(html).toContain("socialLogin(googleButton,'google')");
    expect(html).toContain('postAuthRedirect="/el/account"');
    expect(html).toContain("callbackURL:postAuthRedirect");
    expect(html).not.toContain('href="/en/login"');
    expect(html).toContain('href="/el"');
  });

  it("only exposes Facebook sign-in after its provider is configured", () => {
    const disabled = authPage("en", "login");
    const enabled = authPage("el", "register", "", { facebook: true });

    expect(disabled).not.toContain('id="facebook"');
    expect(disabled).not.toContain("socialLogin(facebookButton,'facebook')");
    expect(enabled).toContain('id="facebook"');
    expect(enabled).toContain("Συνέχεια με Facebook");
    expect(enabled).toContain("socialLogin(facebookButton,'facebook')");
    expect(enabled).toContain("callbackURL:postAuthRedirect");
  });

  it("preserves safe invitation redirects and rejects external redirects", () => {
    const invitation = authPage("en", "login", "/invite/secure-token?lang=en");
    const external = authPage("en", "login", "//phishing.example/path");

    expect(invitation).toContain('postAuthRedirect="/invite/secure-token?lang=en"');
    expect(invitation).toContain("redirect=%2Finvite%2Fsecure-token%3Flang%3Den");
    expect(external).toContain('postAuthRedirect="/en/account"');
    expect(external).not.toContain("phishing.example");
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
    const english = adminShell("Library", '<main><a href="/admin">content</a></main>', "en");
    const greek = adminShell("Βιβλιοθήκη", "<main>περιεχόμενο</main>", "el");

    expect(english).toContain("Event library");
    expect(english).toContain('href="/admin/users"');
    expect(english).toContain('href="/admin/events"');
    expect(english.indexOf("Registered users")).toBeLessThan(english.indexOf("Event library"));
    expect(english).toContain("Reported media");
    expect(english).toContain('<main><a href="/admin/events">content</a></main>');
    expect(greek).toContain("Βιβλιοθήκη events");
    expect(greek).toContain("Κάδος φωτογραφιών");
  });
});
