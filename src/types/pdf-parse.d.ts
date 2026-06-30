declare module "pdf-parse" {
  interface PDFParseOptions {
    readonly max?: number;
    readonly version?: string;
    readonly pagerender?: ((pageData: unknown) => Promise<string>) | undefined;
  }

  interface PDFParseResult {
    readonly numpages: number;
    readonly numrender: number;
    readonly info: Record<string, unknown>;
    readonly metadata: unknown;
    readonly version: string;
    readonly text: string;
  }

  export default function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: PDFParseOptions
  ): Promise<PDFParseResult>;
}
