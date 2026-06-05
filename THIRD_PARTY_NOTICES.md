# Third-Party Notices

PostSnail Alpha 1 vendors browser-side open-source dependencies so the admin can run without runtime CDN imports.

No proprietary third-party code was found in the shipped vendored dependency set during the Alpha 1 review. The generated PostSnail logo asset is assumed to be owned or cleared by Boaz Alhadeff.

## Shipped Browser Dependencies

| Package | Version | License | Copyright / Notice | Bundled License |
| --- | --- | --- | --- | --- |
| `@noble/post-quantum` | `0.6.1` | MIT | Copyright 2024 Paul Miller | `vendor/@noble/post-quantum/LICENSE` |
| `@noble/hashes` | `2.2.0` | MIT | Copyright 2022 Paul Miller | `vendor/@noble/hashes/LICENSE` |
| `@noble/curves` | `2.2.0` | MIT | Copyright 2022 Paul Miller | `vendor/@noble/curves/LICENSE` |
| `@noble/ciphers` | `2.2.0` | MIT | Copyright 2022 Paul Miller; Copyright 2016 Thomas Pornin | `vendor/@noble/ciphers/LICENSE` |
| `fflate` | `0.8.3` | MIT | Copyright 2026 Arjun Barrett | `vendor/fflate/LICENSE` |
| `marked` | `18.0.5` | MIT plus bundled Markdown notice | Copyright 2018+ MarkedJS; Copyright 2011-2018 Christopher Jeffrey; Markdown notice by John Gruber | `vendor/marked/LICENSE` |
| `dompurify` | `3.4.8` | Apache-2.0 or MPL-2.0 | DOMPurify project contributors | `vendor/dompurify/LICENSE`, `vendor/dompurify/LICENSE-MPL` |

## Development Dependencies

Root and registry development tooling, including Wrangler, Vitest, TypeScript, Miniflare, Workerd, and their transitive packages, are used for local development, tests, and deployment validation. They are not shipped as static browser assets by `scripts/prepare-admin-assets.js`.

## Cloudflare Pricing References

Forest can consume Cloudflare resources when public APIs are used or abused. Current pricing and limits should be checked before production launch:

- Workers pricing: https://workers.cloudflare.com/pricing
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
