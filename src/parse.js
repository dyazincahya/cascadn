import { ParseError } from "./errors.js";

const DEFAULT_REF = "main";

function stripQueryAndHash(value) {
  return value.split("#")[0].split("?")[0];
}

function stripGitSuffix(repo) {
  return repo.replace(/\.git$/i, "");
}

function stripSlashes(path) {
  return String(path).replace(/^\/+|\/+$/g, "");
}

/**
 * Memisahkan bagian "ref/path" menjadi { ref, path }.
 * Mendukung bentuk polos ("main/file.json") maupun bentuk lengkap
 * ("refs/heads/main/file.json", "refs/tags/v1/file.json").
 */
function splitRefAndPath(rest) {
  const refsMatch = rest.match(/^refs\/(?:heads|tags|remotes)\/(.+)$/i);
  const body = refsMatch ? refsMatch[1] : rest;
  const separator = body.indexOf("/");

  if (separator === -1) return { ref: body, path: "" };
  return { ref: body.slice(0, separator), path: body.slice(separator + 1) };
}

function finalize({ owner, repo, ref, path }, original) {
  const cleanPath = stripSlashes(path);
  const cleanOwner = String(owner || "").trim();
  const cleanRepo = stripGitSuffix(String(repo || "").trim());

  if (!cleanOwner || !cleanRepo) {
    throw new ParseError("Owner dan repo tidak dapat ditentukan dari sumber yang diberikan", original);
  }
  if (!cleanPath) {
    throw new ParseError("Path file tidak dapat ditentukan dari sumber yang diberikan", original);
  }

  const cleanRef = String(ref || DEFAULT_REF).trim() || DEFAULT_REF;

  return {
    type: "github",
    owner: cleanOwner,
    repo: cleanRepo,
    ref: cleanRef,
    path: cleanPath,
    // URL GitHub kanonik, selalu tersedia walaupun input berupa objek.
    githubUrl: `https://github.com/${cleanOwner}/${cleanRepo}/blob/${cleanRef}/${cleanPath}`,
  };
}

function fromObject(input) {
  const owner = input.owner ?? input.user ?? input.username;
  const repo = input.repo ?? input.repository ?? input.name;
  const ref = input.ref ?? input.branch ?? input.version ?? DEFAULT_REF;
  const path = input.path ?? input.file ?? "";

  if (!owner || !repo) {
    throw new ParseError('Input objek membutuhkan "owner" (atau "user") dan "repo"');
  }
  if (!path) {
    throw new ParseError('Input objek membutuhkan "path"');
  }

  return finalize({ owner, repo, ref, path }, null);
}

const GITHUB_PAGE = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/(?:blob|raw)\/(.+)$/i;
const GITHUB_RAW_HOST = /^https?:\/\/raw\.githubusercontent\.com\/([^/\s]+)\/([^/\s]+)\/(.+)$/i;
const JSDELIVR_GH = /^https?:\/\/cdn\.jsdelivr\.net\/gh\/([^/\s]+)\/([^/@\s]+)(?:@([^/\s]+))?\/(.+)$/i;
const STATICALLY_GH = /^https?:\/\/cdn\.statically\.io\/gh\/([^/\s]+)\/([^/@\s]+)(?:@([^/\s]+))?\/(.+)$/i;

/**
 * Menormalkan berbagai bentuk input GitHub menjadi deskriptor sumber kanonik.
 * Menerima URL GitHub, URL raw, URL CDN, atau objek { owner, repo, ref, path }.
 *
 * @param {string | { owner?: string, user?: string, repo?: string, ref?: string, branch?: string, version?: string, path?: string }} input
 * @returns {{ type: "github", owner: string, repo: string, ref: string, path: string, original: string | null }}
 */
export function parseSource(input) {
  if (input === null || input === undefined) {
    throw new ParseError("Sumber wajib diisi");
  }
  if (typeof input === "object") return fromObject(input);

  const raw = String(input).trim();
  if (!raw) throw new ParseError("Sumber wajib diisi");

  const cleaned = stripQueryAndHash(raw);
  let match;

  if ((match = cleaned.match(GITHUB_PAGE))) {
    const { ref, path } = splitRefAndPath(match[3]);
    return finalize({ owner: match[1], repo: match[2], ref, path }, raw);
  }

  if ((match = cleaned.match(GITHUB_RAW_HOST))) {
    const { ref, path } = splitRefAndPath(match[3]);
    return finalize({ owner: match[1], repo: match[2], ref, path }, raw);
  }

  if ((match = cleaned.match(JSDELIVR_GH))) {
    return finalize({ owner: match[1], repo: match[2], ref: match[3], path: match[4] }, raw);
  }

  if ((match = cleaned.match(STATICALLY_GH))) {
    return finalize({ owner: match[1], repo: match[2], ref: match[3], path: match[4] }, raw);
  }

  throw new ParseError(`Sumber tidak didukung: ${raw}`, raw);
}
