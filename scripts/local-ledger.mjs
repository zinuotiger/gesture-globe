import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Public checkouts have no private ledger. Absence is a state to preserve,
// not permission to create one or to ignore a different filesystem error.
export async function readLocalLedger(root) {
  try {
    return await readFile(path.join(root, '.gesture-globe/state.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
