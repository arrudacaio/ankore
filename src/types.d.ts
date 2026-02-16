export {};

declare module "ffplay-static" {
  const ffplayPath: string;
  export default ffplayPath;
}

declare global {
  type DeepReadonly<T> = {
    readonly [K in keyof T]: T[K] extends object
      ? T[K] extends (...args: never[]) => unknown
        ? T[K]
        : DeepReadonly<T[K]>
      : T[K];
  };

  type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
  };

  type PickByValue<T, TValue> = {
    [K in keyof T as T[K] extends TValue ? K : never]: T[K];
  };

  interface MiningModeOptions {
    watchMode?: boolean;
  }

  interface AnkoreModeDefinition<
    TOptions extends object = Record<string, never>,
  > {
    description: string;
    run: (options: TOptions) => Promise<void>;
  }

  type AnkoreModeRegistry<TNames extends string, TOptions extends object> = {
    [K in TNames]: AnkoreModeDefinition<TOptions>;
  };

  interface AnkiExportCard {
    front: string;
    back: string;
    audioFileName?: string;
  }

  interface CardDraft extends AnkiExportCard {
    sentence: string;
    word: string;
    literalTranslationPtBr?: string | null;
  }

  interface WordDataResult {
    definition: string;
    phonetic: string;
    sentence: string;
    sentenceCandidates: string[];
  }

  interface ClipboardWatchHandlers {
    onWord: (word: string) => void;
    onError?: (error: Error) => void;
    intervalMs?: number;
  }
}
