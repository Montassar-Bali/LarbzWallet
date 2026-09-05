declare module "next-pwa";

declare module "next-pwa/cache" {
  type RuntimeCachingEntry = {
    urlPattern:
      | RegExp
      | ((context: { url: URL; request: Request }) => boolean);
    handler: string;
    method?: string;
    options?: Record<string, unknown>;
  };

  const runtimeCaching: RuntimeCachingEntry[];
  export default runtimeCaching;
}
