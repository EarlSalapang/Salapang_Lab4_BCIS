import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const scrypt = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await scrypt(password, salt);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${digest.toString("hex")}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelism, saltHex, digestHex] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    cost !== "16384" ||
    blockSize !== "8" ||
    parallelism !== "1" ||
    !saltHex ||
    !digestHex ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !/^[a-f0-9]{128}$/i.test(digestHex)
  ) {
    return false;
  }

  const expected = Buffer.from(digestHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, expected);
}
