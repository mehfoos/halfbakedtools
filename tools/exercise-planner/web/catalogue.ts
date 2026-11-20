// The exercise catalogue: muscle groups, equipment and exercises.
//
// How muscles are assigned (see the methods page for the sources):
// - Counting: a set counts as 1 set for a muscle trained DIRECTLY and 0.5 for one trained INDIRECTLY: the
//   "fractional" method of Pelland et al. (2026).
// - Where Pelland et al. classified an exercise for a muscle (Table 1A of the archived preprint, transcribed in
//   pelland-table-1a.ts), the planner follows it exactly, and `sources` names the table entry. That table covers only
//   the quadriceps, rectus femoris, hamstrings, pectoralis major, anterior deltoid, trapezius, triceps and biceps,
//   and only dynamic exercises; the authors call their classification "not wholly objective".
// - Every other muscle assignment is the planner's own ASSUMPTION, made from anatomy: each exercise is described by
//   the joint movements it loads ("moves"); a muscle producing the main movement counts as direct, one producing a
//   secondary movement as indirect. Which muscle produces which movement is from OpenStax Anatomy and Physiology 2e,
//   ch. 11; for the three parts of the deltoid, from Stokey et al. 2024 (front: flexion and medial rotation; side:
//   abduction; rear: extension and lateral rotation). These are labelled "Assumption" on the site until outcome
//   evidence replaces them. Neither anatomy source names the muscles of horizontal abduction (face pull, band
//   pull-apart): counting the rear deltoid there is the planner's own reading, as extension in the horizontal plane.
// - Muscles that only hold a position (e.g. the trunk muscles in a squat) are listed as "steadies" and not counted,
//   except in exercises whose whole purpose is the hold (plank, farmer's carry), where the held muscles are direct
//   (also an assumption: holds were outside Pelland et al.'s analysis).

// MET values (aerobic intensity) are copied unchanged from the 2024 Adult Compendium of Physical Activities,
// with the Compendium's activity code, as its authors ask.

export const MUSCLES = [
  { id: "chest", label: "Chest", detail: "pectoralis major" },
  { id: "frontDelts", label: "Front shoulders", detail: "front (anterior) deltoid" },
  { id: "sideDelts", label: "Side shoulders", detail: "side (lateral) deltoid" },
  { id: "rearDelts", label: "Rear shoulders", detail: "rear (posterior) deltoid" },
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
  /**
   * "aerobic": continuous, rhythmic activity, which counts towards heart and lungs. "intervals": high-effort work
   * usually done in short bursts with rests (kettlebell swings, burpees); its Compendium value is shown, but it doesn't
   * count towards heart and lungs, because the WHO defines aerobic activity as large muscles moving rhythmically "for a
   * sustained period of time" and anaerobic activity as "brief intense bursts" (WHO 2020 glossary; owner's decision,
   * 20 Nov 2026).
   */
  kind: "strength" | "aerobic" | "intervals";
  /** Equipment needed: every inner list must be satisfied by at least one item in it. Empty = nothing needed. */
  needs: Equipment[][];
  /** Joint movements the exercise loads, in plain words. */
  moves: string;
  direct: Muscle[];
  indirect: Muscle[];
  /**
   * Where a muscle's classification here comes from Pelland et al. (2026), Table 1A of the archived preprint
   * (Table 1 in the published article): the exercise name exactly as printed there, under the same muscle and in
   * the same column (direct or indirect). Every other muscle in `direct` or `indirect` is the planner's own
   * classification from anatomy (an assumption), and is labelled as such on the site. Checked by planner.test.ts.
   */
  sources?: Partial<Record<Muscle, string>>;
  /**
   * Muscles whose counting here is supported by studies that measured muscle growth (MRI or ultrasound) after
   * training with this exercise: reference ids from references.json. This supports counting the muscle at all; whether
   * it counts as a full or half set is still the planner's classification. Checked by planner.test.ts.
   */
  evidence?: Partial<Record<Muscle, string[]>>;
  /** Muscles that hold a position but don't move a joint through a range: shown, not counted. */
  steadies?: Muscle[];
  /** Compendium rows (aerobic and interval activities), lightest effort first. None is a Compendium estimate (checked 20 Nov 2026). */
  met?: MetRow[];
};

const X = (e: Exercise) => e;

