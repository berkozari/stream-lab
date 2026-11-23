export const healthKeys = {
  all: ['health'] as const,
  liveness: () => [...healthKeys.all, 'liveness'] as const,
};
