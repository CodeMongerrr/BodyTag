// Object storage for the hosted instance: the same R2 bucket apps/web writes uploads to (STORAGE_DRIVER=r2).

export type Storage = {
  getObject(key: string): Promise<Uint8Array>;
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<void>;
};

export function r2Storage(bucket: R2Bucket): Storage {
  return {
    async getObject(key) {
      if (key.startsWith("procedural:")) throw new Error("procedural asset");
      const obj = await bucket.get(key);
      if (!obj) throw new Error("missing object");
      return new Uint8Array(await obj.arrayBuffer());
    },
    async putObject(key, body, contentType = "application/octet-stream") {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
  };
}
