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
  /**
   * Names to show by the equipment the visitor has: the first variant whose `using` includes an equipment item they
   * ticked. `name` is the fallback and what the exercise is called in the list of exercises to include.
   */
  variants?: { using: Equipment[]; name: string }[];
  /**
   * Set where a source classified only some versions: the equipment the studied version used and a plain-words name for
   * it. Other variants are shown as assumed to load the same muscles.
   */
  studied?: { with: Equipment[]; as: string };
  /**
   * A page showing how to do the exercise (checked 20 Nov 2026): the American Council on Exercise (ACE) exercise library
   * first; where it has no suitable page, the National Academy of Sports Medicine (NASM) exercise library or the National
   * Strength and Conditioning Association (NSCA). For technique only: no classification or number comes from it, so it
   * isn't a reference and isn't archived. The page may show another version (equipment or stance) of the same movement;
   * its title says which.
   */
  howTo?: { source: "ACE" | "NASM" | "NSCA" | "Mayo Clinic" | "Concept2" | "Cleveland Clinic" | "Swim England" | "NHS"; title: string; url: string };
  /** A position held or carried, not repeated through a range. Pelland et al. analysed dynamic training only, so these are shown last. */
  hold?: true;
  /** Muscles that hold a position but don't move a joint through a range: shown, not counted. */
  steadies?: Muscle[];
  /** Compendium rows (aerobic and interval activities), lightest effort first. None is a Compendium estimate (checked 20 Nov 2026). */
  met?: MetRow[];
};

const X = (e: Exercise) => e;

