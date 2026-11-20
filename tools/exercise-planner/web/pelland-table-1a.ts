// Pelland et al. (2026), "Exercises Counted as Direct and Indirect Weekly Set Volume for Hypertrophy":
// Table 1A of the archived preprint (pelland-2024-dose-response-preprint-v2.pdf, page 8), Table 1 of the published
// article. Exercise names exactly as printed. Transcribed 19 Nov 2026; see VERIFICATION.md.
//
// Keys are the planner's muscle groups. "Quadriceps" is the table's quadriceps / vastus row (the rectus femoris
// has its own row, with squats and the leg press only indirect; the planner doesn't split it out, see the methods
// page). "Shoulders" is the table's anterior deltoid row only; "Upper back" the trapezius row.
import type { Muscle } from "./catalogue.ts";

export const TABLE_1A: Partial<Record<Muscle, { table: string; direct: string[]; indirect: string[] }>> = {
  quads: {
    table: "Quadriceps, Knee Extensors, Lateral Thigh, Anterior/Middle Thigh, Vastus Lateralis, Vastus Medialis, or Vastus Intermedius",
    direct: ["Back Squat", "Leg Press", "Dumbbell Lunge", "Leg Extension", "Hack Squat", "Smith Machine Squat",
      "Barbell Split Squat", "Dumbbell Split Squat", "Bulgarian Split Squat"],
    indirect: [],
  },
  hamstrings: { table: "Hamstrings or Posterior Thigh", direct: ["Leg Curl"], indirect: [] },
  chest: { table: "Pectoralis Major", direct: ["Bench Press", "Flat Dumbbell Fly"], indirect: [] },
  frontDelts: {
    table: "Anterior Deltoid",
    direct: ["Barbell Shoulder Press", "Barbell Shoulder Front Raise"],
    indirect: ["Bench Press", "Chest Press", "Barbell Close Grip Press On Bench"],
  },
  upperBack: { table: "Trapezius", direct: [], indirect: ["Lat Pulldown", "Seated Row"] },
  triceps: {
    table: "Triceps Brachii or Elbow Extensors",
    direct: ["Tricep Push-Down", "Triceps Extension", "Tricep Kickback", "Skullcrusher", "Lying Triceps Press",
      "Lying Tricep Extension", "Cable Overhead Extension", "Overhead Dumbbell Extensions", "Close Grip Bench"],
    indirect: ["Flat Bench Press", "Incline Bench Press", "Decline Bench Press", "Shoulder Press",
      "Dumbbell Shoulder Press", "Incline Dumbbell Press", "Incline Machine Press", "Machine Press"],
  },
  biceps: {
    table: "Biceps Brachii or Elbow Flexors",
    direct: ["Bicep Curl", "Dumbbell Bicep Curl", "Hammer Curl", "Dumbbell Incline Curl", "Barbell Preacher Curl",
      "Dumbbell Preacher Curl", "Machine Curl"],
    indirect: ["Lat Pulldown", "Neutral Grip Lat Pulldown", "Supine Grip Pulldown", "Machine Lat Pulldown", "Seated Row",
      "Close-Grip Machine Row", "Wide-Grip Machine Row", "Bent-Over Barbell Row", "Supine Grip Bent-Over Row"],
  },
};

/** Muscle groups the table classifies at all; a muscle outside these is never "sourced". */
export const TABLE_1A_MUSCLES = Object.keys(TABLE_1A) as Muscle[];
