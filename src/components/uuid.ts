export function uuid(): string {
    const b = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(b);
    } else {
      for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  