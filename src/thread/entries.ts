/**
 * All PicoLines (session_meta, response_item, event_msg, branch_out)
 * move the leaf. Branching always lands on the new branch node.
 */

import type { PicoLine } from "./types";

export function entryMovesLeaf(_entry: PicoLine): boolean {
  return true;
}
