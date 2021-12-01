const is = (obj, type) => typeof obj === type;
const isFunction = (obj) => is(obj, "function");
const isString = (obj) => is(obj, "string");

/**
 * This function must behave identical on both server and client.
 * Copied from https://github.com/darkskyapp/string-hash/blob/cb38ab492aba198b9658b286bb2391278bb6992b/index.js
 * This is good enough for a few thousand of entries.
 * @param str {String} Original string.
 * @return {String} The hash of that string.
 * @ignore
 */
function hash(str) {
    if (!str) return "";
    let hash = 5381;
    for (let i = str.length; i; ) hash = (hash * 33) ^ str.charCodeAt(--i);
    return String(hash >>> 0);
}

const nativeFetch = typeof fetch === "undefined" ? null : fetch;

/**
 * Request hook.
 *
 * @callback requestHook
 * @param query {String|Object} The GraphQL query.
 * @param variables {Object} The GraphQL variables.
 * @param fetchOptions {Object} The `fetch` options.
 * @param uri {String} The `fetch` URI.
 * @param cacheDuration {Number} For how long this request response will be cached (error responses are never cached).
 * @kind typedef
 */
/**
 * Response hook.
 *
 * @callback responseHook
 * @param query {String|Object} The GraphQL query.
 * @param variables {Object} The GraphQL variables.
 * @param fetchOptions {Object} The `fetch` options.
 * @param uri {String} The `fetch` URI.
 * @param cacheDuration {Number} For how long this request response will be cached (error responses are never cached).
 * @param response {Response} The `fetch` response. https://developer.mozilla.org/en-US/docs/Web/API/Response
 * @param [json] {*} The HTTP response as JSON object. Can be missing if request failed. Usually it contains two properties: `data` and `errors`.
 * @param [error] {Error} The HTTP error if there was one.
 * @kind typedef
 */

/**
 * The GraphQL HTTP client.
 * @param uri {String} The GraphQL HTTP endpoint. Like https://example.com/graphql
 * @param [method="POST"] {String} the HTTP method for all the request. Default it "POST"
 * @param [fetch] {Function} Fetch implementation. You must provide it if global `fetch` is missing.
 * @param retry {int} Numbers of retry attempts on 5xx response
 * @param [headers] {Object} HTTP headers
 * @param [credentials="include"] {String} The `fetch` argument to include cookies into the request.
 * @param [cache.duration=Number.MAX_SAFE_INTEGER] {Number} Cache duration settings for queries.
 * @param [cache.map] {Map} Initialise your cache with the ES6 Map object. Overrides the `cache.jsonCache`.
 * @param [cache.jsonCache] {Array} Initialise your cache with JSON (aka POJO).
 * @param [hooks.request] {requestHook} A callback executed before doing the HTTP request.
 * @param [hooks.response] {responseHook} A callback executed after the HTTP request.
 * @kind function
 * @return {{query:Function, mutate:Function, clearCache:Function, cacheToJSON:Function}}
 */
export default function MiniGraphqlHttpClient({
    uri,
    method = "POST",
    fetch = nativeFetch,
    retry = 0,
    headers: mainHeaders = {},
    credentials = "include", // instruct browser to set cookies on request
    cache,
    hooks,
} = {}) {
    // No sense doing anything without an URI
    if (!isString(uri)) throw new Error("Missing `uri` arg");
    // We do not auto detect fetch implementation. It must be provided.
    if (!isFunction(fetch)) throw new Error("Missing `fetch` arg");

    // Safely detect cache settings.
    if (!cache) cache = {};
    if (!cache.map) cache.map = new Map(cache.jsonCache || []);
    if (cache.duration == null) cache.duration = Number.MAX_SAFE_INTEGER;

    return {
        cacheToJSON() {
            return Array.from(cache.map.entries());
        },

        clearCache() {
            cache.map.clear();
        },

        /**
         * @param query {String|Object} The GraphQL query as a String or as a `gql` parsed Object.
         * @param [variables] {Object} The query variables
         * @param [headers] {Object}
         * @param [cacheDuration] {Number} Override your default cache duration with this argument
         * @return HTTP response body as JS object
         * @kind member
         */
        async query({ query, headers: requestHeaders = {}, variables, cacheDuration = cache.duration } = {}) {
            if (!query) throw new Error("Missing `query` arg");

            const body = JSON.stringify({ query, variables });
            // Query+variables is our cache key.
            const bodyHash = hash(body);

            // Let's see if the response was cached earlier.
            if (cacheDuration > 0) {
                let cachedEntry = cache.map.get(bodyHash);
                if (cachedEntry && Date.now() < cachedEntry.expTime) {
                    // The cache have not yet expired.
                    return cachedEntry.json;
                }
            }

            const headers = {
                "content-type": "application/json",
                ...mainHeaders,
                ...requestHeaders,
            };

            const fetchOptions = { method, headers, credentials, body };

            // Pre-request hook
            if (hooks && isFunction(hooks.request)) {
                try {
                    await hooks.request({
                        query,
                        variables,
                        cacheDuration,
                        uri,
                        fetchOptions,
                    });
                } catch (e) {
                    console.error(e);
                }
            }

            let response, json, error;
            if (retry === 0) retry = 1;
            for (let i = 0; i < retry; i++) {
                try {
                    // Response object
                    response = await fetch(uri, fetchOptions);
                    // Check if status is not 5XX.
                    if (response.status >= 500) {
                        continue;
                    }
                    // Check if status is not 4XX.
                    else if (response.ok) {
                        json = await response.json();
                        break;
                    } else {
                        error = new Error(`${response.status} ${response.statusText}`);
                        break;
                    }
                } catch (e) {
                    error = e;
                }
            }

            // Post-request hook
            if (hooks && isFunction(hooks.response)) {
                try {
                    await hooks.response({
                        query,
                        variables,
                        uri,
                        fetchOptions,
                        cacheDuration,
                        response,
                        json,
                        error,
                    });
                } catch (e) {
                    console.error(e);
                }
            }

            // Do not cache if there were at least one error somewhere
            if (
                cacheDuration > 0 &&
                response &&
                response.ok &&
                json &&
                !(error || (json.errors && json.errors.length))
            ) {
                const cachedEntry = { json, expTime: Date.now() + cacheDuration };
                cache.map.set(bodyHash, cachedEntry);
            }

            if (error) throw error;

            return json || {};
        },

        /**
         * @param options.mutation {String}
         * @param [options.variables] {Object}
         * @param [options.headers] {Object}
         * @return HTTP response body as JS object
         * @kind member
         */
        mutate(options) {
            // There is not much difference yet.
            options.query = options.mutation;
            options.cacheDuration = 0;
            return this.query(options);
        },
    };
}
