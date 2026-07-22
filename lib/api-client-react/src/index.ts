export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

// Alias: top-up was replaced by the deposit-request flow; keep this export
// so existing UI code that references useTopUpAccount continues to compile.
export { useCreateDepositRequest as useTopUpAccount } from "./generated/api";
