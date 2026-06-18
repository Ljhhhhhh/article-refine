interface ImportMetaEnv {
  readonly VITE_OSS_BASE_URL?: string;
  readonly VITE_OSS_INDEX_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css";
