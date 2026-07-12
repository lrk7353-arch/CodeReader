# ADR: Backport the glib 0.18 VariantStrIter security fix

- Date: 2026-07-12
- Status: accepted
- Scope: Linux runtime dependency chain in CodeReader 1.0

## Context

GitHub Dependabot alert #2 tracks RUSTSEC-2024-0429 in `glib` 0.18.5.
The advisory's upstream fixed release is `glib` 0.20.0. CodeReader's
Tauri 2.11 GTK3 stack is semver-constrained to the 0.18 family, so changing
only the lockfile to 0.20.0 is not a valid or buildable remediation.

The affected implementation is `VariantStrIter`. The upstream fix is the
two-line mutable-pointer correction merged as
[gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343),
commit `05dff0ee696f9bcd8617cd48c4b812d046d440cb`.

## Decision

CodeReader patches the complete glib ABI family from the public,
MIT-licensed fork
[`lrk7353-arch/gtk-rs-core-security`](https://github.com/lrk7353-arch/gtk-rs-core-security)
at immutable commit
[`a10fcaacb24c29b7199f97bdfbe682b8f101bb86`](https://github.com/lrk7353-arch/gtk-rs-core-security/commit/a10fcaacb24c29b7199f97bdfbe682b8f101bb86).
That commit contains only the upstream VariantStrIter fix backported onto the
compatible 0.18 line.

The `[patch.crates-io]` section pins `glib`, `glib-sys`, `gio-sys`,
`gobject-sys`, and `glib-macros` to that exact revision. Patching the
whole ABI family prevents Cargo from combining glib bindings from different
source identities.

The security workflow has no `RUSTSEC-2024-0429` ignore. A dependency-audit
failure is therefore a release blocker. This is a source-level remediation,
not an unbounded “not called by our code” exception.

## Verification

Before this decision was committed, the patched dependency graph passed:

- `cargo check --locked`
- `cargo test --locked` (113 tests)
- `cargo clippy --locked --all-targets -- -D warnings`

GitHub Actions must additionally verify the immutable remote Git source and
the RustSec audit before merge.

## Exit criteria

Remove this patch when a supported Tauri/Wry/GTK dependency chain resolves
to `glib >= 0.20.0`. The replacement must pass the complete Linux and
Windows release gates; the patch must not silently become a permanent
dependency fork.
