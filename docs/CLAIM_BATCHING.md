# Claim microbatch design

Current design and failure contract:

- No response before transaction commit.
- Conditional status/deadline reservation plus claim and notification insert share one transaction.
- Each batch <=200. Different batches/processes retain transaction conflict/retry semantics.
- Duplicate same NGO returns same claim and no extra notification; other NGOs receive409.
- Invalid listing/deadline/self-claim rejects individually. Storage failure rejects whole batch with no successful response.
- Pending requests bounded1000. Process crash before commit leaves no successful response; committed state remains discoverable by same-NGO idempotent retry.
- Live user/NGO reads group only overlapping requests; completed data is not cached across mutations.
- Generated lean rows include explicit IDs/timestamps/pickup codes. Strict request schemas remain before this internal path.
- Known consideration: batch-wide storage failure increases correlated retries. This is explicit, not a partial-success promise.

The claim-creation window is25ms and a transaction contains at most200 requests. Outstanding queue capacity is1000; excess requests receive503 rather than growing memory without limit. A batch failure can cause several unrelated callers to retry, but none receives a successful response for rolled-back state. Notifications are persisted before responses. Same-NGO retries recover the committed claim without another notification.

Concurrent instances do not share a queue. They still coordinate through MongoDB conditional writes and transaction conflict retries. Unit/integration tests cover multi-listing write failure, notice-insert failure, mismatched compare-and-swap count, same/other NGO races, overlapping batch windows, timestamps/pickup codes, and current approval revocation. Multi-instance production load remains a deployment validation concern, not a local performance claim.

Transactions now run serially within one process to prevent competing commit bursts. The1000request cap covers both waiting and in-flight requests; completion or failure releases capacity. This is not a global lock: other instances still rely on MongoDB conflict retries and compare-and-swap.
