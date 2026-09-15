// Number of records requested per page (1–100). All lottery types are included.
export const PREDICTIONS_LIMIT = 100
export const PREDICTIONS_OFFSET = 0

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'https://nasuton.com/lottery'
