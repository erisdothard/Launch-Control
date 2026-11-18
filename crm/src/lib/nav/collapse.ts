// The sidebar's open / collapsed state. A cookie rather than localStorage, so the server renders the
// right width on the first paint. Plain constants: both the server layout and the client shell read them.
export const NAV_COOKIE = "lc-nav";
export const NAV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const NAV_WIDTH_OPEN = "15rem";
export const NAV_WIDTH_COLLAPSED = "68px";
