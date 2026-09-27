import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([{
    extends: [...nextCoreWebVitals],
    rules: {
        // eslint-config-next 16 promotes this to an error by default. It
        // flags the standard "async loader function invoked from useEffect"
        // pattern used throughout this app's dashboard pages (fetch on
        // mount/dependency change) -- a real, common, working pattern, not a
        // bug. Downgraded to match how exhaustive-deps is already treated
        // here (warn, not a blocking error) rather than force an unrelated
        // data-fetching refactor as part of the Next.js upgrade.
        "react-hooks/set-state-in-effect": "warn",
        // Flags `window.location.href = url` (redirecting to an external
        // Stripe-hosted checkout/portal URL from a click handler) as an
        // unsafe mutation of an outside-component value. That's a false
        // positive here: it's an intentional side effect in an event
        // handler, not a render-path mutation, and there's no
        // compiler-safe alternative for a cross-origin redirect.
        "react-hooks/immutability": "warn",
    },
}]);