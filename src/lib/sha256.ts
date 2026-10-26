/**
 * SHA-256 of a string (UTF-8), as lowercase hex. Synchronous, pure and dependency-free, so version
 * lock hashes, the audit chain and workspace file checksums are computed and checked in plain
 * functions: while the sample is generated, inside view models, and in a one-file build opened from
 * disk, where `crypto.subtle` may not be there (docs/PLAN.md 5.3, change C27). A hash shows that
 * data was damaged or edited by hand, not that nobody forged it: anyone can recompute it. Pure.
 */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

const encoder = new TextEncoder()

/**
 * The compression function over every whole 64-byte block of `p` from `from` to `to`, in int32
 * arithmetic (`| 0` is addition mod 2^32; a word is read big-endian from four bytes). The message
 * schedule is a rolling window of 16 words in `w`, computed inside the rounds. The state `h` is
 * updated in place.
 */
function blocks(h: Int32Array, w: Int32Array, p: Uint8Array, from: number, to: number): void {
  let h0 = h[0]
  let h1 = h[1]
  let h2 = h[2]
  let h3 = h[3]
  let h4 = h[4]
  let h5 = h[5]
  let h6 = h[6]
  let h7 = h[7]
  for (let off = from; off + 64 <= to; off += 64) {
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let hh = h7
    for (let i = 0; i < 64; i++) {
      let wi: number
      if (i < 16) {
        const j = off + (i << 2)
        wi = (p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3]
      } else {
        const x = w[(i - 15) & 15]
        const y = w[(i - 2) & 15]
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
        wi = (w[i & 15] + s0 + w[(i - 7) & 15] + s1) | 0
      }
      w[i & 15] = wi
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[i] + wi) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
    h5 = (h5 + f) | 0
    h6 = (h6 + g) | 0
    h7 = (h7 + hh) | 0
  }
  h[0] = h0
  h[1] = h1
  h[2] = h2
  h[3] = h3
  h[4] = h4
  h[5] = h5
  h[6] = h6
  h[7] = h7
}

/**
 * SHA-256 of `text` (UTF-8) as lowercase hex. The whole blocks are read from the encoded bytes in
 * place; only the last one or two blocks, with the padding and the length, are copied (so a lock's
 * megabytes of canonical JSON are never copied twice).
 */
export function sha256(text: string): string {
  const bytes = encoder.encode(text)
  const n = bytes.length
  const h = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Int32Array(16)
  const whole = n - (n % 64)
  blocks(h, w, bytes, 0, whole)
  // The tail: the bytes left, 0x80, zeros, then the length in bits as a 64-bit big-endian number.
  const rest = n - whole
  const tail = new Uint8Array(rest + 9 <= 64 ? 64 : 128)
  tail.set(bytes.subarray(whole))
  tail[rest] = 0x80
  const view = new DataView(tail.buffer)
  const bitLen = n * 8
  view.setUint32(tail.length - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(tail.length - 4, bitLen >>> 0)
  blocks(h, w, tail, 0, tail.length)
  let out = ''
  for (let i = 0; i < 8; i++) out += (h[i] >>> 0).toString(16).padStart(8, '0')
  return out
}