export const EXERCISES: Exercise[] = [
  // --- Bodyweight ---
  X({ id: "pushUp", name: "Push-up", kind: "strength", needs: [["body"]],
    howTo: { source: "ACE", title: "Push-up", url: "https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/" },
    evidence: { chest: ["kikuchi-2017"], triceps: ["kikuchi-2017"] },
    moves: "shoulder horizontal adduction (arms together across the chest); elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"], steadies: ["abs"] }),
  X({ id: "pullUp", name: "Pull-up", kind: "strength", needs: [["pullupBar"]],
    howTo: { source: "ACE", title: "Pull-ups", url: "https://www.acefitness.org/resources/everyone/exercise-library/191/pull-ups/" },
    moves: "shoulder adduction and extension (elbows down and back); elbow flexion",
    direct: ["lats"], indirect: ["biceps", "upperBack"], steadies: ["forearms"] }),
  X({ id: "invertedRow", name: "Inverted row (under a bar or sturdy table)", kind: "strength", needs: [["pullupBar", "table", "rack", "machines"]],
    howTo: { source: "ACE", title: "What Is the Best Back Exercise? (ACE-sponsored study; the inverted row as performed)", url: "https://www.acefitness.org/education-and-resources/professional/certified/april-2018/6959/ace-sponsored-research-what-is-the-best-back-exercise/" },
    moves: "shoulder extension and shoulder-blade retraction (pulling the chest to the bar); elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"], steadies: ["forearms", "glutes"] }),
  X({ id: "squatBw", name: "Bodyweight squat", kind: "strength", needs: [["body"]],
    howTo: { source: "ACE", title: "Bodyweight Squat", url: "https://www.acefitness.org/resources/everyone/exercise-library/135/bodyweight-squat/" },
    moves: "knee extension; hip extension",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "lunge", name: "Bodyweight lunge (reverse or forward)", kind: "strength", needs: [["body"]],
    howTo: { source: "ACE", title: "Forward Lunge", url: "https://www.acefitness.org/resources/everyone/exercise-library/94/forward-lunge/" },
    evidence: { glutes: ["wei-2023", "krause-neto-2025"] },
    moves: "knee extension; hip extension, one leg at a time",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "gluteBridge", name: "Glute bridge", kind: "strength", needs: [["body"]],
    howTo: { source: "ACE", title: "Glute Bridge", url: "https://www.acefitness.org/resources/everyone/exercise-library/49/glute-bridge/" },
    moves: "hip extension (lifting the hips from the floor)",
    // Hamstrings not counted: they didn't grow after hip thrust training (Plotkin et al. 2023); same movement.
    direct: ["glutes"], indirect: [] }),
  X({ id: "singleLegRdl", name: "Single-leg Romanian deadlift", kind: "strength", needs: [["body", "dumbbells", "kettlebell"]],
    howTo: { source: "ACE", title: "Single-leg Romanian Deadlift", url: "https://www.acefitness.org/resources/everyone/exercise-library/329/single-leg-romanian-deadlift/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell single-leg Romanian deadlift" }, { using: ["kettlebell"], name: "Kettlebell single-leg Romanian deadlift" }, { using: ["body"], name: "Single-leg Romanian deadlift (bodyweight)" }],
    moves: "hip extension with a nearly straight knee, on one leg (hinging at the hip)",
    direct: ["hamstrings", "glutes"], indirect: [], steadies: ["lowerBack"] }),
  X({ id: "plank", name: "Plank", kind: "strength", needs: [["body"]],
    howTo: { source: "ACE", title: "Front Plank", url: "https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/" },
    hold: true,
    moves: "holds the trunk straight against gravity (no joint movement)",
    direct: ["abs"], indirect: [] }),
  X({ id: "crunch", name: "Crunch", kind: "strength", needs: [["body"]],
    howTo: { source: "ACE", title: "Crunch", url: "https://www.acefitness.org/resources/everyone/exercise-library/52/crunch/" },
    moves: "trunk flexion (curling the ribs towards the hips)",
    direct: ["abs"], indirect: [] }),
  X({ id: "hangingKneeRaise", name: "Hanging knee raise, curling the pelvis up", kind: "strength", needs: [["pullupBar"]],
    moves: "hip flexion (by the iliopsoas) with trunk flexion (by the abs): curl the pelvis up towards the ribs as the knees rise",
    direct: ["abs"], indirect: [], steadies: ["forearms"] }),
  X({ id: "benchDip", name: "Bench dip", kind: "strength", needs: [["chair", "bench"]],
    howTo: { source: "ACE", title: "Total-body Sprint/Body-weight Circuit (Triceps Dips), by Jason R. Karp", url: "https://www.acefitness.org/continuing-education/certified/innovative-workouts-special-issue/7023/total-body-sprint-body-weight-circuit-to-improve-muscular-endurance/" },
    moves: "elbow extension, and shoulder flexion as you push up (the shoulders extend as you lower; hands on a bench behind you)",
    direct: ["triceps"], indirect: ["chest", "frontDelts"] }),
  X({ id: "calfRaise", name: "Standing calf raise", kind: "strength", needs: [["body", "stairs", "dumbbells", "machines"]],
    howTo: { source: "ACE", title: "Standing Calf Raises - Wall", url: "https://www.acefitness.org/resources/everyone/exercise-library/73/standing-calf-raises-wall/" },
    variants: [{ using: ["machines"], name: "Standing calf raise machine" }, { using: ["dumbbells"], name: "Dumbbell standing calf raise" }, { using: ["body", "stairs"], name: "Standing calf raise (bodyweight, off the edge of a step if you have one)" }],
    evidence: { calves: ["kinoshita-2023"] },
    moves: "ankle plantar flexion (rising onto the toes)",
    direct: ["calves"], indirect: [] }),
  X({ id: "superman", name: "Back extension on the floor (superman)", kind: "strength", needs: [["body"]],
    howTo: { source: "ACE", title: "Supermans", url: "https://www.acefitness.org/resources/everyone/exercise-library/9/supermans/" },
    moves: "spine extension; hip extension (lifting chest and legs from the floor, face down)",
    direct: ["lowerBack"], indirect: ["glutes", "hamstrings"] }),
  X({ id: "pikePushUp", name: "Pike push-up", kind: "strength", needs: [["body"]],
    howTo: { source: "NASM", title: "Pike Push-Up", url: "https://www.nasm.org/resource-center/exercise-library/pike-push-up" },
    moves: "shoulder flexion and abduction (pressing overhead with hips raised); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"] }),

  // --- Bands ---
  X({ id: "bandRow", name: "Resistance-band row", kind: "strength", needs: [["bands"]],
    howTo: { source: "ACE", title: "Standing Row (cable)", url: "https://www.acefitness.org/resources/everyone/exercise-library/335/standing-row/" },
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"] }),
  X({ id: "bandPullApart", name: "Band pull-apart", kind: "strength", needs: [["bands"]],
    howTo: { source: "ACE", title: "10-minute Shoulder Workout (Banded Pull-apart), by Sabrena Jo", url: "https://www.acefitness.org/resources/everyone/blog/5606/10-minute-shoulder-workout/" },
    moves: "shoulder horizontal abduction (arms apart) and shoulder-blade retraction",
    direct: ["upperBack"], indirect: ["rearDelts"] }),

  // --- Dumbbells and kettlebells ---
  X({ id: "gobletSquat", name: "Goblet squat", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    howTo: { source: "ACE", title: "Goblet Squat", url: "https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell goblet squat" }, { using: ["kettlebell"], name: "Kettlebell goblet squat" }],
    moves: "knee extension; hip extension, holding one weight at the chest",
    direct: ["quads", "glutes"], indirect: [], steadies: ["upperBack", "abs"] }),
  X({ id: "lungeDb", name: "Dumbbell lunge", kind: "strength", needs: [["dumbbells"]],
    howTo: { source: "ACE", title: "Lunge (dumbbells)", url: "https://www.acefitness.org/resources/everyone/exercise-library/363/lunge/" },
    sources: { quads: "Dumbbell Lunge" },
    moves: "knee extension; hip extension, one leg at a time, holding dumbbells",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "dbFly", name: "Flat dumbbell fly", kind: "strength", needs: [["dumbbells"], ["bench"]],
    howTo: { source: "ACE", title: "Lying Chest Fly", url: "https://www.acefitness.org/resources/everyone/exercise-library/21/lying-chest-fly/" },
    sources: { chest: "Flat Dumbbell Fly" },
    moves: "shoulder horizontal adduction with nearly straight elbows, lying on a bench",
    direct: ["chest"], indirect: [] }),
  X({ id: "dbBench", name: "Dumbbell bench press", kind: "strength", needs: [["dumbbells"], ["bench"]],
    howTo: { source: "ACE", title: "Chest Press (dumbbells)", url: "https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/" },
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"] }),
  X({ id: "dbRow", name: "One-arm row", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    howTo: { source: "ACE", title: "Single-arm Row", url: "https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/" },
    variants: [{ using: ["dumbbells"], name: "One-arm dumbbell row" }, { using: ["kettlebell"], name: "One-arm kettlebell row" }],
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"], steadies: ["lowerBack"] }),
  X({ id: "dbPress", name: "Shoulder press (dumbbell or kettlebell)", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    howTo: { source: "ACE", title: "Seated Overhead Press", url: "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell shoulder press" }, { using: ["kettlebell"], name: "Kettlebell shoulder press" }],
    studied: { with: ["dumbbells"], as: "dumbbell" },
    sources: { triceps: "Dumbbell Shoulder Press" },
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"] }),
  X({ id: "lateralRaise", name: "Lateral raise", kind: "strength", needs: [["dumbbells", "machines"]],
    howTo: { source: "ACE", title: "Lateral Raise", url: "https://www.acefitness.org/resources/everyone/exercise-library/26/lateral-raise/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell lateral raise" }, { using: ["machines"], name: "Cable or machine lateral raise" }],
    evidence: { sideDelts: ["larsen-2025"] },
    moves: "shoulder abduction (arms out to the sides)",
    direct: ["sideDelts"], indirect: [] }),
  X({ id: "curl", name: "Biceps curl", kind: "strength", needs: [["dumbbells", "barbell", "bands", "machines"]],
    howTo: { source: "ACE", title: "Seated Biceps Curl", url: "https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell biceps curl" }, { using: ["barbell"], name: "Barbell biceps curl" }, { using: ["bands"], name: "Resistance-band biceps curl" }, { using: ["machines"], name: "Cable or machine biceps curl" }],
    sources: { biceps: "Bicep Curl" },
    moves: "elbow flexion",
    direct: ["biceps"], indirect: [], steadies: ["forearms"] }),
  X({ id: "overheadExt", name: "Overhead triceps extension", kind: "strength", needs: [["dumbbells", "kettlebell", "bands", "machines"]],
    howTo: { source: "ACE", title: "Triceps Extension", url: "https://www.acefitness.org/resources/everyone/exercise-library/74/triceps-extension/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell overhead triceps extension" }, { using: ["kettlebell"], name: "Kettlebell overhead triceps extension" }, { using: ["bands"], name: "Resistance-band overhead triceps extension" }, { using: ["machines"], name: "Cable overhead triceps extension" }],
    studied: { with: ["dumbbells"], as: "dumbbell" },
    sources: { triceps: "Overhead Dumbbell Extensions" },
    moves: "elbow extension with the arm overhead",
    direct: ["triceps"], indirect: [] }),
  X({ id: "rdl", name: "Romanian deadlift", kind: "strength", needs: [["dumbbells", "kettlebell", "barbell"]],
    howTo: { source: "ACE", title: "Romanian Deadlift", url: "https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell Romanian deadlift" }, { using: ["kettlebell"], name: "Kettlebell Romanian deadlift" }, { using: ["barbell"], name: "Barbell Romanian deadlift" }],
    evidence: { hamstrings: ["morin-2025"] },
    moves: "hip extension with nearly straight knees (hinging at the hips)",
    direct: ["hamstrings", "glutes"], indirect: [], steadies: ["lowerBack", "forearms", "upperBack"] }),
  X({ id: "farmerCarry", name: "Farmer's carry", kind: "strength", needs: [["dumbbells", "kettlebell"]],
    howTo: { source: "ACE", title: "Farmer's Carry", url: "https://www.acefitness.org/resources/everyone/exercise-library/359/farmer-s-carry/" },
    hold: true,
    variants: [{ using: ["dumbbells"], name: "Dumbbell farmer's carry" }, { using: ["kettlebell"], name: "Kettlebell farmer's carry" }],
    moves: "gripping heavy weights while walking (holding, little joint movement)",
    direct: ["forearms"], indirect: [], steadies: ["upperBack", "abs"] }),
  X({ id: "kbSwing", name: "Kettlebell swing", kind: "intervals", needs: [["kettlebell"]],
    howTo: { source: "ACE", title: "Swing", url: "https://www.acefitness.org/resources/everyone/exercise-library/391/swing/" },
    moves: "fast, repeated hip extension (hinging and snapping the hips forward)",
    direct: ["glutes", "hamstrings"], indirect: [], steadies: ["lowerBack", "forearms"],
    met: [{ code: "02058", met: 9.8, label: "Kettle bell swings" }] }),

  // --- Barbell ---
  X({ id: "backSquat", name: "Barbell back squat", kind: "strength", needs: [["barbell"], ["rack"]],
    howTo: { source: "ACE", title: "Back Squat", url: "https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/" },
    sources: { quads: "Back Squat" },
    evidence: { glutes: ["krause-neto-2025", "plotkin-2023"] },
    moves: "knee extension; hip extension (squatting to thighs parallel with the floor or lower)",
    direct: ["quads", "glutes"], indirect: [], steadies: ["lowerBack", "abs"] }),
  X({ id: "deadlift", name: "Deadlift", kind: "strength", needs: [["barbell", "kettlebell", "dumbbells"]],
    howTo: { source: "ACE", title: "Deadlift", url: "https://www.acefitness.org/resources/everyone/exercise-library/6/deadlift/" },
    variants: [{ using: ["barbell"], name: "Barbell deadlift" }, { using: ["kettlebell"], name: "Kettlebell deadlift" }, { using: ["dumbbells"], name: "Dumbbell deadlift" }],
    moves: "hip extension; knee extension (lifting a weight from the floor)",
    direct: ["glutes", "hamstrings"], indirect: ["quads"], steadies: ["lowerBack", "forearms", "upperBack"] }),
  X({ id: "benchPress", name: "Barbell bench press", kind: "strength", needs: [["barbell"], ["bench"], ["rack"]],
    howTo: { source: "ACE", title: "Chest Press (barbell)", url: "https://www.acefitness.org/resources/everyone/exercise-library/5/chest-press/" },
    sources: { chest: "Bench Press", frontDelts: "Bench Press", triceps: "Flat Bench Press" },
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"] }),
  X({ id: "ohp", name: "Barbell overhead press", kind: "strength", needs: [["barbell"]],
    howTo: { source: "ACE", title: "Standing Shoulder Press", url: "https://www.acefitness.org/resources/everyone/exercise-library/71/standing-shoulder-press/" },
    sources: { frontDelts: "Barbell Shoulder Press", triceps: "Shoulder Press" },
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"], steadies: ["abs"] }),
  X({ id: "frontRaise", name: "Barbell front raise", kind: "strength", needs: [["barbell"]],
    howTo: { source: "ACE", title: "Front Raise (dumbbells)", url: "https://www.acefitness.org/resources/everyone/exercise-library/54/front-raise/" },
    sources: { frontDelts: "Barbell Shoulder Front Raise" },
    moves: "shoulder flexion (raising straight arms in front to shoulder height)",
    direct: ["frontDelts"], indirect: [] }),
  X({ id: "bbRow", name: "Barbell bent-over row", kind: "strength", needs: [["barbell"]],
    howTo: { source: "ACE", title: "Bent-over Row", url: "https://www.acefitness.org/resources/everyone/exercise-library/12/bent-over-row/" },
    sources: { biceps: "Bent-Over Barbell Row" },
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"], steadies: ["lowerBack", "hamstrings"] }),
  X({ id: "hipThrust", name: "Hip thrust", kind: "strength", needs: [["barbell", "dumbbells"], ["bench", "chair"]],
    howTo: { source: "ACE", title: "Elevated Glute Bridge (dumbbells)", url: "https://www.acefitness.org/resources/everyone/exercise-library/367/elevated-glute-bridge/" },
    variants: [{ using: ["barbell"], name: "Barbell hip thrust" }, { using: ["dumbbells"], name: "Dumbbell hip thrust" }],
    evidence: { glutes: ["plotkin-2023", "krause-neto-2025"] },
    moves: "hip extension (back on a bench, lifting the hips)",
    // Hamstrings not counted: no meaningful growth after 9 weeks of hip thrust training (Plotkin et al. 2023).
    direct: ["glutes"], indirect: [] }),

  // --- Machines and cables ---
  X({ id: "legPress", name: "Leg press", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Seated Leg Press", url: "https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/" },
    sources: { quads: "Leg Press" },
    evidence: { glutes: ["krause-neto-2025"] },
    moves: "knee extension; hip extension",
    direct: ["quads", "glutes"], indirect: [] }),
  X({ id: "legExtension", name: "Leg extension", kind: "strength", needs: [["machines"]],
    howTo: { source: "Mayo Clinic", title: "Video: Knee extension with weight machine", url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/knee-extension/vid-20084686" },
    sources: { quads: "Leg Extension" },
    moves: "knee extension",
    direct: ["quads"], indirect: [] }),
  X({ id: "legCurl", name: "Leg curl", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Lying Hamstrings Curl", url: "https://www.acefitness.org/resources/everyone/exercise-library/153/lying-hamstrings-curl/" },
    sources: { hamstrings: "Leg Curl" },
    moves: "knee flexion",
    direct: ["hamstrings"], indirect: ["calves"] }),
  X({ id: "latPulldown", name: "Lat pulldown", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Seated Lat Pulldown", url: "https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/" },
    sources: { biceps: "Lat Pulldown", upperBack: "Lat Pulldown" },
    moves: "shoulder adduction and extension (elbows down); elbow flexion",
    direct: ["lats"], indirect: ["biceps", "upperBack"] }),
  X({ id: "cableRow", name: "Seated cable row", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Seated Row", url: "https://www.acefitness.org/resources/everyone/exercise-library/48/seated-row/" },
    sources: { biceps: "Seated Row", upperBack: "Seated Row" },
    moves: "shoulder extension and shoulder-blade retraction; elbow flexion",
    direct: ["lats"], indirect: ["upperBack", "biceps", "rearDelts"] }),
  X({ id: "chestPress", name: "Chest press machine", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Seated Chest Press", url: "https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/" },
    sources: { frontDelts: "Chest Press", triceps: "Machine Press" },
    moves: "shoulder horizontal adduction; elbow extension",
    direct: ["chest"], indirect: ["triceps", "frontDelts"] }),
  X({ id: "pecFly", name: "Chest fly (machine or cable)", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Standing Chest Fly (cable)", url: "https://www.acefitness.org/resources/everyone/exercise-library/160/standing-chest-fly/" },
    moves: "shoulder horizontal adduction with nearly straight elbows",
    direct: ["chest"], indirect: [] }),
  X({ id: "shoulderPressMachine", name: "Shoulder press machine", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Seated Shoulder Press", url: "https://www.acefitness.org/resources/everyone/exercise-library/186/seated-shoulder-press/" },
    sources: { triceps: "Shoulder Press" },
    moves: "shoulder flexion and abduction (pressing overhead); elbow extension",
    direct: ["frontDelts"], indirect: ["triceps", "sideDelts", "upperBack"] }),
  X({ id: "pushdown", name: "Triceps pushdown", kind: "strength", needs: [["machines", "bands"]],
    howTo: { source: "ACE", title: "Triceps Pushdowns", url: "https://www.acefitness.org/resources/everyone/exercise-library/185/triceps-pushdowns/" },
    variants: [{ using: ["machines"], name: "Cable triceps pushdown" }, { using: ["bands"], name: "Resistance-band triceps pushdown" }],
    sources: { triceps: "Tricep Push-Down" },
    moves: "elbow extension",
    direct: ["triceps"], indirect: [] }),
  X({ id: "facePull", name: "Face pull", kind: "strength", needs: [["machines", "bands"]],
    howTo: { source: "NSCA", title: "Face Pull (Machine), from the NSCA's Exercise Technique Manual", url: "https://www.nsca.com/education/articles/kinetic-select/face-pull-machine/" },
    variants: [{ using: ["machines"], name: "Cable face pull" }, { using: ["bands"], name: "Resistance-band face pull" }],
    moves: "shoulder horizontal abduction and external rotation; shoulder-blade retraction",
    direct: ["upperBack", "rearDelts"], indirect: [] }),
  X({ id: "shrug", name: "Shrug", kind: "strength", needs: [["dumbbells", "barbell", "machines"]],
    howTo: { source: "ACE", title: "Standing Shrug", url: "https://www.acefitness.org/resources/everyone/exercise-library/75/standing-shrug/" },
    variants: [{ using: ["dumbbells"], name: "Dumbbell shrug" }, { using: ["barbell"], name: "Barbell shrug" }, { using: ["machines"], name: "Shrug machine" }],
    moves: "shoulder-blade elevation (shoulders up towards the ears), done by the trapezius; the rhomboids retract the shoulder blades instead",
    direct: ["upperBack"], indirect: [], steadies: ["forearms"] }),
  X({ id: "backExtension", name: "Back extension (45° bench or machine)", kind: "strength", needs: [["machines"]],
    evidence: { hamstrings: ["bourne-2017"] },
    moves: "spine extension; hip extension",
    direct: ["lowerBack"], indirect: ["glutes", "hamstrings"] }),
  X({ id: "cableCrunch", name: "Cable crunch", kind: "strength", needs: [["machines"]],
    howTo: { source: "ACE", title: "Standing Crunch (cable)", url: "https://www.acefitness.org/resources/everyone/exercise-library/331/standing-crunch/" },
    moves: "trunk flexion against a cable",
    direct: ["abs"], indirect: [] }),

  // --- Aerobic ---
  X({ id: "walk", name: "Brisk walking", kind: "aerobic", needs: [["outdoors", "treadmill"]],
    howTo: { source: "Mayo Clinic", title: "Walking: Trim your waistline, improve your health (Consider your technique)", url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/walking/art-20046261" },
    moves: "walking", direct: [], indirect: [],
    met: [{ code: "17200", met: 4.8, label: "Walking, 3.5 to 3.9 mph, level, brisk, firm surface, walking for exercise" }] }),
  X({ id: "run", name: "Running or jogging", kind: "aerobic", needs: [["outdoors", "treadmill"]],
    howTo: { source: "ACE", title: "5 Tips for Optimizing Running Form", url: "https://www.acefitness.org/resources/pros/expert-articles/5415/5-tips-for-optimizing-running-form/" },
    moves: "running", direct: [], indirect: [],
    met: [{ code: "12020", met: 7.5, label: "Jogging, general, self-selected pace" },
      { code: "12050", met: 9.3, label: "Running, 6-6.3 mph (10 min/mile)" }] }),
  X({ id: "cycle", name: "Exercise bike", kind: "aerobic", needs: [["bike"]],
    howTo: { source: "ACE", title: "Indoor Cycling: The Breakdown on Bike Set-Up", url: "https://www.acefitness.org/education-and-resources/lifestyle/blog/3414/indoor-cycling-the-breakdown-on-bike-set-up/" },
    moves: "cycling", direct: [], indirect: [],
    met: [{ code: "01216", met: 5.0, label: "Bicycling, stationary, 60 watts, light to moderate effort" },
      { code: "01200", met: 6.8, label: "Bicycling, stationary, general" }] }),
  X({ id: "row", name: "Rowing machine", kind: "aerobic", needs: [["rower"]],
    howTo: { source: "Concept2", title: "Indoor Rowing Technique", url: "https://www.concept2.com/training/rowing-technique" },
    moves: "rowing", direct: [], indirect: [],
    met: [{ code: "02071", met: 5.0, label: "Rowing, stationary ergometer, general, <100 watts, moderate effort" },
      { code: "02070", met: 7.3, label: "Rowing, stationary ergometer, general, vigorous effort" }] }),
  X({ id: "elliptical", name: "Cross-trainer (elliptical)", kind: "aerobic", needs: [["crossTrainer"]],
    howTo: { source: "Cleveland Clinic", title: "Treadmill or Elliptical? Which Is Better for You? (What to know about ellipticals)", url: "https://health.clevelandclinic.org/treadmill-or-elliptical-how-to-decide-whats-your-best-workout" },
    moves: "elliptical stepping", direct: [], indirect: [],
    met: [{ code: "02048", met: 5.0, label: "Elliptical trainer, moderate effort" },
      { code: "02049", met: 9.0, label: "Elliptical trainer, vigorous effort" }] }),
  X({ id: "skip", name: "Skipping (jumping rope)", kind: "aerobic", needs: [["rope"]],
    howTo: { source: "ACE", title: "6 Exercise Swaps That Will Kick up the Intensity of Your Workout (swap 6: jumping rope)", url: "https://www.acefitness.org/resources/pros/expert-articles/5326/6-exercise-swaps-that-will-kick-up-the-intensity-of-your-workout/" },
    moves: "skipping", direct: [], indirect: [],
    met: [{ code: "15552", met: 8.3, label: "Rope jumping, slow pace, < 100 skips/min, 2 foot skip, rhythm bounce" },
      { code: "15551", met: 11.8, label: "Rope jumping, moderate pace, general, 100 to 120 skips/min, 2 foot skip, plain bounce" }] }),
  X({ id: "stairs", name: "Stair climbing", kind: "aerobic", needs: [["stairs"]],
    howTo: { source: "NHS", title: "Strength and balance exercise programme for falls prevention (Stair practice), South Tees Hospitals", url: "https://www.southtees.nhs.uk/resources/strength-and-balance-exercise-programme-for-falls-prevention/" },
    moves: "climbing stairs", direct: [], indirect: [],
    met: [{ code: "17133", met: 4.5, label: "Stair climbing, slow pace" },
      { code: "17131", met: 6.8, label: "Stair climbing, general" }] }),
  X({ id: "swim", name: "Swimming (front crawl)", kind: "aerobic", needs: [["pool"]],
    howTo: { source: "Swim England", title: "Tips for getting front crawl right", url: "https://www.swimming.org/justswim/tips-for-getting-front-crawl-right/" },
    moves: "swimming", direct: [], indirect: [],
    met: [{ code: "18240", met: 5.8, label: "Swimming laps, freestyle, slow, recreational" },
      { code: "18230", met: 9.8, label: "Swimming laps, freestyle, fast, vigorous effort" }] }),
  X({ id: "burpee", name: "Burpees, jumping jacks and similar", kind: "intervals", needs: [["body"]],
    howTo: { source: "NASM", title: "Squat Thrust Burpees", url: "https://www.nasm.org/resource-center/exercise-library/squat-thrust-burpees" },
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
