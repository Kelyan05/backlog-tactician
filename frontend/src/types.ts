export interface Game {
  id: number;
  name: string;
  playtimeMinutes: number;
  timeToBeatHours: number | null;
  timeToBeatSource: string | null;
  lastPlayedAt: string | null;
}
