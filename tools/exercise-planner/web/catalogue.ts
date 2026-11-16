// The exercise catalogue: muscle groups, equipment and exercises.
//
// How muscles are assigned (see the methods page for the sources):
// - Each exercise is described by the joint movements it loads ("moves": e.g. elbow extension).
// - A muscle counts as DIRECT (1 set) when it is a prime mover of the movement the exercise is chosen for,
//   and INDIRECT (0.5 set) when it is a prime mover of a secondary movement in the same exercise
//   (e.g. the triceps straightening the elbow in a bench press). This is the "fractional" counting method of
//   Pelland et al. (2026), and the direct/indirect split follows Schoenfeld et al. (2019).
// - Muscles that only hold a position (e.g. the trunk muscles in a squat) are listed as "steadies" and not counted,
//   except in exercises whose whole purpose is the hold (plank, farmer's carry), where the held muscles are direct.
// - Which muscle produces which movement is from OpenStax Anatomy and Physiology 2e, ch. 11.
//
// MET values (aerobic intensity) are copied unchanged from the 2024 Adult Compendium of Physical Activities,
// with the Compendium's activity code, as its authors ask.

export const MUSCLES = [
  { id: "chest", label: "Chest", detail: "pectoralis major" },
  { id: "shoulders", label: "Shoulders", detail: "deltoids" },
  { id: "triceps", label: "Triceps", detail: "triceps brachii (back of upper arm)" },
  { id: "biceps", label: "Biceps", detail: "elbow flexors: biceps brachii, brachialis, brachioradialis" },
  { id: "forearms", label: "Forearms and grip", detail: "wrist and finger flexors" },
  { id: "lats", label: "Lats", detail: "latissimus dorsi and teres major (sides of the back)" },
  { id: "upperBack", label: "Upper back", detail: "trapezius and rhomboids (between the shoulder blades)" },
  { id: "lowerBack", label: "Lower back", detail: "erector spinae (along the spine)" },
  { id: "abs", label: "Abs", detail: "rectus abdominis and obliques" },
  { id: "glutes", label: "Glutes", detail: "gluteus maximus" },
  { id: "quads", label: "Quadriceps", detail: "front of the thigh" },
  { id: "hamstrings", label: "Hamstrings", detail: "back of the thigh" },
  { id: "calves", label: "Calves", detail: "gastrocnemius and soleus" },
] as const;
export type Muscle = (typeof MUSCLES)[number]["id"];
export const AEROBIC = "aerobic" as const;
export type Target = Muscle | typeof AEROBIC;
export const AEROBIC_LABEL = "Heart and lungs";

export const EQUIPMENT = [
  { id: "body", label: "Bodyweight exercises (no equipment)", group: "none" },
  { id: "outdoors", label: "Somewhere to walk or run outdoors", group: "none" },
  { id: "stairs", label: "Stairs or a step", group: "none" },
  { id: "chair", label: "A sturdy chair or bench", group: "home" },
  { id: "table", label: "A sturdy table (to row underneath)", group: "home" },
  { id: "pullupBar", label: "Pull-up bar", group: "home" },
  { id: "bands", label: "Resistance bands", group: "home" },
  { id: "rope", label: "Skipping rope", group: "home" },
  { id: "dumbbells", label: "Dumbbells", group: "free" },
  { id: "kettlebell", label: "Kettlebell", group: "free" },
  { id: "barbell", label: "Barbell and plates", group: "free" },
  { id: "rack", label: "Squat rack or stands", group: "free" },
  { id: "bench", label: "Weight bench", group: "free" },
  { id: "machines", label: "Weight machines and cable stations", group: "machines" },
  { id: "treadmill", label: "Treadmill", group: "cardio" },
  { id: "bike", label: "Exercise bike", group: "cardio" },
  { id: "rower", label: "Rowing machine", group: "cardio" },
  { id: "crossTrainer", label: "Cross-trainer (elliptical)", group: "cardio" },
  { id: "pool", label: "Swimming pool", group: "cardio" },
] as const;
export type Equipment = (typeof EQUIPMENT)[number]["id"];

