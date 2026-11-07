// Contoh 2: fallback berjenjang jsDelivr -> Statically -> GitHub Raw.
// Jalankan: node examples/02-fallback.mjs

import { createClient, FetchError } from "cascadn";

const GITHUB_URL =
  "https://github.com/dyazincahya/iqro-json/blob/main/hijaiyah-letters.json";

// --- Kasus A: jsDelivr sedang gangguan, sisanya normal ---
// `fetch` disuntik supaya jsDelivr gagal, provider lain tetap request asli.
const flakyFetch = (url, init) => {
  if (url.includes("cdn.jsdelivr.net")) {
    return Promise.reject(new Error("simulasi: jsDelivr down"));
  }
  return fetch(url, init);
};

const client = createClient({ fetch: flakyFetch, cache: false, timeout: 8000 });

const res = await client.fetchJson(GITHUB_URL);
console.log("A) jsDelivr down -> otomatis pindah provider");
console.log(`   provider yang berhasil : ${res.provider}`);
console.log("   riwayat percobaan:");
for (const attempt of res.attempts) {
  const status = attempt.ok ? "OK" : `GAGAL (${attempt.error})`;
  console.log(`     - ${attempt.provider}: ${status}`);
}

// --- Kasus B: semua provider gagal -> FetchError berisi detail attempts ---
const offlineClient = createClient({
  cache: false,
  fetch: () => Promise.reject(new Error("koneksi terputus")),
});

console.log("\nB) semua provider gagal");
try {
  await offlineClient.fetchJson(GITHUB_URL);
} catch (error) {
  if (error instanceof FetchError) {
    console.log(`   ${error.message}`);
    console.log(`   jumlah percobaan: ${error.attempts.length}`);
    console.log(`   sumber: ${error.source.owner}/${error.source.repo}@${error.source.ref}`);
  } else {
    throw error;
  }
}

// --- Kasus C: file tidak ada -> setiap provider 404 -> FetchError ---
console.log("\nC) file tidak ada (semua provider 404)");
try {
  await createClient({ cache: false }).fetchJson(
    "https://github.com/dyazincahya/iqro-json/blob/main/file-yang-tidak-ada.json",
  );
} catch (error) {
  const statuses = error.attempts.map((a) => `${a.provider}=${a.status}`);
  console.log(`   status tiap provider: ${statuses.join(", ")}`);
}
