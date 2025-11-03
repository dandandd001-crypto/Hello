import { randomBytes } from 'crypto';

export function generateRoomKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar looking chars
  const segments = 4;
  const segmentLength = 4;
  
  const key = Array.from({ length: segments }, () => {
    return Array.from({ length: segmentLength }, () => {
      const randomIndex = randomBytes(1)[0] % chars.length;
      return chars[randomIndex];
    }).join('');
  }).join('-');
  
  return key;
}
