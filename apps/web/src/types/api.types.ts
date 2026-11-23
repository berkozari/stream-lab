// Shared API envelopes and pagination types will live here as real endpoints arrive.
// Do not duplicate DTOs from @streamlab/contracts.
export type ApiErrorBody = {
  success: false;
  error: { code: string; message: string };
};
