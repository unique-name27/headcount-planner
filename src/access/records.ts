/**
 * The records guard at the path the UX layer imports (docs/PLAN.md 17, M2 freeze stubs:
 * `access/records` `rowsInScope` and the position-in-scope check). The guard itself is
 * ./scopes/records.ts.
 */
export {
  inScope,
  personInScope,
  positionInScope,
  rowsInScope,
  type ScopeCtx,
  type ScopeHolder,
  scopeOfAccess,
} from './scopes/records'
