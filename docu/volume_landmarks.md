# Volume Landmarks — Rationale & Design Decisions

This document explains the scientific reasoning behind the values in `VOLUME_LANDMARKS`
in `src/services/trainingScience.ts`, and documents the key design decisions made when
calibrating them for this app's **effective-set model**.

---

## What Are Volume Landmarks?

Based on Renaissance Periodization (Dr. Mike Israetel et al.):

| Landmark | Abbreviation | Meaning |
|----------|-------------|---------|
| Minimum Effective Volume | **MEV** | Fewest sets/week needed to stimulate any adaptation. Below this = maintenance or regression. |
| Maximum Adaptive Volume (low) | **MAV Low** | Where the hypertrophy "sweet spot" begins. |
| Maximum Adaptive Volume (high) | **MAV High** | Upper end of optimal growth range. |
| Maximum Recoverable Volume | **MRV** | Above this, fatigue outpaces adaptation. Risk of overtraining. |

---

## Critical Design Decision: Effective Sets vs. Direct Sets

This app does **not** count only direct (isolation) sets. Every exercise credits muscle groups
based on their activation profile:

- **Primary muscle** receives **1.0** set credit per set logged.
- **Secondary muscles** receive a **fractional credit** (e.g. 0.3–0.7) per set logged.

Example: 4 sets of Bench Press → Chest: +4.0 sets, Triceps: +2.0 sets, Shoulders: +1.2 sets.

**Consequence:** The landmarks in this app must be calibrated against *effective sets*, not
just direct sets. A muscle that receives heavy secondary stimulus (Triceps from pressing,
Biceps from pulling) will accumulate effective sets much faster than a muscle that only
receives direct stimulus (Hamstrings, Calves). The landmarks are **shifted accordingly**
relative to raw RP direct-set recommendations.

---

## Squat → Hamstrings Coefficient: Why 0.1, Not 0.3

Scientific literature (Schoenfeld, Contreras) consistently shows that knee-dominant
movements (Squats, Leg Press, Lunges) provide near-zero *dynamic* hamstring stimulus.
The hamstring acts **isometrically** to stabilise the knee — it does not lengthen under
load, which is the primary driver of hypertrophy.

In contrast, hip-hinge movements (Romanian Deadlift, Deadlift, Good Mornings) do lengthen
the hamstring under load and are the primary hypertrophic stimulus.

**Applied coefficients:**
| Movement | Hamstrings credit | Rationale |
|----------|------------------|-----------|
| Squat, Kniebeuge | 0.1 | Near-zero dynamic stimulus |
| Leg Press | 0.1 | Same as Squat — knee-dominant |
| Lunges, Bulgarian Split Squat | 0.2 | Slightly more hip involvement than squat |
| Romanian Deadlift | primary (1.0) | Full lengthened-position stimulus |
| Deadlift | 0.7 | Significant hip hinge component |

---

## Per-Muscle Landmark Values and Reasoning

### Chest — `{ mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 }`

**Status:** Unchanged from original. Validated by two external AI reviews.

Chest receives minimal meaningful secondary stimulus from other movements. Effective sets ≈
direct sets. These numbers align closely with RP intermediate hypertrophy recommendations.

---

### Back — `{ mev: 8, mavLow: 14, mavHigh: 20, mrv: 25 }`

**Status:** Unchanged. One external review suggested lowering; another suggested raising.
Current values represent the defensible middle ground.

Back is a large muscle complex (lats, traps, rhomboids, erectors). While compound overlap
exists within Back movements, the app treats Back as a single group. MEV 8 is appropriate
for an intermediate; MRV 25 is high but justified given the volume back can tolerate.

---

### Quads — `{ mev: 6, mavLow: 12, mavHigh: 18, mrv: 20 }`

**Status:** Unchanged. Validated by both external reviews.

Quads are highly quad-dominant in most compound leg movements (Squat, Leg Press, Lunges).
Secondary overlap is limited. MRV 20 reflects the systemic fatigue from heavy leg training
that typically constrains volume before the muscle itself is overtrained.

---

### Hamstrings — `{ mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 }`

**Status:** Corrected from `{ mev: 4, mavLow: 10, mavHigh: 14, mrv: 16 }`.

**Why MEV was raised from 4 → 6:**
Squats and Leg Press were previously credited at 0.3 secondary sets for Hamstrings, which
inflated the effective set count without corresponding hypertrophic stimulus. After reducing
those coefficients to 0.1, the effective set total from compound work dropped significantly.
MEV 6 now correctly reflects that the hamstrings need meaningful direct hip-hinge or curl
volume to grow. Both external AI reviews confirmed MEV 4 was too low.

**Why mavHigh was raised from 14 → 16 and MRV from 16 → 20:**
Hamstrings respond well to high-frequency training and tolerate volume better than their
small size suggests. RP places hamstring MRV at 16–20 for direct sets; with the reduced
compound credit, 20 effective sets is the appropriate ceiling.

---

### Shoulders — `{ mev: 6, mavLow: 12, mavHigh: 20, mrv: 24 }`

**Status:** Corrected from `{ mev: 6, mavLow: 8, mavHigh: 18, mrv: 22 }`.

**Why MAV Low was raised from 8 → 12:**
The critical flaw in the original values was a MAV Low of 8 — only 2 sets above MEV (6).
This meant any trainee doing 2 sets of lateral raises would immediately read as "at MAV."
In practice, pressing compounds (Bench Press, OHP) already contribute ~3–5 effective
shoulder sets per week. The MAV band should only begin where *additional* stimulus on top
of that pressing base starts producing optimal growth. Both external reviews confirmed
MAV Low 12 is the correct minimum.

