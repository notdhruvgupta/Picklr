/**
 * Pre-app data used to derive starting ratings.
 * Source: the group's 1–10 player ratings and its list of winning pairs (oldest first).
 */

export interface LegacyPlayer {
  name: string;
  /** The group's 1–10 rating, if the player has one. */
  groupRating: number | null;
  active: boolean;
}

export const LEGACY_PLAYERS: LegacyPlayer[] = [
  { name: "Tarang", groupRating: 9.66, active: true },
  { name: "Dhruv", groupRating: 9.22, active: true },
  { name: "Gaurav", groupRating: 9, active: true },
  { name: "Satyam", groupRating: 8.55, active: true },
  { name: "Manoj", groupRating: 8.11, active: true },
  { name: "Sunny", groupRating: 7.88, active: true },
  { name: "Shlok", groupRating: 7.87, active: true },
  { name: "Yatharth", groupRating: 7.55, active: true },
  { name: "Manmeet", groupRating: 6.88, active: true },
  { name: "Samrat", groupRating: 6.55, active: true },
  { name: "Ronnie", groupRating: 7.33, active: false },
  { name: "Nishant", groupRating: 7.16, active: false },
  { name: "Vinay", groupRating: 6.83, active: false },
  { name: "Praveer", groupRating: 6.58, active: false },
  { name: "Abhinav", groupRating: 6, active: false },
  { name: "Bhanu", groupRating: 6, active: false },
  // In the win history but not in the ratings list.
  { name: "Monty", groupRating: null, active: false },
  { name: "Gunjan", groupRating: null, active: false },
  { name: "Swastik", groupRating: null, active: false },
  { name: "Ashish", groupRating: null, active: false },
];

/** Names used in the ratings list that refer to a player listed under another name. */
export const NAME_ALIASES: Record<string, string> = {
  Manu: "Manoj",
};

export const LEGACY_WINS: [string, string][] = [
  ["Satyam", "Ronnie"],
  ["Vinay", "Gunjan"],
  ["Monty", "Manoj"],
  ["Gaurav", "Sunny"],
  ["Gaurav", "Manoj"],
  ["Manoj", "Sunny"],
  ["Monty", "Sunny"],
  ["Monty", "Vinay"],
  ["Monty", "Vinay"],
  ["Dhruv", "Tarang"],
  ["Satyam", "Gunjan"],
  ["Vinay", "Tarang"],
  ["Monty", "Dhruv"],
  ["Satyam", "Tarang"],
  ["Gaurav", "Manoj"],
  ["Gaurav", "Dhruv"],
  ["Dhruv", "Tarang"],
  ["Gaurav", "Dhruv"],
  ["Manoj", "Tarang"],
  ["Manoj", "Tarang"],
  ["Manoj", "Tarang"],
  ["Tarang", "Praveer"],
  ["Dhruv", "Tarang"],
  ["Tarang", "Satyam"],
  ["Tarang", "Satyam"],
  ["Manoj", "Satyam"],
  ["Manoj", "Dhruv"],
  ["Tarang", "Swastik"],
  ["Manoj", "Dhruv"],
  ["Gaurav", "Dhruv"],
  ["Gaurav", "Dhruv"],
  ["Gaurav", "Tarang"],
  ["Gaurav", "Dhruv"],
  ["Manoj", "Satyam"],
  ["Manoj", "Satyam"],
  ["Manoj", "Dhruv"],
  ["Gaurav", "Yatharth"],
  ["Manoj", "Dhruv"],
  ["Manoj", "Dhruv"],
  ["Manoj", "Dhruv"],
  ["Satyam", "Dhruv"],
  ["Satyam", "Sunny"],
  ["Sunny", "Dhruv"],
  ["Sunny", "Gaurav"],
  ["Tarang", "Praveer"],
  ["Gaurav", "Ashish"],
  ["Dhruv", "Ronnie"],
  ["Dhruv", "Tarang"],
  ["Dhruv", "Manoj"],
  ["Tarang", "Manoj"],
  ["Satyam", "Manoj"],
  ["Tarang", "Shlok"],
  ["Satyam", "Gaurav"],
  ["Satyam", "Manoj"],
  ["Yatharth", "Sunny"],
  ["Manmeet", "Manoj"],
  ["Manmeet", "Gaurav"],
  ["Dhruv", "Satyam"],
  ["Yatharth", "Tarang"],
];
