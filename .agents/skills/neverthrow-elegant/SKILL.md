---
name: neverthrow-elegant
description: Master elegant, idiomatic neverthrow patterns that prioritize readability, composability, and business logic flow. Use when writing type-safe error handling code in TypeScript/JavaScript, composing Result/ResultAsync chains, designing domain error types, or reviewing code for clarity over correctness alone. Emphasize expressive chains over branching, semantic error types over strings, and side-effect isolation over deep nesting.
---

# Elegant Neverthrow Patterns

## Goal

Write Result/ResultAsync code that reads like business logic, not error handling. Achieve clarity through composition, semantic error types, and method chains that express intent.

## Anti-Patterns: Avoid These

### ❌ Excessive Manual Branching

Bad: Repeatedly checking `.isOk()` / `.isErr()` throughout the code:

```ts
const result = await loadUser(id);
if (result.isErr()) {
  return { error: result.error };
}
const user = result.value;
const profile = await loadProfile(user.id);
if (profile.isErr()) {
  return { error: profile.error };
}
// ...
```

**Why it fails:** Breaks composability. Each operation requires stop-and-check logic.

**✅ Better: Chain with `.andThen()`**

```ts
const userWithProfile = await loadUser(id)
  .andThen(user => loadProfile(user.id)
    .map(profile => ({ user, profile }))
  );
```

### ❌ Generic Error Strings

Bad: Errors are opaque strings that force callers to parse:

```ts
type Result<T> = { value: T; error: string | null };
// Caller: if (result.error.includes("not-found")) { ... }
```

**Why it fails:** Type-unsafe, unscalable error handling. Caller must know exact error message.

**✅ Better: Semantic Error Union**

```ts
type LoadError = "user-not-found" | "db-connection-failed" | "permission-denied";

function loadUser(id: string): ResultAsync<User, LoadError> { ... }

// Caller: Exhaustive match at compile time
const result = await loadUser(id);
if (result.isErr()) {
  switch (result.error) {
    case "user-not-found": // ...
    case "db-connection-failed": // ...
    case "permission-denied": // ...
  }
}
```

### ❌ Ignoring Tee Methods (andTee, orTee)

Bad: Mixing logging into success/error paths:

```ts
function createUser(user: User): ResultAsync<User, CreateError> {
  return insertIntoDb(user)
    .map(created => {
      console.log("User created:", created.id);  // Pollutes happy path
      return created;
    })
    .mapErr(err => {
      logger.error("Create failed", err);  // Pollutes error path
      return err;
    });
}
```

**Why it fails:** Mixes concerns. Logging becomes part of business logic transformation.

**✅ Better: Use Tee Methods**

```ts
function createUser(user: User): ResultAsync<User, CreateError> {
  return insertIntoDb(user)
    .andTee(created => console.log("User created:", created.id))
    .orTee(err => logger.error("Create failed", err));
}
```

Side effects pass through; original value/error flows untouched.

### ❌ Deeply Nested Async Operations

Bad: Closure-based nesting:

```ts
return loadTeam(teamId).andThen(team => 
  loadMembers(team.id).andThen(members => 
    validatePermissions(user, team).andThen(() => 
      applyChanges(team, members, changes).andThen(result => 
        notifyMembers(result.changes).map(() => result)
      )
    )
  )
);
```

**Why it fails:** Hard to follow logic. Variable scope is implicit.

**✅ Better: Break into Named Functions + Through Pattern**

```ts
const applyAndNotify = (team: Team, members: Member[], changes: Changes) =>
  applyChanges(team, members, changes)
    .andThrough(result => notifyMembers(result.changes));

return loadTeam(teamId)
  .andThen(team => loadMembers(team.id).map(members => ({ team, members })))
  .andThrough(({ team }) => validatePermissions(user, team))
  .andThen(({ team, members }) => applyAndNotify(team, members, changes));
```

**Through pattern**: Return original value; pass through side effect; let caller see the data flow.

### ❌ Mixing Promise Patterns

Bad: Awaiting before matching or combining:

```ts
const r1 = await getUserAsync(id);
const r2 = await getPostsAsync(userId);
if (r1.isErr() || r2.isErr()) {
  return err(...);
}
// Process r1.value and r2.value
```

**Why it fails:** Lose type safety on combined results. Force awaits.

**✅ Better: Combine at the Async Level**

```ts
const combined = ResultAsync.combine([
  getUserAsync(id),
  getPostsAsync(userId)
]);

const userWithPosts = await combined.map(([user, posts]) => ({ user, posts }));
```

No await until you're ready to handle both errors at once.

## Best Practices: Do These

### ✅ Semantic Error Types

Design error types that map to domain concerns, not implementation details:

```ts
// ❌ Bad: Leaks internals
type DbError = "UNIQUE_CONSTRAINT_VIOLATION" | "CONNECTION_TIMEOUT" | "DEADLOCK";

// ✅ Good: Domain-focused
type AuthError = "invalid-credentials" | "user-not-found" | "account-locked";
type WriteError = "user-already-exists" | "permission-denied" | "quota-exceeded";
```

**Rule of thumb:** Errors should answer "What business operation failed?" not "What database threw?"

### ✅ Compose Error Paths with orElse

Use `.orElse()` for error recovery and fallback chains:

```ts
// Try to load from cache, fall back to DB
const getUser = (id: string): ResultAsync<User, FetchError> =>
  loadFromCache(id)
    .orElse(() => loadFromDb(id))
    .orElse(() => loadFromRemote(id));
```

Each `orElse` callback receives the previous error and decides whether to recover or propagate.

### ✅ Use match for Exhaustive Handling

When you need to convert Result to a concrete value (view model, response object):

