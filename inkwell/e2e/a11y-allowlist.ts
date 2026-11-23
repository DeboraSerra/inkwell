// Known violations that can't be fixed yet (Phase 8c): a violation fails CI,
// so one that has to wait goes here, with why and until when, rather than its
// rule being turned off for every page. `target` is matched against the start
// of axe's selector for the element, as the failure message prints it.
export const A11Y_ALLOWLIST: readonly { rule: string; target: string; reason: string }[] = [];
