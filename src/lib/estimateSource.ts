export const EstimateSource = {
  IGDB: "IGDB",
  MANUAL: "MANUAL",
  NONE: "NONE",
} as const;

export type EstimateSource = (typeof EstimateSource)[keyof typeof EstimateSource];
