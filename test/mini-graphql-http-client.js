const { expect } = require("chai");
import MiniGraphqlHttpClient from "../src/mini-graphql-http-client";

describe("MiniGraphqlHttpClient tests", () => {
    describe("creating instance", () => {
        it("should throw if URI or fetch was not provided", () => {
            expect(() => MiniGraphqlHttpClient()).to.throw();
            expect(() => MiniGraphqlHttpClient({ fetch: () => {} })).to.throw(/uri/);
            expect(() => MiniGraphqlHttpClient({ uri: "a" })).to.throw(/fetch/);
            expect(() => MiniGraphqlHttpClient({ uri: "a", fetch: "not a function" })).to.throw(/fetch/);
            expect(() => MiniGraphqlHttpClient({ uri: /not a string/, fetch: () => {} })).to.throw(/uri/);
            expect(() => MiniGraphqlHttpClient({ uri: "my string", fetch: () => {} })).to.not.throw();
        });

        it("should set default cache settings", () => {
            const cache = {};

            MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: () => {}, cache });

            expect(cache).to.have.property("map");
            expect(cache).to.have.property("duration", Number.MAX_SAFE_INTEGER);
        });
    });

    /*    const createFakeFetch = () => {
        function fakeFetch() {
            fakeFetch.calls += 1;
            return { ok: true, json: () => ({ bla: 1 }) };
        }
        fakeFetch.calls = 0;
        return fakeFetch;
    };*/

    const statusTexts = { 200: "OK", 400: "Bad Request", 500: "Internal Server Error" };
    const createFakeFetch = (statusCodes) => {
        function fakeFetch() {
            const status = statusCodes[fakeFetch.calls];
            fakeFetch.calls += 1;
            return { ok: status === 200, status, statusText: statusTexts[status], json: () => ({ bla: 1 }) };
        }
        fakeFetch.calls = 0;
        return fakeFetch;
    };

    describe("#clearCache", () => {
        it("should reset cache when called", async () => {
            const cache = {};
            const client = MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: createFakeFetch([200]), cache });
            await client.query({ query: "{ bla }" });

            expect(cache.map.size).to.not.equal(0);

            client.clearCache();

            expect(cache.map.size).to.equal(0);
        });
    });

    describe("#query", () => {
        it("should return cached JS object by default", async () => {
            const fakeFetch = createFakeFetch([200]);
            const client = MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: fakeFetch });

            await client.query({ query: "{ bla }" });
            expect(fakeFetch.calls).to.equal(1);

            await client.query({ query: "{ bla }" });
            expect(fakeFetch.calls).to.equal(1);
        });
    });

    describe("#mutate", () => {
        it("should not cache mutations at all", async () => {
            const fakeFetch = createFakeFetch([200, 200]);
            const client = MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: fakeFetch });

            await client.mutate({ mutation: "{ bla }" });
            expect(fakeFetch.calls).to.equal(1);

            await client.mutate({ mutation: "{ bla }" });
            expect(fakeFetch.calls).to.equal(2);
        });
    });

    describe("#cacheToJSON", () => {
        it("should serialise cache to JS objects and deserialise back", async () => {
            const cache = {};
            const fakeFetch = createFakeFetch([200]);
            const client = MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: fakeFetch, cache });
            await client.query({ query: "{ bla }" });

            const jsonCache = client.cacheToJSON();
            const [hash, value] = jsonCache[0];
            expect(hash).to.equal("2421565178");
            expect(value.json).to.deep.equal({ bla: 1 });
            expect(value.expTime).to.be.gt(Date.now());

            const fakeFetch2 = createFakeFetch();
            const cache2 = { jsonCache };
            const client2 = MiniGraphqlHttpClient({ uri: "https://anoth.er", fetch: fakeFetch2, cache: cache2 });
            await client2.query({ query: "{ bla }" });
            expect(fakeFetch2.calls).to.equal(0); // no calls done, the JSON was retrieved from the cache
            expect(cache2.map.size).to.equal(1);
            expect(cache2.map.get("2421565178")).to.have.deep.property("json", { bla: 1 });
        });
    });

    describe("#retry", () => {
        it("should try making 6 retries on 5xx responses but stop on 5-th try because of good response", async function () {
            let wasError = false;
            let numberOfRetries = 6;
            const cache = {};
            const fakeFetch = createFakeFetch([500, 500, 500, 500, 200, 500]);
            const client = MiniGraphqlHttpClient({
                uri: "https://a.aa",
                fetch: fakeFetch,
                cache,
                retry: numberOfRetries,
            });

            await client.query({ query: "{ bla }" }).catch(() => {
                wasError = true;
            });

            expect(fakeFetch.calls).to.be.equal(5);
            expect(wasError).to.be.false;
        });

        it("should make 3 retries on 5xx error response and return error on 3 retry, it's will be 4-th try", async function () {
            let wasError = false;
            let numberOfRetries = 3;
            const cache = {};
            const fakeFetch = createFakeFetch([500, 500, 500, 500, 200]);
            const client = MiniGraphqlHttpClient({
                uri: "https://a.aa",
                fetch: fakeFetch,
                cache,
                retry: numberOfRetries,
            });

            await client.query({ query: "{ bla }" }).catch(() => {
                wasError = true;
            });

            expect(fakeFetch.calls).to.be.equal(4);
            expect(wasError).to.be.true;
        });

        it("should not make retries on 4xx error response and return error after 1st try", async function () {
            let errorText;
            let wasError = false;
            let numberOfRetries = 3;
            const cache = {};
            const fakeFetch = createFakeFetch([400, 500, 200]);
            const client = MiniGraphqlHttpClient({
                uri: "https://a.aa",
                fetch: fakeFetch,
                cache,
                retry: numberOfRetries,
            });

            await client.query({ query: "{ bla }" }).catch((error) => {
                errorText = error.message;
                wasError = true;
            });

            expect(errorText).to.be.equal("400 Bad Request");
            expect(wasError).to.be.true;
            expect(fakeFetch.calls).to.be.equal(1);
        });

        it("should make 5 retries on fetch error and return good response on 5 fetch", async function () {
            let errorText;
            let wasError = false;
            const fakeFetch = createFakeFetch([500, 500, 500, 500, 200]);

            let numberOfRetries = 7;
            const cache = {};
            const client = MiniGraphqlHttpClient({
                uri: "https://a.aa",
                fetch: fakeFetch,
                cache,
                retry: numberOfRetries,
            });

            await client.query({ query: "{ bla }" }).catch((error) => {
                errorText = error.message;
                wasError = true;
            });

            expect(errorText).to.be.not.equal("error response");
            expect(wasError).to.be.false;
            expect(fakeFetch.calls).to.be.equal(5);
        });
    });
});