```ts
// Converts ResultAsync<User, UserError> → Promise<UserResponse>
const response = await loadUser(id).match(
  (user) => ({ ok: true, data: user }),
  (error) => ({ ok: false, reason: error })
);
```

`match` enforces you handle both branches and return the same type from each.

### ✅ Isolate Side Effects with Tee

Log, persist, notify **after** the main chain:

```ts
const createAndBroadcast = (data: Data) =>
  insertIntoDb(data)
    .andTee(created => logger.info("Created", created))
    .andThen(created => publishEvent("data.created", created))
    .orTee(error => logger.error("Creation failed", error));
```

Tee methods don't change the Result; they're pure side effects.

### ✅ Combine Multiple Results Elegantly

Aggregate independent operations:

```ts
// Fetch all resources in parallel, fail if ANY error
const resources = await ResultAsync.combine([
  loadConfig(appId),
  loadUsers(appId),
  loadSecrets(appId)
]).map(([config, users, secrets]) => ({ config, users, secrets }));

// Or keep all errors
const all = await ResultAsync.combineWithAllErrors([...]);
if (all.isErr()) {
  console.log("Failed with errors:", all.error); // Error is an array
}
```

### ✅ Name Intermediate Transformations

Break long chains into named steps for readability:

```ts
const normalizeEmail = (email: string) => email.toLowerCase().trim();
const validateEmail = (email: string): Result<string, "invalid-email"> => 
  email.includes("@") ? ok(email) : err("invalid-email");

const processUser = (user: User) =>
  ok(user.email)
    .map(normalizeEmail)
    .andThen(validateEmail)
    .map(validEmail => ({ ...user, email: validEmail }));
```

Each `.map()` and `.andThen()` is a named, testable transformation.

### ✅ Use Result Factory Functions

Wrap third-party APIs consistently:

```ts
// Centralize exception wrapping
const queryDb = <T>(sql: string): ResultAsync<T, DbError> =>
  ResultAsync.fromThrowable(
    () => db.query<T>(sql),
    (error) => {
      if (error instanceof TimeoutError) return "query-timeout";
      if (error instanceof ConnectionError) return "db-unavailable";
      return "query-failed";
    }
  )();

const fetchUsers = (): ResultAsync<User[], DbError> => 
  queryDb<User>("SELECT * FROM users");
```

Callers don't need to know about exceptions; they only see the domain error type.

### ✅ Compose Recovery Strategies

Build resilience through layered `.orElse()` calls:

```ts
const robustLoadUser = (id: string) =>
  primaryCache.get(id)
    .orElse(() => secondaryCache.get(id))
    .orElse(() => database.get(id))
    .orElse(() => 
      remoteService.get(id)
        .andTee(user => primaryCache.set(id, user))  // Cache for next time
    );
```

Each layer is independent; earlier successes are returned immediately.

## Pattern Gallery

### Request → Validate → Transform → Persist

```ts
type ValidateError = "invalid-email" | "invalid-age" | "duplicate-user";
type PersistError = "db-unavailable" | "quota-exceeded";

const createUserFlow = (input: unknown): ResultAsync<User, ValidateError | PersistError> =>
  ok(input)
    .andThen(parseUserInput)              // unknown → User | ValidateError
    .andThen(user => validateUser(user))  // User → User | ValidateError
    .map(user => enrichUser(user))        // User → EnrichedUser
    .andThen(user => persistUser(user));  // EnrichedUser → User | PersistError
```

Each step is composable and independently testable.

### Parallel Operations with Error Aggregation

```ts
const fetchDashboard = (userId: string): ResultAsync<Dashboard, DashboardError> =>
  ResultAsync.combine([
    loadUserProfile(userId),
    loadRecentPosts(userId),
    loadNotifications(userId)
  ])
    .mapErr(firstError => "dashboard-load-failed" as const)
    .map(([profile, posts, notifications]) => 
      new Dashboard(profile, posts, notifications)
    );
```

Short-circuits on first error; `combine` preserves error types.

### Error Recovery with Fallback Chains

```ts
const smartLoadConfig = (): ResultAsync<Config, "config-unavailable"> =>
  loadFromFile("config.local.json")
    .orElse(() => loadFromEnvironment())
    .orElse(() => loadFromDefaults())
    .orElse(() => errAsync("config-unavailable"));
```

Each fallback is tried in order; original error is lost (OK for fallback chains).

## Testing Elegant Results

### Test Success Paths

```ts
const result = await createUser({ name: "Alice", email: "alice@example.com" });
expect(result).toEqual(ok(expect.objectContaining({ name: "Alice" })));
```

### Test Error Paths

```ts
const result = await createUser({ name: "", email: "alice@example.com" });
expect(result).toEqual(err("invalid-name"));
```

### Test Chaining Behavior

```ts
const chain = ok(5)
  .map(n => n * 2)
  .andThen(n => n > 5 ? ok(n) : err("too-small"));
expect(chain).toEqual(ok(10));
```

### Avoid Unwrapping in Tests Unless Necessary

```ts
// ❌ Avoid .safeUnwrap() or ._unsafeUnwrap() in tests
// ✅ Use expect(result).toEqual(ok(...))
```

## When NOT to Use Neverthrow

- **Assertions:** Use thrown errors for impossible states (bad input from untrusted source → Result; violates precondition → throw)
- **Control flow:** Don't use Result as `if`/`else` replacement for normal conditionals
- **Framework boundaries:** Frameworks that expect thrown errors (Express middleware, React error boundaries) need bridge functions

## References

- **neverthrow docs:** https://github.com/supermacro/neverthrow  
- **Design philosophy:** Results encode failure into types; promises/exceptions don't
- **Related skill:** `neverthrow-wrap-exceptions` for converting existing throw-based code
