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

    const createFakeFetch = () => {
        function fakeFetch() {
            fakeFetch.calls += 1;
            return { ok: true, json: () => ({ bla: 1 }) };
        }
        fakeFetch.calls = 0;
        return fakeFetch;
    };

    describe("#clearCache", () => {
        it("should reset cache when called", async () => {
            const cache = {};
            const client = MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: createFakeFetch(), cache });
            await client.query({ query: "{ bla }" });

            expect(cache.map.size).to.not.equal(0);

            client.clearCache();

            expect(cache.map.size).to.equal(0);
        });
    });

    describe("#query", () => {
        it("should return cached JS object by default", async () => {
            const fakeFetch = createFakeFetch();
            const client = MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: fakeFetch });

            await client.query({ query: "{ bla }" });
            expect(fakeFetch.calls).to.equal(1);

            await client.query({ query: "{ bla }" });
            expect(fakeFetch.calls).to.equal(1);
        });
    });

    describe("#mutation", () => {
        it("should not cache mutation at all", async () => {
            const fakeFetch = createFakeFetch();
            const client = MiniGraphqlHttpClient({ uri: "https://a.aa", fetch: fakeFetch });

            await client.mutation({ mutation: "{ bla }" });
            expect(fakeFetch.calls).to.equal(1);

            await client.mutation({ mutation: "{ bla }" });
            expect(fakeFetch.calls).to.equal(2);
        });
    });

    describe("#cacheToJSON", () => {
        it("should serialise cache to JS objects and deserialise back", async () => {
            const cache = {};
            const fakeFetch = createFakeFetch();
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
});
