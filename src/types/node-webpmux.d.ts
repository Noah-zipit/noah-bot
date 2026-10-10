declare module 'node-webpmux' {
  export class Image {
    load(data: Buffer | string): Promise<void>
    save(output: string | null): Promise<Buffer>
    exif: Buffer
  }
  const webpmux: { Image: typeof Image }
  export default webpmux
}
