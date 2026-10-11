declare module "pdfmake" {
  export interface PdfKitDocument {
    getBuffer(): Promise<Buffer>;
    getStream(): NodeJS.ReadableStream;
    getBase64(): Promise<string>;
  }

  export interface PdfMakeInstance {
    setFonts(fonts: Record<string, unknown>): void;
    addFonts(fonts: Record<string, unknown>): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    createPdf(definition: Record<string, unknown>): PdfKitDocument;
  }

  const pdfMake: PdfMakeInstance;
  export default pdfMake;
}

declare module "pdfmake/standard-fonts/Helvetica.js" {
  const fonts: Record<string, Record<string, string>>;
  export default fonts;
}
