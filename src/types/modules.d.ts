declare module "ffplay-static" {
  const ffplayPath: string;
  export default ffplayPath;
}

declare module "reverso-api" {
  type ReversoContextResponse = {
    ok: boolean;
    message?: string;
    examples?: Array<{
      source?: string;
      target?: string;
    }>;
  };

  class Reverso {
    constructor(config?: { insecureHTTPParser?: boolean });

    getContext(
      text: string,
      source?: string,
      target?: string,
      cb?: (
        error: { ok: boolean; message: string } | null,
        response?: ReversoContextResponse,
      ) => void,
    ): Promise<ReversoContextResponse>;
  }

  export default Reverso;
}