export const EXERCISES: Exercise[] = [
  // --- Bodyweight ---
  X({ id: "pushUp", name: "Push-up", kind: "strength", needs: [["body"]],
    evidence: { chest: ["kikuchi-2017"], triceps: ["kikuchi-2017"] },
    moves: "shoulder horizontal adduction (arms together across the chest); elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"], steadies: ["abs"] }),
  X({ id: "pullUp", name: "Pull-up", kind: "strength", needs: [["pullupBar"]],
    moves: "shoulder adduction and extension (elbows down and back); elbow flexion",
    direct: ["lats"], indirect: ["biceps", "upperBack"], steadies: ["forearms"] }),
  X({ id: "invertedRow", name: "Inverted row (under a bar or sturdy table)", kind: "strength", needs: [["pullupBar", "table", "rack", "machines"]],
    moves: "shoulder extension and shoulder-blade retraction (pulling the chest to the bar); elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"], steadies: ["forearms", "glutes"] }),
  X({ id: "squatBw", name: "Bodyweight squat", kind: "strength", needs: [["body"]],
    moves: "knee extension; hip extension",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "lunge", name: "Bodyweight lunge (reverse or forward)", kind: "strength", needs: [["body"]],
    evidence: { glutes: ["wei-2023", "krause-neto-2025"] },
    moves: "knee extension; hip extension, one leg at a time",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "gluteBridge", name: "Glute bridge", kind: "strength", needs: [["body"]],
    moves: "hip extension (lifting the hips from the floor)",
    // Hamstrings not counted: they didn't grow after hip thrust training (Plotkin et al. 2023); same movement.
    direct: ["glutes"], indirect: [] }),
  X({ id: "singleLegRdl", name: "Single-leg Romanian deadlift", kind: "strength", needs: [["body", "dumbbells", "kettlebell"]],
    moves: "hip extension with a nearly straight knee, on one leg (hinging at the hip)",
    direct: ["hamstrings", "glutes"], indirect: [], steadies: ["lowerBack"] }),
  X({ id: "plank", name: "Plank", kind: "strength", needs: [["body"]],
    moves: "holds the trunk straight against gravity (no joint movement)",
    direct: ["abs"], indirect: [] }),
  X({ id: "crunch", name: "Crunch", kind: "strength", needs: [["body"]],
    moves: "trunk flexion (curling the ribs towards the hips)",
    direct: ["abs"], indirect: [] }),
  X({ id: "hangingKneeRaise", name: "Hanging knee raise, curling the pelvis up", kind: "strength", needs: [["pullupBar"]],
    moves: "hip flexion (by the iliopsoas) with trunk flexion (by the abs): curl the pelvis up towards the ribs as the knees rise",
    direct: ["abs"], indirect: [], steadies: ["forearms"] }),
  X({ id: "benchDip", name: "Bench dip", kind: "strength", needs: [["chair", "bench"]],
    moves: "elbow extension, and shoulder flexion as you push up (the shoulders extend as you lower; hands on a bench behind you)",
    direct: ["triceps"], indirect: ["chest", "frontDelts"] }),
  X({ id: "calfRaise", name: "Standing calf raise", kind: "strength", needs: [["body", "stairs", "dumbbells", "machines"]],
    evidence: { calves: ["kinoshita-2023"] },
    moves: "ankle plantar flexion (rising onto the toes)",
    direct: ["calves"], indirect: [] }),
  X({ id: "superman", name: "Back extension on the floor (superman)", kind: "strength", needs: [["body"]],
    moves: "spine extension; hip extension (lifting chest and legs from the floor, face down)",
    direct: ["lowerBack"], indirect: ["glutes", "hamstrings"] }),
  X({ id: "pikePushUp", name: "Pike push-up", kind: "strength", needs: [["body"]],
    moves: "shoulder flexion and abduction (pressing overhead with hips raised); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"] }),

  // --- Bands ---
  X({ id: "bandRow", name: "Resistance-band row", kind: "strength", needs: [["bands"]],
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"] }),
  X({ id: "bandPullApart", name: "Band pull-apart", kind: "strength", needs: [["bands"]],
    moves: "shoulder horizontal abduction (arms apart) and shoulder-blade retraction",
    direct: ["upperBack"], indirect: ["rearDelts"] }),

  // --- Dumbbells and kettlebells ---
  X({ id: "gobletSquat", name: "Goblet squat", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    moves: "knee extension; hip extension, holding one weight at the chest",
    direct: ["quads", "glutes"], indirect: [], steadies: ["upperBack", "abs"] }),
  X({ id: "lungeDb", name: "Dumbbell lunge", kind: "strength", needs: [["dumbbells"]],
    sources: { quads: "Dumbbell Lunge" },
    moves: "knee extension; hip extension, one leg at a time, holding dumbbells",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "dbFly", name: "Flat dumbbell fly", kind: "strength", needs: [["dumbbells"], ["bench"]],
    sources: { chest: "Flat Dumbbell Fly" },
    moves: "shoulder horizontal adduction with nearly straight elbows, lying on a bench",
    direct: ["chest"], indirect: [] }),
  X({ id: "dbBench", name: "Dumbbell bench press", kind: "strength", needs: [["dumbbells"], ["bench"]],
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"] }),
  X({ id: "dbRow", name: "One-arm dumbbell row", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"], steadies: ["lowerBack"] }),
  X({ id: "dbPress", name: "Dumbbell shoulder press", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    sources: { triceps: "Dumbbell Shoulder Press" },
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"] }),
  X({ id: "lateralRaise", name: "Dumbbell lateral raise", kind: "strength", needs: [["dumbbells", "machines"]],
    evidence: { sideDelts: ["larsen-2025"] },
    moves: "shoulder abduction (arms out to the sides)",
    direct: ["sideDelts"], indirect: [] }),
  X({ id: "curl", name: "Biceps curl", kind: "strength", needs: [["dumbbells", "barbell", "bands", "machines"]],
    sources: { biceps: "Bicep Curl" },
    moves: "elbow flexion",
    direct: ["biceps"], indirect: [], steadies: ["forearms"] }),
  X({ id: "overheadExt", name: "Overhead triceps extension", kind: "strength", needs: [["dumbbells", "kettlebell", "bands", "machines"]],
    sources: { triceps: "Overhead Dumbbell Extensions" },
    moves: "elbow extension with the arm overhead",
    direct: ["triceps"], indirect: [] }),
  X({ id: "rdl", name: "Romanian deadlift", kind: "strength", needs: [["dumbbells", "kettlebell", "barbell"]],
    evidence: { hamstrings: ["morin-2025"] },
    moves: "hip extension with nearly straight knees (hinging at the hips)",
    direct: ["hamstrings", "glutes"], indirect: [], steadies: ["lowerBack", "forearms", "upperBack"] }),
  X({ id: "farmerCarry", name: "Farmer's carry", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    moves: "gripping heavy weights while walking (holding, little joint movement)",
    direct: ["forearms"], indirect: [], steadies: ["upperBack", "abs"] }),
  X({ id: "kbSwing", name: "Kettlebell swing", kind: "intervals", needs: [["kettlebell"]],
    moves: "fast, repeated hip extension (hinging and snapping the hips forward)",
    direct: ["glutes", "hamstrings"], indirect: [], steadies: ["lowerBack", "forearms"],
    met: [{ code: "02058", met: 9.8, label: "Kettle bell swings" }] }),

  // --- Barbell ---
  X({ id: "backSquat", name: "Barbell back squat", kind: "strength", needs: [["barbell"], ["rack"]],
    sources: { quads: "Back Squat" },
    evidence: { glutes: ["krause-neto-2025", "plotkin-2023"] },
    moves: "knee extension; hip extension (squatting to thighs parallel with the floor or lower)",
    direct: ["quads", "glutes"], indirect: [], steadies: ["lowerBack", "abs"] }),
  X({ id: "deadlift", name: "Deadlift", kind: "strength", needs: [["barbell", "kettlebell", "dumbbells"]],
    moves: "hip extension; knee extension (lifting a weight from the floor)",
    direct: ["glutes", "hamstrings"], indirect: ["quads"], steadies: ["lowerBack", "forearms", "upperBack"] }),
  X({ id: "benchPress", name: "Barbell bench press", kind: "strength", needs: [["barbell"], ["bench"], ["rack"]],
    sources: { chest: "Bench Press", frontDelts: "Bench Press", triceps: "Flat Bench Press" },
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"] }),
  X({ id: "ohp", name: "Barbell overhead press", kind: "strength", needs: [["barbell"]],
    sources: { frontDelts: "Barbell Shoulder Press", triceps: "Shoulder Press" },
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"], steadies: ["abs"] }),
  X({ id: "frontRaise", name: "Barbell front raise", kind: "strength", needs: [["barbell"]],
    sources: { frontDelts: "Barbell Shoulder Front Raise" },
    moves: "shoulder flexion (raising straight arms in front to shoulder height)",
    direct: ["frontDelts"], indirect: [] }),
  X({ id: "bbRow", name: "Barbell bent-over row", kind: "strength", needs: [["barbell"]],
    sources: { biceps: "Bent-Over Barbell Row" },
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"], steadies: ["lowerBack", "hamstrings"] }),
  X({ id: "hipThrust", name: "Hip thrust", kind: "strength", needs: [["barbell", "dumbbells"], ["bench", "chair"]],
    evidence: { glutes: ["plotkin-2023", "krause-neto-2025"] },
    moves: "hip extension (back on a bench, lifting the hips)",
    // Hamstrings not counted: no meaningful growth after 9 weeks of hip thrust training (Plotkin et al. 2023).
    direct: ["glutes"], indirect: [] }),

  // --- Machines and cables ---
  X({ id: "legPress", name: "Leg press", kind: "strength", needs: [["machines"]],
    sources: { quads: "Leg Press" },
    evidence: { glutes: ["krause-neto-2025"] },
    moves: "knee extension; hip extension",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "legExtension", name: "Leg extension", kind: "strength", needs: [["machines"]],
    sources: { quads: "Leg Extension" },
    moves: "knee extension",
    direct: ["quads"], indirect: [] }),
  X({ id: "legCurl", name: "Leg curl", kind: "strength", needs: [["machines"]],
    sources: { hamstrings: "Leg Curl" },
    moves: "knee flexion",
    direct: ["hamstrings"], indirect: ["calves"] }),
  X({ id: "latPulldown", name: "Lat pulldown", kind: "strength", needs: [["machines"]],
    sources: { biceps: "Lat Pulldown", upperBack: "Lat Pulldown" },
    moves: "shoulder adduction and extension (elbows down); elbow flexion",
    direct: ["lats"], indirect: ["biceps", "upperBack"] }),
  X({ id: "cableRow", name: "Seated cable row", kind: "strength", needs: [["machines"]],
    sources: { biceps: "Seated Row", upperBack: "Seated Row" },
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"] }),
  X({ id: "chestPress", name: "Chest press machine", kind: "strength", needs: [["machines"]],
    sources: { frontDelts: "Chest Press", triceps: "Machine Press" },
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"] }),
  X({ id: "pecFly", name: "Chest fly (machine or cable)", kind: "strength", needs: [["machines"]],
    moves: "shoulder horizontal adduction with nearly straight elbows",
    direct: ["chest"], indirect: [] }),
  X({ id: "shoulderPressMachine", name: "Shoulder press machine", kind: "strength", needs: [["machines"]],
    sources: { triceps: "Shoulder Press" },
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"] }),
  X({ id: "pushdown", name: "Cable triceps pushdown", kind: "strength", needs: [["machines", "bands"]],
    sources: { triceps: "Tricep Push-Down" },
    moves: "elbow extension",
    direct: ["triceps"], indirect: [] }),
  X({ id: "facePull", name: "Face pull (cable or band)", kind: "strength", needs: [["machines", "bands"]],
    moves: "shoulder horizontal abduction and external rotation; shoulder-blade retraction",
    direct: ["upperBack", "rearDelts"], indirect: [] }),
  X({ id: "shrug", name: "Shrug", kind: "strength", needs: [["dumbbells", "barbell", "machines"]],
    moves: "shoulder-blade elevation (shoulders up towards the ears), done by the trapezius; the rhomboids retract the shoulder blades instead",
    direct: ["upperBack"], indirect: [], steadies: ["forearms"] }),
  X({ id: "backExtension", name: "Back extension (45° bench or machine)", kind: "strength", needs: [["machines"]],
    evidence: { hamstrings: ["bourne-2017"] },
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
  X({ id: "burpee", name: "Burpees, jumping jacks and similar", kind: "intervals", needs: [["body"]],
    moves: "fast whole-body calisthenics", direct: [], indirect: [],
    met: [{ code: "02020", met: 7.5, label: "Calisthenics (e.g., pushups, sit ups, pull-ups, jumping jacks, burpees, battling ropes), vigorous effort" }] }),
];

/** True when counting muscle `m` in `e` is supported by studies that measured muscle growth (`evidence`). */
export const isSupported = (e: Exercise, m: Muscle) => !e.sources?.[m] && !!e.evidence?.[m]?.length;

/** True when the planner's classification of muscle `m` in `e` is its own assumption: neither from Pelland et al.'s
 * table nor supported by studies that measured muscle growth. */
export const isAssumed = (e: Exercise, m: Muscle) => !e.sources?.[m] && !e.evidence?.[m]?.length;

/** Counted muscles (direct and indirect) whose classification is the planner's own assumption. */
export const assumedMuscles = (e: Exercise) => [...e.direct, ...e.indirect].filter((m) => isAssumed(e, m));
