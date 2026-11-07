/**
 * 最小 RCON 客户端（Source RCON 协议，Minecraft Java 版支持）。
 *
 * 每条命令开一次连接：配置简单、出错好定位，对“陪玩”这种低频调用完全够用。
 *
 * @module mc-companion/lib/rcon
 */
import net from 'node:net'

const TYPE_AUTH = 3
const TYPE_AUTH_RESPONSE = 2
const TYPE_EXEC = 2
const TYPE_RESPONSE = 0

/** 组一个 RCON 包：长度(4) + id(4) + type(4) + body + 0x00 0x00 */
function encode(id, type, body) {
  const payload = Buffer.from(body, 'utf8')
  const buf = Buffer.alloc(14 + payload.length)
  buf.writeInt32LE(10 + payload.length, 0)
  buf.writeInt32LE(id, 4)
  buf.writeInt32LE(type, 8)
  payload.copy(buf, 12)
  return buf
}

/** 从缓冲区里切出一个完整的包；不完整返回 undefined。 */
function decode(buffer) {
  if (buffer.length < 12) return undefined
  const size = buffer.readInt32LE(0)
  if (buffer.length < size + 4) return undefined
  const id = buffer.readInt32LE(4)
  const type = buffer.readInt32LE(8)
  const body = buffer.toString('utf8', 12, size + 2)
  return { id, type, body, rest: buffer.subarray(size + 4) }
}

/**
 * 执行一条 RCON 命令。
 *
 * @param {{host?: string, port?: number, password: string, command: string, timeoutMs?: number}} options
 * @returns {Promise<string>} 服务器回包正文
 */
export function rconCommand(options) {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 25575
  const timeoutMs = options.timeoutMs ?? 5000

  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let buffer = Buffer.alloc(0)
    let stage = 'auth'
    let settled = false

    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (error) reject(error)
      else resolve(value)
    }

    const timer = setTimeout(() => finish(new Error(`RCON 超时（${timeoutMs}ms）`)), timeoutMs)

    socket.on('error', (error) => finish(error))
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      let packet
      while ((packet = decode(buffer)) !== undefined) {
        buffer = packet.rest
        if (stage === 'auth') {
          if (packet.type !== TYPE_AUTH_RESPONSE) continue
          if (packet.id === -1) {
            finish(new Error('RCON 认证失败：密码不对'))
            return
          }
          stage = 'exec'
          socket.write(encode(2, TYPE_EXEC, options.command))
          continue
        }
        if (packet.type === TYPE_RESPONSE) {
          finish(null, packet.body)
          return
        }
      }
    })

    socket.connect(port, host, () => {
      socket.write(encode(1, TYPE_AUTH, options.password))
    })
  })
}

/** 探测 RCON 是否可用：成功返回 true，失败返回原因。 */
export async function probeRcon(options) {
  try {
    await rconCommand({ ...options, command: 'list' })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
