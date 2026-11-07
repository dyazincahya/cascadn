// Contoh 4: konfigurasi lanjutan — provider kustom, urutan fallback, header, retry.
// Jalankan: node examples/04-custom-provider.mjs

import { createClient } from "cascadn";

const GITHUB_URL =
  "https://github.com/dyazincahya/iqro-json/blob/main/hijaiyah-letters.json";

// Provider kustom cukup punya { id, name, buildUrl(source) }.
// Di sini kita pakai proxy GitHub dari unpkg sebagai provider tambahan.
const unpkgGh = {
  id: "unpkg-gh",
  name: "unpkg (GitHub)",
  buildUrl: ({ owner, repo, ref, path }) =>
    `https://unpkg.com/gh/${owner}/${repo}@${ref}/${path}`,
};

const client = createClient({
  // urutan prioritas fallback sepenuhnya bisa diatur
  providers: ["jsdelivr", "statically", unpkgGh, "github-raw"],
  timeout: 5000,
  retries: 1,
  retryDelay: 200,
  headers: { Accept: "application/json" },
  cacheTTL: 30_000,
});

console.log("1) urutan provider yang dikonfigurasi");
for (const item of client.buildCdnUrls(GITHUB_URL)) {
  console.log(`   [${item.id}] ${item.cdnUrl}`);
}

console.log("\n2) eksekusi dengan fallback");
const res = await client.fetchJson(GITHUB_URL);
console.log(`   provider terpakai: ${res.provider}`);
console.log(`   jumlah item      : ${res.data.length}`);
console.log(`   attempts         : ${res.attempts.map((a) => `${a.provider}:${a.ok}`).join(" | ")}`);

// 3. Ubah urutan fallback hanya untuk satu pemanggilan
console.log("\n3) override urutan per pemanggilan (GitHub Raw didahulukan)");
const rawFirst = await client.fetchJson(GITHUB_URL, {
  providers: ["github-raw", "jsdelivr"],
  skipCache: true,
});
console.log(`   provider terpakai: ${rawFirst.provider}`);

// 4. Mode teks mentah (tanpa JSON.parse)
console.log("\n4) parseJson: false -> teks mentah");
const text = await client.fetchJson(GITHUB_URL, { parseJson: false, skipCache: true });
console.log(`   tipe data: ${typeof text.data}, panjang: ${text.data.length} karakter`);
