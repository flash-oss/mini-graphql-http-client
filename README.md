# mini-graphql-http-client

Minimalistic (0 dependencies, 1Kb) GraphQL client for browsers and node.js with memory caching support


[![gzip size](https://img.badgesize.io/https://unpkg.com/mini-graphql-http-client/dist/mini-graphql-http-client.modern.js?compression=gzip&label=gzip)](https://unpkg.com/mini-graphql-http-client/dist/mini-graphql-http-client.modern.js)
[![brotli size](https://img.badgesize.io/https://unpkg.com/mini-graphql-http-client/dist/mini-graphql-http-client.modern.js?compression=brotli&label=brotli)](https://unpkg.com/mini-graphql-http-client/dist/mini-graphql-http-client.modern.js)

## Why this project exists?

ApolloClient is a super cool GraphQL client. Pluggable, universal, well documented, multi-protocol, smart caching, insane amount of features, etc. You should use it.

However, it was too much for our humble needs. All we wanted is to do HTTP JSON calls which are cached in memory.

ApolloClient:

- is more than 30Kb of Gzipped JavaScript;
- it can't easily cache CMS queries like this: `{ about_us_page { title description cta cta_action } }`;
- difficult to grasp how it behaves without deep diving into the (amazing!) docs.

There is a handful of alternatives: https://github.com/chentsulin/awesome-graphql#clients

Although, half of them are bound to a framework (like React or AWS Amplify), another half don't have all the features we need: simple caching, small size, HTTP, no dependencies. Thus, this project was born.

MiniGraphqlHttpClient:

- **1Kb** of Gzipped JavaScript;
- Caches the whole query without parsing it;
- Newbie friendly, straightforward to use.

## How caching works

TL;DR: It's a dumb map. Key: 32bit hash of query string+variables, Value: JSON response.  

Note! This is a key difference to all the other GraphQL client modules.

By default, it caches every GraphQL query (not mutation!) response to the memory forever. You can adjust the caching duration(s). Responses containing errors are not cached obv.

On every request a 32bit hash (up to 4,294,967,295 unique values) of your query+variables is generated and used as a key in a key-value map. This should be enough for a few thousand cache entries before seeing hash clashes.

So, if the `MiniGraphqlHttpClient` sees identical GraphQL HTTP request (same query+variables) a cached value is returned, no HTTP requests performed.

# Usage

Install:

```shell script
npm i mini-graphql-http-client
```

## Creating the client object instance

### Node.js

```js
const MiniGraphqlHttpClient = require("mini-graphql-http-client");

const graphqlClient = MiniGraphqlHttpClient({
  uri: "example.com/graphql",
  fetch: require("node-fetch"),
});
```

### Modern browsers

```js
import MiniGraphqlHttpClient from "mini-graphql-http-client";

const graphqlClient = MiniGraphqlHttpClient({
  uri: "example.com/graphql",
});
```

### IE browser

You must polyfil `fetch` and ES6 `Map` global variables.

### Querying

```js
try {
  const { data, errors } = await graphqlClient.query({
    query: `{ hero { name height mass } }`,
  });
  if (errors && errors.length)
    console.error("GraphQL response contains errors", errors);

  if (data && data.hero)
    console.log(`Hero ${data.hero.name} height is ${data.hero.height}`);
} catch (e) {
  console.error("HTTP request failed", e);
}
```

# API

## MiniGraphqlHttpClient()

Example showing all available options.

```js
const graphqlClient = MiniGraphqlHttpClient({
  // This is the only required argument
  uri: "example.com/graphql", // Your GraphQL endpoint.

  // All the below are optional.

  // The HTTP method of the requests.
  method: "PUT", // default is "POST"

  // The `fetch` implementation.
  fetch: require("unfetch"), // Will attempt to use global `fetch`.

  // Number of retries if HTTP request fails - network error or 5xx response.
  retry: 2, // Default is 0. The value 2 would mean we do total 3 attempts. 
    
  // Arbitrary headers to send with every HTTP request.
  headers: { Token: mySecureToken }, // Only "content-type":"application/json" is added by default.

  // The well known `fetch` option. https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
  credentials: "omit", // default is "include"

  // Control various aspect of the cache via this argument.
  cache: {
    // For how long a query response will be cached.
    duration: 60 * 1000, // default is Number.MAX_SAFE_INTEGER, i.e. indefinite
    // Cache map itself. By default it's ES6 Map.
    map: new Map(), // Provide your own cache map. Useful to reuse cache across several client instances. Overrides `jsonCache`.
    // Your cache initial state as a POJO (Plain Old JavaScript Object). Use it for hydration.
    jsonCache: [], // Initialise your cache with a JSON data. See cacheToJSON() method.
  },

  // Hook callbacks. Useful for logging or debugging purposes.
  hooks: {
    // A callback function called before each request.
    request({ query, variables, cacheDuration, uri, fetchOptions }) {
      /*...*/
    },
    // A callback function called after each request.
    response({
      query,
      variables,
      cacheDuration,
      uri,
      fetchOptions,
      response,
      json,
      error,
    }) {
      /*...*/
    },
  },
});
```

## Methods

Let's look what you can do with the `graphqlClient` from the above.

### .query({...})

Send an HTTP request containing JSON data with two properties: `query` and `variables`.

```js
const { data, errors } = await graphqlClient.query({
  // This is the only required argument
  query: `query($input: OrdersInput) { orders(input: $input) { totalAmount items { id price title } } }`,

  // All the below are optional.

  // GraphQL variables
  variables: { input: { from: "2020-07-01", to: "2021-06-30" } },

  // Additional arbitrary request headers.
  headers: { version: "2" },

  // Override the default caching duration for this particular query.
  cacheDuration: 60 * 60_000,
});
```

### .mutate({...})

Send an HTTP request containing JSON data with two properties: `query` (not "mutation"!) and `variables`. The responses are never cached.

```js
const { data, errors } = await graphqlClient.mutate({
  // This is the only required argument
  mutation: `mutation($input: CreateOrderInput) { createOrder(input: $input) { success code message } }`,

  // All the below are optional.

  // GraphQL variables
  variables: { input: { user_id: "DABE25B9-C1EF-4087-880B-CD97E3E38393" } },

  // Additional arbitrary request headers.
  headers: { version: "2" },
});
```

### .clearCache()

Clears the cache map.

```js
graphqlClient.clearCache();
```

### .cacheToJSON()

Get POJO of your cache (perhaps on the server?).

```js
const cachePojo = graphqlClient.cacheToJSON();
```

Use the POJO to create a new client (perhaps in the browser?).

```js
const graphqlClient = MiniGraphqlHttpClient({
  uri: "example.com/graphql",
  cache: { jsonCache: cachePojo },
});
```

# How-To's

## Log every request and response

Use the hooks.

```js
const graphqlClient = MiniGraphqlHttpClient({
  uri: "example.com/graphql",

  hooks: {
    request: ({ query }) => console.log(query),
    response: ({ json, error }) =>
      error ? console.log(error) : console.log(json),
  },
});
```

## Having the same cache in two client instances

```js
const cacheMap = new Map();

const graphqlClient1 = MiniGraphqlHttpClient({
  uri: "example.com/graphql",
  cache: { map: cacheMap },
});
const graphqlClient2 = MiniGraphqlHttpClient({
  uri: "example.com/graphql",
  cache: { map: cacheMap },
});
```
