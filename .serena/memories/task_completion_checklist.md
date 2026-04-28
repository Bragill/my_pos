# Task Completion Checklist

When a task is completed, ensure the following:

1. **Verify Changes**:
   - For backend: Ensure API endpoints work as expected.
   - For frontend: Ensure UI renders correctly and handles state properly.
2. **Database Integrity**:
   - If schema changed, update `migrate.js` and run it.
   - Verify `pos_system.db` is correctly updated.
3. **PWA/Offline**:
   - If changes affect offline data, verify IndexedDB interactions in `frontend/src/services/`.
4. **Environment**:
   - Ensure no secrets are hardcoded; use `.env` if necessary.
5. **Linting/Formatting**:
   - Maintain consistency with existing code style (standard JS/JSX).
6. **Testing**:
   - Manually test the flow (e.g., adding to cart, checkout) to ensure no regressions.
