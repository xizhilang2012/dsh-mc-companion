/**
 * 连到游戏里的那根管子（mod 开的本地端口）。
 *
 * 协议见 mod 的 McCompanionClient：一行一个 JSON。
 * 断线自动重连——游戏重启、切存档都会断，不能因此让插件躺平。
 *
 * @module mc-companion/lib/bridge
 */
import net from 'node:net'

/**
 * @param {{host?: string, port: number, onEvent: (event: object) => void, onStatus?: (state: string) => void}} options
 */
export function createBridge(options) {
  const host = options.host ?? '127.0.0.1'
  const port = options.port
  let socket
  let connected = false
  let closed = false
  let retry

  const connect = () => {
    if (closed) return
    socket = net.createConnection({ host, port })
    let buffer = ''

    socket.on('connect', () => {
      connected = true
      options.onStatus?.('connected')
    })

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line === '') continue
        try {
          options.onEvent(JSON.parse(line))
        } catch {
          // 坏行跳过
        }
      }
    })

    socket.on('error', () => { /* close 会跟着来 */ })

    socket.on('close', () => {
      connected = false
      options.onStatus?.('disconnected')
      if (closed) return
      retry = setTimeout(connect, 3000)
    })
  }

  connect()

  return {
    get connected() { return connected },
    /** 发任意一条命令给 mod（say / body / goto / halt）。 */
    send(payload) {
      if (!connected || !socket) return false
      try {
        socket.write(`${JSON.stringify(payload)}\n`)
        return true
      } catch {
        return false
      }
    },
    /** 让游戏里说话；返回是否真的写出去了。 */
    say(text, name = '') {
      if (!connected || !socket) return false
      try {
        socket.write(`${JSON.stringify({ cmd: 'say', text, name })}\n`)
        return true
      } catch {
        return false
      }
    },
    stop() {
      closed = true
      clearTimeout(retry)
      try { socket?.destroy() } catch { }
    },
  }
}
