import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authCallbackBootstrapHtml, authCallbackRequestBody, callbackRoutePlan, parseAuthHash } from "@/lib/auth/callback-link";
import { inviteEmailNextPath } from "@/lib/auth/invite-mail";
import { authCallbackDestination } from "@/lib/auth/magic-link";
import { profileIsIncomplete } from "@/lib/auth/profile";

const TOKEN = "a".repeat(48);

describe("invite link arrival", () => {
  it("sends a new person to finish-account and an existing account through sign-in", () => {
    const invitePath = `/invite/${TOKEN}`;
    expect(
      authCallbackDestination({
        verified: true,
        deactivated: false,
        next: invitePath,
        accountReady: false,
        linkType: "invite",
      }),
    ).toEqual({ path: invitePath, signOut: false });
    expect(
      authCallbackDestination({
        verified: true,
        deactivated: false,
        next: invitePath,
        accountReady: true,
        linkType: "invite",
      }),
    ).toEqual({ path: `/login?next=${encodeURIComponent(invitePath)}`, signOut: true });
    expect(
      authCallbackDestination({
        verified: false,
        deactivated: false,
        next: invitePath,
        accountReady: false,
        linkType: "invite",
      }).path,
    ).toBe(`/login?error=auth&next=${encodeURIComponent(invitePath)}`);
    expect(
      authCallbackDestination({
        verified: true,
        deactivated: false,
        next: "/catalog",
        accountReady: false,
        linkType: "invite",
      }),
    ).toEqual({ path: "/invite/continue", signOut: false });
    expect(
      authCallbackDestination({
        verified: true,
        deactivated: false,
        next: "/catalog",
        accountReady: true,
        linkType: "invite",
      }),
    ).toEqual({ path: "/login?next=/catalog", signOut: true });
    expect(profileIsIncomplete({ firstName: "", lastName: "" })).toBe(true);
    expect(profileIsIncomplete({ firstName: "Ada", lastName: "Lovelace" })).toBe(false);
  });

  it("keeps an ordinary catalog link on its original path", () => {
    expect(authCallbackDestination({ verified: true, deactivated: false, next: "/catalog" })).toEqual({
      path: "/catalog",
      signOut: false,
    });
    expect(authCallbackDestination({ verified: false, deactivated: false, next: "/catalog" })).toEqual({
      path: "/login?error=auth",
      signOut: false,
    });
    expect(authCallbackDestination({ verified: true, deactivated: false, next: "/auth/reset", linkType: "recovery" })).toEqual({
      path: "/auth/reset",
      signOut: false,
    });
  });

  it("reads the invite session from the URL fragment instead of treating the visit as failed", () => {
    const hash = "#access_token=aaa.bbb.ccc&refresh_token=ddd&type=invite";
    expect(parseAuthHash(hash)).toEqual({
      accessToken: "aaa.bbb.ccc",
      refreshToken: "ddd",
      type: "invite",
      error: null,
    });
    expect(callbackRoutePlan(new URLSearchParams("next=/invite/abc"))).toBe("bootstrap-hash");
    expect(callbackRoutePlan(new URLSearchParams("code=pkce-code"))).toBe("exchange-code");
    expect(callbackRoutePlan(new URLSearchParams("token_hash=hash&type=invite"))).toBe("verify-otp");
    const body = authCallbackRequestBody({
      hash,
      next: `/invite/${TOKEN}`,
      queryError: null,
    });
    expect(body.accessToken).toBe("aaa.bbb.ccc");
    expect(body.type).toBe("invite");
    expect(body.next).toBe(`/invite/${TOKEN}`);
    const html = authCallbackBootstrapHtml();
    expect(html).toContain("access_token");
    expect(html).toContain('fetch("/auth/callback"');
    expect(html).not.toContain("http-equiv=\"refresh\"");
    const route = readFileSync("app/auth/callback/route.ts", "utf8");
    expect(route).toContain("authCallbackBootstrapHtml");
    expect(route).toContain("setSession");
    expect(route).toContain("authCallbackDestination");
    expect(route).toContain("accountIsDeactivated");
    expect(route).toContain("signOut");
  });

  it("points a new invite at finish-account and does not use a server-side PKCE challenge", () => {
    expect(inviteEmailNextPath("invited", TOKEN)).toBe(`/invite/${TOKEN}`);
    expect(inviteEmailNextPath("member", null)).toBe("/catalog");
    expect(inviteEmailNextPath("invited", null)).toBe("/catalog");
    const mail = readFileSync("lib/auth/invite-mail.ts", "utf8");
    expect(mail).toContain('flowType: "implicit"');
    expect(mail).toContain("inviteEmailNextPath");
    const finish = readFileSync("components/finish-account.tsx", "utf8");
    expect(finish).toContain("acceptInviteAction");
    expect(finish).toContain("readableFinishInviteError");
    expect(finish).toContain("profileIsIncomplete");
    expect(finish).toContain('aria-readonly="true"');
    expect(finish).toContain("PasswordField");
    expect(finish).not.toContain("window.confirm");
  });
});