**Note on shoulder anatomy:** These landmarks treat Shoulders as primarily side and rear
delts. Front delts are largely saturated by pressing volume and rarely become a limiting
factor for most trainees.

**Why MRV was raised from 22 → 24:**
Shoulders (particularly side/rear delts) are small muscles with excellent recovery. They
tolerate high frequency and volume well, and RP typically places shoulder MRV at 22–26
for direct sets.

---

### Biceps — `{ mev: 4, mavLow: 8, mavHigh: 18, mrv: 24 }`

**Status:** Corrected from `{ mev: 4, mavLow: 6, mavHigh: 14, mrv: 20 }`.

**Why MEV stays at 4 (not raised):**
Pulling compounds (Pull-Ups, Rows, Lat Pulldown) contribute 0.4–0.5 effective sets per set.
A typical back session of 8–10 sets already delivers ~4–5 effective bicep sets. MEV 4
means these programs correctly register as "at MEV" before any direct curl work — which
is accurate: pulling-only programs do maintain biceps.

**Why MAV Low was raised from 6 → 8:**
MAV Low 6 was below what most trainees already accumulate "for free" from pulling. The
band should start where dedicated bicep work on top of compound pulling begins producing
optimal hypertrophy. Both external reviews confirmed 8 is the right floor.

**Why mavHigh was raised from 14 → 18 and MRV from 20 → 24:**
Biceps are small, recover quickly, and tolerate high frequency well. RP places bicep MRV
at 26 for direct sets. With compound inflation factored in, 24 effective sets is a
conservative but defensible ceiling.

---

### Triceps — `{ mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 }`

**Status:** Corrected from `{ mev: 4, mavLow: 6, mavHigh: 14, mrv: 18 }`.

**Rationale mirrors Biceps** but with a lower MRV ceiling.

Pressing compounds (Bench Press, OHP, Dips) contribute 0.4–0.5 effective sets per set.
A chest-focused session easily delivers 4–5 effective tricep sets. MAV Low 6 fired too
early for the same reason as Biceps. Raised to 8.

**Why MRV is lower than Biceps (20 vs 24):**
Triceps absorb heavy loading through pressing compounds and are subject to elbow joint
stress that limits recoverable volume. Both external reviews agreed on a lower tricep
MRV ceiling relative to biceps.

---

### Abs — `{ mev: 0, mavLow: 8, mavHigh: 16, mrv: 22 }`

**Status:** Corrected from `{ mev: 0, mavLow: 4, mavHigh: 16, mrv: 20 }`.

**Why MEV stays at 0:**
Correct. Compound movements (Squat, Deadlift, OHP) train the abs *isometrically* for
stability — similar to the Squat/Hamstring issue. This provides maintenance stimulus but
not meaningful hypertrophic drive. MEV 0 means a trainee not doing direct ab work will
not be flagged for "below MEV," which is accurate for general fitness goals.

**Why MAV Low was raised from 4 → 8:**
MAV Low 4 was far too low. 4 sets of ab work is closer to MEV than to the optimal growth
zone. Both external reviews agreed MAV Low should be 8 — the point where direct ab
training begins delivering consistent hypertrophic adaptation.

---

### Calves — `{ mev: 6, mavLow: 10, mavHigh: 18, mrv: 22 }`

**Status:** Corrected from `{ mev: 6, mavLow: 8, mavHigh: 14, mrv: 16 }`.

Calves are predominantly **slow-twitch muscle fibres**, making them uniquely fatigue-resistant
compared to other muscle groups. They require higher volume and frequency to stimulate
hypertrophy and recover faster between sessions. The original MRV of 16 was widely
flagged as too low — it represents a moderate session count for most people, not a ceiling.

Both external reviews independently agreed on raising mavHigh to 16–20 and MRV to 20+.
The chosen values (mavHigh 18, MRV 22) are conservative-but-correct for an effective-set model.

---

### Glutes — `{ mev: 6, mavLow: 8, mavHigh: 16, mrv: 20 }`

**Status:** Corrected from `{ mev: 0, mavLow: 4, mavHigh: 12, mrv: 16 }`.

**Why MEV was raised from 0 → 6:**
The original MEV 0 was incorrect — it meant the app would never flag insufficient glute
volume. While glutes do receive significant secondary stimulus from Squats (0.6), Lunges
(0.6), RDLs (0.7), and Hip Thrusts (primary), this secondary volume is often not enough
for optimal glute hypertrophy, particularly in programs that neglect direct hip thrust or
kickback work. MEV 6 aligns with RP recommendations.

**Why the MAV range was expanded:**
MAV High 12 was too conservative given how much compound overlap glutes receive. Glutes
can tolerate and benefit from high effective volume. The expanded range (8–16) better
reflects the reality that many trainees accumulate 10–14 effective glute sets per week
from compound lower-body work before adding any isolation.

---

## Review History

These values were derived through:
1. Initial values set based on RP literature (direct-set model)
2. Internal analysis adjusting for the effective-set fractional credit model
3. Cross-validated against two independent AI reviews (GPT-class and Claude-class models)
   using a detailed prompt describing the effective-set methodology
4. Final consensus values chosen, favouring the more conservative estimate when the two
   reviews disagreed

**Source references:**
- Israetel, M., Hoffmann, J., & Case, C. (2019). *Scientific Principles of Hypertrophy Training.* Renaissance Periodization.
- Schoenfeld, B.J. (2010). The mechanisms of muscle hypertrophy and their application to resistance training. *Journal of Strength and Conditioning Research*.
- Contreras, B., & Schoenfeld, B. (2011). To crunch or not to crunch. *Strength and Conditioning Journal*.
