import readline from 'node:readline'

export interface MenuOption {
  key: string
  label: string
  action: () => Promise<void> | void
}

/**
 * Show an interactive single-keypress menu (TTY only).
 * Returns true if a menu was shown, false if non-TTY.
 */
export function showInteractiveMenu(options: MenuOption[]): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.resolve(false)
  }

  // Print options in two columns
  const half = Math.ceil(options.length / 2)
  for (let i = 0; i < half; i++) {
    const left = options[i]!
    const right = options[i + half]
    const leftStr = `  \x1b[1m[${left.key}]\x1b[0m ${left.label}`
    if (right) {
      const rightStr = `\x1b[1m[${right.key}]\x1b[0m ${right.label}`
      console.log(`${leftStr.padEnd(34)}${rightStr}`)
    } else {
      console.log(leftStr)
    }
  }
  console.log('')

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, terminal: false })

    process.stdin.setRawMode(true)
    process.stdin.resume()

    const onData = async (buf: Buffer) => {
      const ch = buf.toString().toLowerCase()

      // Handle Ctrl+C
      if (ch === '\x03') {
        cleanup()
        process.exit(0)
      }

      const option = options.find(o => o.key === ch)
      if (option) {
        cleanup()
        console.log('')
        await option.action()
        resolve(true)
      }
      // Ignore unrecognized keys
    }

    const cleanup = () => {
      process.stdin.removeListener('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      rl.close()
    }

    process.stdin.on('data', onData)
  })
}
