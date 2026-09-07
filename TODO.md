# Project Roadmap & TODOs

## Shortcode Lifecycle & Expiration

- [x] **Auto-Recycle Expired Guest Shortcodes**
  - **Problem**: Links created by guest users (`user_id IS NULL`) have a 30-day expiration window. Because guest users do not have an account dashboard to manage or delete links, once a guest link expires, the shortcode remains locked in the database indefinitely.
  - **Proposed Solution**:
    1. When a new link creation request (`POST /shorten`) targets a custom code or collides with an existing code:
       - Check if the existing record was created by a guest user (`user_id IS NULL`) and has expired (`expires_at < NOW()`).
       - If expired, automatically deactivate the old guest record (`UPDATE urls SET is_active = false WHERE short_code = $1 AND user_id IS NULL AND expires_at < NOW()`) and allow the new link to claim the alias.
    2. Evict the old shortcode from Redis cache (`cache.Delete(ctx, code)`).
- [x] **Deleting Expired Links & Purge Handling**
  - **Problem**: Users cannot easily remove expired links from their history/catalog, and deleting expired links shouldn't return errors if the link is already expired or inactive.
  - **Proposed Solution**:
    1. Update the delete endpoint/handler (`DELETE /:code`) so that deleting an expired link (both for registered users and guest history) cleanly deactivates/removes it from view and frees the shortcode immediately.
    2. Add a "Clear All Expired Links" batch delete action on the Dashboard.
    3. Ensure guest users can remove expired links from their local session/history without backend permission issues.

---

## Infrastructure & Performance (Phase 3)

- [ ] **Distributed Singleflight (Redis SETNX Locks)**: Replace/supplement in-process singleflight with a distributed Redis lock across multi-node instances.
- [ ] **Asynchronous Click Batching**: Buffer click events in Redis Streams or Kafka and batch write to PostgreSQL.
- [ ] **Database Read Replicas & Sharding**: Route cache-miss reads to read replicas.
