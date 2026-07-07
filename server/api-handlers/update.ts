// POST /api/update — pull the latest code from GitHub and rebuild, in place.
//
// The host serves the built frontend from dist/ on every request, so a
// frontend-only change goes live the moment the rebuild finishes + you refresh
// — no process restart. Only server-code changes (server/** or package.json)
// need the host process restarted, which we detect and report.
//
// Gated behind requireContext (must be logged in). Runs FIXED commands only —
// no user input is interpolated, so there's no injection surface.

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { sendJson, methodNotAllowed, requireContext, type Req, type Res } from './http-utils.ts'

const execAsync = promisify(exec)
const CWD = process.cwd()

async function run(cmd: string): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: CWD, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 })
    return { ok: true, out: `${stdout}${stderr}`.trim() }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`.trim() }
  }
}

export async function handleUpdate(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = await requireContext(req, res) // authed only (401 otherwise)
  if (!ctx) return

  const before = await run('git rev-parse HEAD')
  if (!before.ok) { sendJson(res, 500, { ok: false, stage: 'git', message: `Not a git checkout or git unavailable: ${before.out}` }); return }

  const pull = await run('git pull --ff-only')
  if (!pull.ok) { sendJson(res, 500, { ok: false, stage: 'pull', message: `git pull failed:\n${pull.out}` }); return }

  const after = await run('git rev-parse HEAD')
  if (before.out && after.out && before.out === after.out) {
    sendJson(res, 200, { ok: true, upToDate: true, message: 'Already up to date.' })
    return
  }

  const diff = await run(`git diff --name-only ${before.out} ${after.out}`)
  const changed = diff.out.split(/\r?\n/).filter(Boolean)
  const serverChanged = changed.some((f) => f.startsWith('server/') || f === 'package.json' || f === 'package-lock.json')

  const install = await run('npm install')
  if (!install.ok) { sendJson(res, 500, { ok: false, stage: 'install', message: `npm install failed:\n${install.out}` }); return }

  // build = tsc -b && vite build; if tsc fails, dist/ is left untouched (old
  // working build stays), so a bad update never serves a broken frontend.
  const build = await run('npm run build')
  if (!build.ok) { sendJson(res, 500, { ok: false, stage: 'build', message: `Build failed — kept the previous version.\n${build.out}` }); return }

  sendJson(res, 200, {
    ok: true,
    upToDate: false,
    changedCount: changed.length,
    restartNeeded: serverChanged,
    message: serverChanged
      ? `Updated ${changed.length} file(s). Server code changed — restart the host to finish, then refresh.`
      : `Updated ${changed.length} file(s). Refresh to see the changes.`,
  })
}