const ALL_EQUIPMENT = EQUIPMENT.map((e) => e.id) as Equipment[];
const CARDIO_MACHINES: Equipment[] = ["treadmill", "bike", "rower", "crossTrainer"];
export const PRESETS: { id: string; label: string; equipment: Equipment[] }[] = [
  { id: "gym", label: "Full gym", equipment: ALL_EQUIPMENT.filter((e) => e !== "pool") },
  { id: "machines", label: "Machines only", equipment: ["machines", ...CARDIO_MACHINES] },
  { id: "free", label: "Free weights only", equipment: ["dumbbells", "kettlebell", "barbell", "rack", "bench"] },
  { id: "homeWeights", label: "Home with dumbbells", equipment: ["body", "outdoors", "stairs", "chair", "table", "dumbbells"] },
  { id: "body", label: "No equipment", equipment: ["body", "outdoors", "stairs", "chair", "table"] },
];

/** A Compendium row: activity code, MET value and the Compendium's own description. */
export type MetRow = { code: string; met: number; label: string };

export type Exercise = {
  id: string;
  name: string;
  kind: "strength" | "aerobic";
  /** Equipment needed: every inner list must be satisfied by at least one item in it. Empty = nothing needed. */
  needs: Equipment[][];
  /** Joint movements the exercise loads, in plain words. */
  moves: string;
  direct: Muscle[];
  indirect: Muscle[];
  /** Name as classified in Pelland et al. (2026) Table 1 (Table 1A in the preprint), where that table covers this exercise. */
  listed?: string;
  /** Muscles that hold a position but don't move a joint through a range: shown, not counted. */
  steadies?: Muscle[];
  /** Compendium rows for aerobic activities, lightest effort first. */
  met?: MetRow[];
};

const X = (e: Exercise) => e;

