export interface Game {
  id: number;
  name: string;
  playtimeMinutes: number;
  timeToBeatHours: number | null;
  timeToBeatSource: string | null;
  lastPlayedAt: string | null;
  genre: string | null;
}

export interface PlanEntry {
  id: number;
  allocatedHours: number;
  position: number;
  score: number;
  completionBonus: number;
  recencyPenalty: number;
  varietyBonus: number;
  game: Game;
}

export interface Plan {
  id: number;
  weekStart: string;
  createdAt: string;
  entries: PlanEntry[];
}
