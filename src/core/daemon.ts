import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { expandHome } from './config.js'

const DEFAULT_PID_PATH = path.join(os.homedir(), '.openacp', 'openacp.pid')
const DEFAULT_LOG_DIR = path.join(os.homedir(), '.openacp', 'logs')

export function writePidFile(pidPath: string, pid: number): void {
  const dir = path.dirname(pidPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(pidPath, String(pid))
}

export function readPidFile(pidPath: string): number | null {
  try {
    const content = fs.readFileSync(pidPath, 'utf-8').trim()
    const pid = parseInt(content, 10)
    return isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

export function removePidFile(pidPath: string): void {
  try {
    fs.unlinkSync(pidPath)
  } catch {
    // ignore if already gone
  }
}

export function isProcessRunning(pidPath: string): boolean {
  const pid = readPidFile(pidPath)
  if (pid === null) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    // Process not running, clean up stale PID file
    removePidFile(pidPath)
    return false
  }
}

export function getStatus(pidPath: string = DEFAULT_PID_PATH): { running: boolean; pid?: number } {
  const pid = readPidFile(pidPath)
  if (pid === null) return { running: false }
  try {
    process.kill(pid, 0)
    return { running: true, pid }
  } catch {
    removePidFile(pidPath)
    return { running: false }
  }
}

export function startDaemon(pidPath: string = DEFAULT_PID_PATH, logDir?: string): { pid: number } | { error: string } {
  // Check if already running
  if (isProcessRunning(pidPath)) {
    const pid = readPidFile(pidPath)!
    return { error: `Already running (PID ${pid})` }
  }

  const resolvedLogDir = logDir ? expandHome(logDir) : DEFAULT_LOG_DIR
  fs.mkdirSync(resolvedLogDir, { recursive: true })
  const logFile = path.join(resolvedLogDir, 'openacp.log')

  // Find the CLI entry point
  const cliPath = path.resolve(process.argv[1])
  const nodePath = process.execPath

  const out = fs.openSync(logFile, 'a')
  const err = fs.openSync(logFile, 'a')

  const child = spawn(nodePath, [cliPath, '--daemon-child'], {
    detached: true,
    stdio: ['ignore', out, err],
  })

  // Close file descriptors in parent — child has its own copies
  fs.closeSync(out)
  fs.closeSync(err)

  if (!child.pid) {
    return { error: 'Failed to spawn daemon process' }
  }

  writePidFile(pidPath, child.pid)
  child.unref()

  return { pid: child.pid }
}

export function stopDaemon(pidPath: string = DEFAULT_PID_PATH): { stopped: boolean; pid?: number; error?: string } {
  const pid = readPidFile(pidPath)
  if (pid === null) return { stopped: false, error: 'Not running (no PID file)' }

  try {
    process.kill(pid, 0) // check alive
  } catch {
    removePidFile(pidPath)
    return { stopped: false, error: 'Not running (stale PID file removed)' }
  }

  try {
    process.kill(pid, 'SIGTERM')
    // PID file is cleaned up by the child process on SIGTERM (see main.ts shutdown handler).
    // Give the child a moment, then remove PID file if it's still there (child may have crashed).
    setTimeout(() => removePidFile(pidPath), 2000)
    return { stopped: true, pid }
  } catch (e) {
    return { stopped: false, error: `Failed to stop: ${(e as Error).message}` }
  }
}

export function getPidPath(): string {
  return DEFAULT_PID_PATH
}
