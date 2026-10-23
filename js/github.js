/* Publishes files to your GitHub repository with the GitHub Contents API.
   The token is typed by the owner in the dashboard and is never stored in the code or the repo. */
(function () {
  "use strict";

  const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

  function friendly(status, msg) {
    if (status === 401) return "GitHub rejected the token (mistyped or expired). Create a new one and try again.";
    if (status === 403) return "GitHub refused the request. The token needs “Contents: Read and write” permission on this repository (or you hit a rate limit — wait a minute).";
    if (status === 404) return "Repository or branch not found. Check the “owner/repository” name and that the token can access it.";
    if (status === 409) return "GitHub reported a conflict (someone else just committed). Wait a moment and publish again.";
    return "GitHub error " + status + (msg ? ": " + msg : "");
  }

  async function api(token, path, opts) {
    opts = opts || {};
    let res;
    try {
      res = await fetch("https://api.github.com" + path, {
        method: opts.method || "GET",
        cache: "no-store",
        headers: Object.assign({
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "X-GitHub-Api-Version": "2022-11-28",
        }, opts.body ? { "Content-Type": "application/json" } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new Error("Couldn't reach GitHub. Check your internet connection.");
    }
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      let msg = ""; try { msg = (await res.json()).message; } catch (e) { /* ignore */ }
      const err = new Error(friendly(res.status, msg)); err.status = res.status; throw err;
    }
    return res.status === 204 ? {} : res.json();
  }

  const b64Text = (s) => { const b = new TextEncoder().encode(s); let bin = ""; b.forEach((x) => (bin += String.fromCharCode(x))); return btoa(bin); };
  const fromB64 = (s) => { const bin = atob(String(s).replace(/\s/g, "")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };

  const getFile = (t, repo, branch, path) => api(t, `/repos/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`, { allow404: true });

  async function listDir(t, repo, branch, path) {
    const r = await api(t, `/repos/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`, { allow404: true });
    return Array.isArray(r) ? r : [];
  }

  async function putFile(t, repo, branch, path, b64, message) {
    const existing = await getFile(t, repo, branch, path);
    return api(t, `/repos/${repo}/contents/${enc(path)}`, {
      method: "PUT",
      body: Object.assign({ message, content: b64, branch }, existing && existing.sha ? { sha: existing.sha } : {}),
    });
  }

  const deleteFile = (t, repo, branch, path, sha, message) =>
    api(t, `/repos/${repo}/contents/${enc(path)}`, { method: "DELETE", body: { message, sha, branch } });

  /** Check that the repo exists and the token may write to it. */
  async function verify(t, repo) {
    const r = await api(t, `/repos/${repo}`);
    if (r.permissions && r.permissions.push === false) throw new Error("This token can read the repository but not write to it. Give it “Contents: Read and write”.");
    return r;
  }

  window.QMGitHub = { verify, getFile, listDir, putFile, deleteFile, b64Text, fromB64 };
})();
