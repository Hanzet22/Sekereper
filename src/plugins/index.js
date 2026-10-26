'use strict';

// Extension contract: adapters are registered explicitly by the host application.
// A parser receives bounded text plus metadata and returns a JSON-serializable object.
const adapters = new Map();
function registerAdapter({ id, version = '1', mediaTypes = [], parse }) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(id)) throw new Error('Adapter id must be 2-64 safe characters');
  if (typeof parse !== 'function') throw new Error('Adapter parse must be a function');
  if (adapters.has(id)) throw new Error(`Adapter already registered: ${id}`);
  const adapter = Object.freeze({ id, version: String(version), mediaTypes: [...mediaTypes], parse });
  adapters.set(id, adapter);
  return () => adapters.delete(id);
}
function listAdapters() {
  return [...adapters.values()].map(({id,version,mediaTypes}) => ({id,version,mediaTypes}));
}
async function runAdapter(id, input, metadata = {}) {
  const adapter = adapters.get(id);
  if (!adapter) throw new Error('Unknown adapter');
  if (typeof input !== 'string') throw new Error('Adapter input must be text');
  if (Buffer.byteLength(input) > 3_000_000) throw new Error('Adapter input exceeds 3 MB');
  const output = await adapter.parse(input, Object.freeze({...metadata}));
  if (output === undefined) throw new Error('Adapter returned no result');
  return JSON.parse(JSON.stringify(output));
}
module.exports = { registerAdapter, listAdapters, runAdapter };
