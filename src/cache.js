/**
 * Cache in-memory berbasis TTL dengan eviksi LRU sederhana.
 * Implementasi ini kompatibel dengan antarmuka CacheAdapter
 * (get / set / delete / clear), sehingga bisa diganti adapter lain.
 */
export class MemoryCache {
  constructor({ ttl = 300000, max = 100 } = {}) {
    this.ttl = ttl;
    this.max = max;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Pindahkan ke urutan paling akhir supaya tidak cepat ter-evict (LRU).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttl) {
    const effectiveTtl = ttl ?? this.ttl;

    if (this.store.has(key)) this.store.delete(key);
    while (this.store.size >= this.max) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: effectiveTtl > 0 ? Date.now() + effectiveTtl : null,
    });

    return this;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}
