// Electron Main Process — Python Worker IPC Bridge
const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

class PythonBridge {
  constructor() {
    this.pythonPath = this._findPython()
    this.scriptPath = path.join(__dirname, '../python/main.py')
    this.pythonDir = path.join(__dirname, '../python')
  }

  _findPython() {
    const candidates =
      process.platform === 'win32'
        ? ['py -3', 'python', 'python3']
        : ['python3', 'python', 'py']

    for (const cmd of candidates) {
      try {
        execSync(`${cmd} --version`, {
          stdio: 'ignore',
          shell: process.platform === 'win32',
        })
        return cmd
      } catch {
        // try next candidate
      }
    }
    throw new Error('Python not found. Install Python 3.8+')
  }

  _spawnArgs() {
    if (this.pythonPath === 'py -3') {
      return { command: 'py', args: ['-3', this.scriptPath] }
    }
    return { command: this.pythonPath, args: [this.scriptPath] }
  }

  async call(action, params = {}) {
    if (!fs.existsSync(this.scriptPath)) {
      throw new Error(`Python worker not found: ${this.scriptPath}`)
    }

    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ action, ...params })
      const { command, args } = this._spawnArgs()

      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.pythonDir,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
        },
        shell: false,
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (d) => {
        stdout += d.toString()
      })
      proc.stderr.on('data', (d) => {
        stderr += d.toString()
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to start Python: ${err.message}`))
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python error (${code}): ${stderr || stdout}`))
          return
        }
        try {
          const trimmed = stdout.trim()
          const result = JSON.parse(trimmed)
          resolve(result)
        } catch (e) {
          reject(new Error(`JSON parse error: ${stdout}`))
        }
      })

      proc.stdin.write(payload, 'utf8')
      proc.stdin.end()
    })
  }

  async ping() {
    return this.call('ping')
  }

  async extractPDF(pdfPath, deviceId, pageIndex = 0) {
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      throw new Error(`PDF not found: ${pdfPath}`)
    }
    return this.call('extract_pdf', {
      pdf_path: pdfPath,
      device_id: deviceId,
      page_index: pageIndex,
    })
  }
}

module.exports = { PythonBridge }
