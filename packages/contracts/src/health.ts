/** Baseline shared wire contract; domain contracts are added with their features. */
export type HealthResponse = {
  status: 'ok';
  service: 'api';
  timestamp: string;
};