export const EXERCISES: Exercise[] = [
  // --- Bodyweight ---
  X({ id: "pushUp", name: "Push-up", kind: "strength", needs: [["body"]],
    moves: "shoulder horizontal adduction (arms together across the chest); elbow extension",
    direct: ["chest"], indirect: ["triceps", "shoulders"], steadies: ["abs"] }),
  X({ id: "pullUp", name: "Pull-up", kind: "strength", needs: [["pullupBar"]],
    moves: "shoulder adduction and extension (elbows down and back); elbow flexion",
    direct: ["lats"], indirect: ["biceps", "upperBack"], steadies: ["forearms"] }),
  X({ id: "invertedRow", name: "Inverted row (under a bar or sturdy table)", kind: "strength", needs: [["pullupBar", "table", "rack", "machines"]],
    moves: "shoulder extension and shoulder-blade retraction (pulling the chest to the bar); elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps"], steadies: ["forearms", "glutes"] }),
  X({ id: "squatBw", name: "Bodyweight squat", kind: "strength", needs: [["body"]],
    moves: "knee extension; hip extension",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "lunge", name: "Lunge (reverse or forward)", kind: "strength", needs: [["body", "dumbbells", "kettlebell"]],
    listed: "Dumbbell lunge",
    moves: "knee extension; hip extension, one leg at a time",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "gluteBridge", name: "Glute bridge", kind: "strength", needs: [["body"]],
    moves: "hip extension (lifting the hips from the floor)",
    direct: ["glutes"], indirect: ["hamstrings"] }),
  X({ id: "singleLegRdl", name: "Single-leg Romanian deadlift", kind: "strength", needs: [["body", "dumbbells", "kettlebell"]],
    moves: "hip extension with a nearly straight knee, on one leg (hinging at the hip)",
    direct: ["hamstrings", "glutes"], indirect: [], steadies: ["lowerBack"] }),
  X({ id: "plank", name: "Plank", kind: "strength", needs: [["body"]],
    moves: "holds the trunk straight against gravity (no joint movement)",
    direct: ["abs"], indirect: [] }),
  X({ id: "crunch", name: "Crunch", kind: "strength", needs: [["body"]],
    moves: "trunk flexion (curling the ribs towards the hips)",
    direct: ["abs"], indirect: [] }),
  X({ id: "hangingKneeRaise", name: "Hanging knee raise", kind: "strength", needs: [["pullupBar"]],
    moves: "hip flexion and trunk flexion while hanging",
    direct: ["abs"], indirect: [], steadies: ["forearms"] }),
  X({ id: "benchDip", name: "Bench dip", kind: "strength", needs: [["chair", "bench"]],
    moves: "elbow extension; shoulder extension (hands on a bench behind you)",
    direct: ["triceps"], indirect: ["chest", "shoulders"] }),
  X({ id: "calfRaise", name: "Standing calf raise", kind: "strength", needs: [["body", "stairs", "dumbbells", "machines"]],
    moves: "ankle plantar flexion (rising onto the toes)",
    direct: ["calves"], indirect: [] }),
  X({ id: "superman", name: "Back extension on the floor (superman)", kind: "strength", needs: [["body"]],
    moves: "spine extension; hip extension (lifting chest and legs from the floor, face down)",
    direct: ["lowerBack"], indirect: ["glutes"] }),
  X({ id: "pikePushUp", name: "Pike push-up", kind: "strength", needs: [["body"]],
    moves: "shoulder flexion (pressing overhead with hips raised); elbow extension",
    direct: ["shoulders"], indirect: ["triceps", "upperBack"] }),

  // --- Bands ---
  X({ id: "bandRow", name: "Resistance-band row", kind: "strength", needs: [["bands"]],
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps"] }),
  X({ id: "bandPullApart", name: "Band pull-apart", kind: "strength", needs: [["bands"]],
    moves: "shoulder horizontal abduction (arms apart) and shoulder-blade retraction",
    direct: ["upperBack"], indirect: ["shoulders"] }),

  // --- Dumbbells and kettlebells ---
  X({ id: "gobletSquat", name: "Goblet squat", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    moves: "knee extension; hip extension, holding one weight at the chest",
    direct: ["quads", "glutes"], indirect: [], steadies: ["upperBack", "abs"] }),
  X({ id: "dbBench", name: "Dumbbell bench press", kind: "strength", needs: [["dumbbells"], ["bench"]],
    listed: "Bench press (dumbbell variant)",
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "shoulders"] }),
  X({ id: "dbRow", name: "One-arm dumbbell row", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps"], steadies: ["lowerBack"] }),
  X({ id: "dbPress", name: "Dumbbell shoulder press", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    listed: "Dumbbell shoulder press",
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["shoulders"], indirect: ["triceps", "upperBack"] }),
  X({ id: "lateralRaise", name: "Dumbbell lateral raise", kind: "strength", needs: [["dumbbells", "machines"]],
    moves: "shoulder abduction (arms out to the sides)",
    direct: ["shoulders"], indirect: [] }),
  X({ id: "curl", name: "Biceps curl", kind: "strength", needs: [["dumbbells", "barbell", "bands", "machines"]],
    listed: "Biceps curl; dumbbell biceps curl; machine curl",
    moves: "elbow flexion",
    direct: ["biceps"], indirect: [], steadies: ["forearms"] }),
  X({ id: "overheadExt", name: "Overhead triceps extension", kind: "strength", needs: [["dumbbells", "kettlebell", "bands", "machines"]],
    listed: "Overhead dumbbell extensions; cable overhead extension",
    moves: "elbow extension with the arm overhead",
    direct: ["triceps"], indirect: [] }),
  X({ id: "rdl", name: "Romanian deadlift", kind: "strength", needs: [["dumbbells", "kettlebell", "barbell"]],
    moves: "hip extension with nearly straight knees (hinging at the hips)",
    direct: ["hamstrings", "glutes"], indirect: [], steadies: ["lowerBack", "forearms", "upperBack"] }),
  X({ id: "farmerCarry", name: "Farmer's carry", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    moves: "gripping heavy weights while walking (holding, little joint movement)",
    direct: ["forearms"], indirect: [], steadies: ["upperBack", "abs"] }),
  X({ id: "kbSwing", name: "Kettlebell swing", kind: "aerobic", needs: [["kettlebell"]],
    moves: "fast, repeated hip extension (hinging and snapping the hips forward)",
    direct: ["glutes", "hamstrings"], indirect: [], steadies: ["lowerBack", "forearms"],
    met: [{ code: "02058", met: 9.8, label: "Kettle bell swings" }] }),

  // --- Barbell ---
  X({ id: "backSquat", name: "Barbell back squat", kind: "strength", needs: [["barbell"], ["rack"]],
    listed: "Back squat",
    moves: "knee extension; hip extension",
    direct: ["quads", "glutes"], indirect: [], steadies: ["lowerBack", "abs"] }),
  X({ id: "deadlift", name: "Deadlift", kind: "strength", needs: [["barbell", "kettlebell", "dumbbells"]],
    moves: "hip extension; knee extension (lifting a weight from the floor)",
    direct: ["glutes", "hamstrings"], indirect: ["quads"], steadies: ["lowerBack", "forearms", "upperBack"] }),
  X({ id: "benchPress", name: "Barbell bench press", kind: "strength", needs: [["barbell"], ["bench"], ["rack"]],
    listed: "Bench press",
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "shoulders"] }),
  X({ id: "ohp", name: "Barbell overhead press", kind: "strength", needs: [["barbell"]],
    listed: "Barbell shoulder press",
    moves: "shoulder flexion (pressing overhead); elbow extension",
    direct: ["shoulders"], indirect: ["triceps", "upperBack"], steadies: ["abs"] }),
  X({ id: "bbRow", name: "Barbell bent-over row", kind: "strength", needs: [["barbell"]],
    listed: "Bent-over barbell row",
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps"], steadies: ["lowerBack", "hamstrings"] }),
  X({ id: "hipThrust", name: "Hip thrust", kind: "strength", needs: [["barbell", "dumbbells"], ["bench", "chair"]],
    moves: "hip extension (back on a bench, lifting the hips)",
    direct: ["glutes"], indirect: ["hamstrings"] }),

  // --- Machines and cables ---
  X({ id: "legPress", name: "Leg press", kind: "strength", needs: [["machines"]],
    listed: "Leg press",
    moves: "knee extension; hip extension",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "legExtension", name: "Leg extension", kind: "strength", needs: [["machines"]],
    listed: "Leg extension",
    moves: "knee extension",
    direct: ["quads"], indirect: [] }),
  X({ id: "legCurl", name: "Leg curl", kind: "strength", needs: [["machines"]],
    listed: "Leg curl",
    moves: "knee flexion",
    direct: ["hamstrings"], indirect: ["calves"] }),
  X({ id: "latPulldown", name: "Lat pulldown", kind: "strength", needs: [["machines"]],
    listed: "Lat pulldown",
    moves: "shoulder adduction and extension (elbows down); elbow flexion",
    direct: ["lats"], indirect: ["biceps", "upperBack"] }),
  X({ id: "cableRow", name: "Seated cable row", kind: "strength", needs: [["machines"]],
    listed: "Seated row",
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps"] }),
  X({ id: "chestPress", name: "Chest press machine", kind: "strength", needs: [["machines"]],
    listed: "Chest press; machine press",
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "shoulders"] }),
  X({ id: "pecFly", name: "Chest fly (machine or cable)", kind: "strength", needs: [["machines"]],
    listed: "Flat dumbbell fly (machine or cable variant)",
    moves: "shoulder horizontal adduction with nearly straight elbows",
    direct: ["chest"], indirect: ["shoulders"] }),
  X({ id: "shoulderPressMachine", name: "Shoulder press machine", kind: "strength", needs: [["machines"]],
    listed: "Machine press (shoulder variant)",
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["shoulders"], indirect: ["triceps", "upperBack"] }),
  X({ id: "pushdown", name: "Cable triceps pushdown", kind: "strength", needs: [["machines", "bands"]],
    listed: "Triceps push-down",
    moves: "elbow extension",
    direct: ["triceps"], indirect: [] }),
  X({ id: "facePull", name: "Face pull (cable or band)", kind: "strength", needs: [["machines", "bands"]],
    moves: "shoulder horizontal abduction and external rotation; shoulder-blade retraction",
    direct: ["upperBack", "shoulders"], indirect: [] }),
  X({ id: "shrug", name: "Shrug", kind: "strength", needs: [["dumbbells", "barbell", "machines"]],
    moves: "shoulder-blade elevation (shoulders up towards the ears)",
    direct: ["upperBack"], indirect: [], steadies: ["forearms"] }),
  X({ id: "backExtension", name: "Back extension (45° bench or machine)", kind: "strength", needs: [["machines"]],
    moves: "spine extension; hip extension",
    direct: ["lowerBack"], indirect: ["glutes", "hamstrings"] }),
  X({ id: "cableCrunch", name: "Cable crunch", kind: "strength", needs: [["machines"]],
    moves: "trunk flexion against a cable",
    direct: ["abs"], indirect: [] }),

  // --- Aerobic ---
  X({ id: "walk", name: "Brisk walking", kind: "aerobic", needs: [["outdoors", "treadmill"]],
    moves: "walking", direct: [], indirect: [],
    met: [{ code: "17200", met: 4.8, label: "Walking, 3.5 to 3.9 mph, level, brisk, firm surface, walking for exercise" }] }),
  X({ id: "run", name: "Running or jogging", kind: "aerobic", needs: [["outdoors", "treadmill"]],
    moves: "running", direct: [], indirect: [],
    met: [{ code: "12020", met: 7.5, label: "Jogging, general, self-selected pace" },
      { code: "12050", met: 9.3, label: "Running, 6-6.3 mph (10 min/mile)" }] }),
  X({ id: "cycle", name: "Exercise bike", kind: "aerobic", needs: [["bike"]],
    moves: "cycling", direct: [], indirect: [],
    met: [{ code: "01216", met: 5.0, label: "Bicycling, stationary, 60 watts, light to moderate effort" },
      { code: "01200", met: 6.8, label: "Bicycling, stationary, general" }] }),
  X({ id: "row", name: "Rowing machine", kind: "aerobic", needs: [["rower"]],
    moves: "rowing", direct: [], indirect: [],
    met: [{ code: "02071", met: 5.0, label: "Rowing, stationary ergometer, general, <100 watts, moderate effort" },
      { code: "02070", met: 7.3, label: "Rowing, stationary ergometer, general, vigorous effort" }] }),
  X({ id: "elliptical", name: "Cross-trainer (elliptical)", kind: "aerobic", needs: [["crossTrainer"]],
    moves: "elliptical stepping", direct: [], indirect: [],
    met: [{ code: "02048", met: 5.0, label: "Elliptical trainer, moderate effort" },
      { code: "02049", met: 9.0, label: "Elliptical trainer, vigorous effort" }] }),
  X({ id: "skip", name: "Skipping (jumping rope)", kind: "aerobic", needs: [["rope"]],
    moves: "skipping", direct: [], indirect: [],
    met: [{ code: "15552", met: 8.3, label: "Rope jumping, slow pace, < 100 skips/min, 2 foot skip, rhythm bounce" },
      { code: "15551", met: 11.8, label: "Rope jumping, moderate pace, general, 100 to 120 skips/min, 2 foot skip, plain bounce" }] }),
  X({ id: "stairs", name: "Stair climbing", kind: "aerobic", needs: [["stairs"]],
    moves: "climbing stairs", direct: [], indirect: [],
    met: [{ code: "17133", met: 4.5, label: "Stair climbing, slow pace" },
      { code: "17131", met: 6.8, label: "Stair climbing, general" }] }),
  X({ id: "swim", name: "Swimming (front crawl)", kind: "aerobic", needs: [["pool"]],
    moves: "swimming", direct: [], indirect: [],
    met: [{ code: "18240", met: 5.8, label: "Swimming laps, freestyle, slow, recreational" },
      { code: "18230", met: 9.8, label: "Swimming laps, freestyle, fast, vigorous effort" }] }),
  X({ id: "burpee", name: "Burpees, jumping jacks and similar", kind: "aerobic", needs: [["body"]],
    moves: "fast whole-body calisthenics", direct: [], indirect: [],
    met: [{ code: "02020", met: 7.5, label: "Calisthenics (e.g., pushups, sit ups, pull-ups, jumping jacks, burpees, battling ropes), vigorous effort" }] }),
];
