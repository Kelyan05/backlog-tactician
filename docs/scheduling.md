# Scheduling engine design

## Problem statement

Every week you have a fixed number of free hours and a backlog of games, each
with an estimated number of hours left to finish. The question the app exists
to answer is: **given this week's hours, which games should I play, and in
what order?**

That's the [0/1 knapsack problem](https://en.wikipedia.org/wiki/Knapsack_problem):

| Knapsack concept | Backlog Tactician |
|---|---|
| Item | A game |
| Weight | Remaining hours to finish (`timeToBeatHours` minus hours already played) |
| Capacity | Hours free this week (`hoursAvailable`) |
| Value | A computed priority score (see below) |
| Goal | Pick the subset of games that fits in the capacity and maximises total value |

It's "0/1" and not fractional: you either commit to finishing a game this
week or you don't — there's no such thing as playing 30% of a game and
counting it as scheduled.

Games with no time-to-beat estimate at all (`timeToBeatSource = NONE`, see
[the partial-data engineering note](../README.md#-engineering-notes)) can't
be sized as knapsack items and are excluded from scheduling — you can't fit
an item into a bag if you don't know how heavy it is. That's also the
strongest incentive to go fill in a manual estimate.

## Scoring formula (v1)

Every schedulable game gets a score built from two signals:

```
completionRatio  = clamp(playtimeHours / timeToBeatHours, 0, 1)
completionBonus  = completionRatio * 10          // reward finishing what you started

daysSincePlayed  = lastPlayedAt ? (now - lastPlayedAt) in days : null
recencyPenalty   = daysSincePlayed !== null && daysSincePlayed < 3
                     ? 3 * (1 - daysSincePlayed / 3)
                     : 0                          // discourage re-suggesting what you just played

score = 5 + completionBonus - recencyPenalty       // base value of 5 keeps score always positive
```

- **Near-completion bonus**: a game you're 80% through should heavily
  outrank a game you haven't touched, *at the same remaining length* — the
  whole point is finishing your backlog, not just starting more of it.
- **Recency penalty**: a game you played in the last 3 days is *slightly*
  deprioritised so the plan doesn't just repeat "play the thing you're
  already playing" every week — it nudges toward surfacing backlog variety.
  It decays linearly to zero by day 3, and doesn't apply at all to games
  that have never been played (nothing to be recent about).
- **Genre-variety bonus** (issue #12): `+3` to a game's score if its genre
  (from IGDB, see `Game.genre`) **isn't already represented** among the
  games already placed in this plan; `0` if the genre repeats, or if the
  game has no known genre. Unlike the other two signals, this one isn't a
  static per-game number — see "Why variety breaks the simple greedy sort"
  below.

The knapsack "value" used for selection is this `score`; the "weight" is
`remainingHours = max(timeToBeatHours - playtimeHours, 0.5)` (floored so a
nearly-finished game never rounds down to a zero-weight item, which would
break value-density sorting via division by zero).

## Greedy algorithm

Exact 0/1 knapsack is solvable with dynamic programming in
`O(items × capacity)`, but at real-world scale (dozens of games, capacity in
hours rather than integer units fine enough to index a DP table cheaply)
that's more machinery than the payoff justifies for a v1. The greedy
approximation is simpler, fast, and good enough:

```
1. For every schedulable game, compute score and remainingHours.
2. Sort games by score / remainingHours (value density) descending.
3. Walk the sorted list, tracking hoursUsed:
     for each game:
       if hoursUsed + remainingHours <= hoursAvailable:
         take it, hoursUsed += remainingHours
       else:
         skip it (do NOT stop — a smaller game further down the list
         may still fit in the space that's left)
4. Return the taken games, in the order they were taken (highest density first).
```

The "skip, don't stop" rule in step 3 matters: sorting by density and
**breaking** on the first game that doesn't fit is a natural-looking but
wrong shortcut — a single expensive, high-density game sorted first can
make the loop bail out immediately even when several smaller games later in
the list would easily fit the week. Skipping and continuing is what makes
the greedy heuristic reasonable in practice.

Where DP would fit: an exact solution would try every combination (or build
a table of best-value-per-hour-budget) to guarantee the optimal subset,
trading simplicity for a guarantee. That's the noted stretch goal — greedy
can end up a few percent off optimal in adversarial cases, DP never does.

### Why variety breaks the simple greedy sort (issue #12)

The steps above describe a **single static sort**: compute every game's
score once, sort once, walk the list once. That works because
completionBonus and recencyPenalty are properties of a game *by itself* —
they never change based on what else is in the plan.

Genre variety isn't like that. Whether a game's genre "counts" as new
depends entirely on which genres are already in the plan when that game is
considered — which depends on the order games get taken in, which is the
very thing the algorithm is deciding. A single upfront sort can't express
"give me a bonus if nothing else picked so far shares my genre," because
"picked so far" doesn't exist yet at sort time.

`generatePlan()` handles this by turning step 2-3 into a loop instead of a
sort-then-scan:

```
remaining = every schedulable game, scored (completionBonus/recencyPenalty only)
chosen = [], seenGenres = {}, hoursUsed = 0

repeat:
  best = null
  for each game in remaining that still fits (hoursUsed + remainingHours <= hoursAvailable):
    varietyBonus = (game.genre is set AND not in seenGenres) ? 3 : 0
    density = (game.score + varietyBonus) / game.remainingHours
    keep track of whichever game has the highest density so far
  if no game fits: stop
  take `best`, add its genre to seenGenres, hoursUsed += its remainingHours
```

This re-ranks the *remaining* candidates against the *current* plan on
every iteration — `O(n²)` instead of `O(n log n)`, which only matters at
library sizes far larger than a personal Steam backlog will ever reach.
When no game has a genre (or all games share one), every `varietyBonus` is
`0` on every iteration, and this loop provably produces the exact same
picks, in the exact same order, as the original single-sort version — the
full pre-#12 test suite (`src/engine/__tests__/scheduler.test.ts`) still
passes unchanged against this version precisely because of that.

**`generatePlanExact()` does not model this.** Extending the DP to account
for variety would mean tracking *which genres have been used* as part of
the table's state, not just *how much capacity is left* — the number of
possible genre-subsets grows exponentially with the number of distinct
genres, turning simple knapsack into something closer to budgeted maximum
coverage. That's a materially bigger problem than issue #11 set out to
solve, so the exact solver stays a pure completion/recency comparison, and
the comparisons in `scripts/compareSchedulers.ts` only ever measure greedy
against exact on those two dimensions — not on variety.

## Worked example

Weekly budget: **10 hours**. Five candidate games:

| Game | timeToBeatHours | playtimeHours | lastPlayedAt | remainingHours | completionBonus | recencyPenalty | score | density (score/hr) |
|---|---|---|---|---|---|---|---|---|
| A — Celeste | 9 | 7.5 | 10 days ago | 1.5 | 8.33 | 0 | 13.33 | 8.89 |
| B — Hades | 22 | 2 | 1 day ago | 20 | 0.91 | 2 | 3.91 | 0.20 |
| C — Portal 2 | 8.5 | 0 | never | 8.5 | 0 | 0 | 5.00 | 0.59 |
| D — Slay the Spire | 24 | 20 | 1 day ago | 4 | 8.33 | 2 | 11.33 | 2.83 |
| E — Stardew Valley | 52 | 4 | 20 days ago | 48 | 0.77 | 0 | 5.77 | 0.12 |

Sorted by density: **A (8.89) → D (2.83) → C (0.59) → B (0.17) → E (0.12)**

Greedy walk with `hoursAvailable = 10`:

1. **A** (1.5h): fits (0 → 1.5). Take it.
2. **D** (4h): fits (1.5 → 5.5). Take it.
3. **C** (8.5h): 5.5 + 8.5 = 14 > 10. Doesn't fit. Skip (not break).
4. **B** (20h): 5.5 + 20 way over budget. Skip.
5. **E** (48h): way over budget. Skip.

**Result:** play Celeste (1.5h) then Slay the Spire (4h) — 5.5 of 10 hours
used, finishing two games this week, and the two nearly-done, cheap-to-finish
titles beat both the freshly-started Portal 2 and the much larger, barely
touched Hades and Stardew Valley. That's the near-completion bonus doing
its job: it's not just "smallest items first" (a plain bin-packing greedy
would also grab Celeste and Slay the Spire here, since they're cheapest) —
it's that finishing power is baked into the *value*, not only the weight,
so a near-finished game would still be favoured over an equally-cheap fresh
one.

## Greedy vs. exact DP — the trade-off, out loud

- **Greedy** sorts by value density and takes what fits, skipping what
  doesn't. It's `O(n log n)`, trivial to implement and reason about, and
  gives a good-not-guaranteed-optimal answer. It can be fooled: a knapsack
  with one item worth 10 that weighs slightly more than capacity, and two
  items worth 6 each that together weigh exactly capacity, greedily prefers
  chasing the single 10-value item's density and can miss the 12-value pair
  if it doesn't backtrack — greedy never reconsiders a skip.
- **Exact DP** builds a table of "best value achievable with capacity `c`
  using the first `i` items" and fills it bottom-up, guaranteeing the
  optimal subset in `O(n × capacity)` time. The cost is that "capacity" here
  is continuous hours, not a small integer, so an exact DP would need to
  discretise hours (e.g. to the nearest half-hour) to keep the table a
  sane size — a real trade-off of its own.
- For this app: a handful of percent off optimal in a weekly play plan is
  invisible to the user; the simplicity of greedy is worth more than the
  guarantee. DP is the documented stretch goal, not the v1 choice.

### Measuring the gap for real (issue #11)

`generatePlanExact()` in `src/engine/scheduler.ts` implements the DP solve
above, and `scripts/compareSchedulers.ts` runs both solvers over the real
library at a few weekly budgets:

```
budget(h) | greedy score | exact score | gap | greedy hoursUsed | exact hoursUsed
----------|--------------|-------------|-----|-------------------|------------------
        5 |       150.00 |      150.00 | 0.0% |               5.0 |              5.0
       10 |       177.27 |      177.27 | 0.0% |               9.5 |              9.5
       20 |       204.66 |      204.66 | 0.0% |              19.6 |             19.7
       40 |       237.92 |      237.92 | 0.0% |              39.6 |             39.8
```

On this real library, greedy already matches exact at every budget tried —
in practice the library is varied enough (games at many different
remaining-hours values) that greedy's density sort rarely gets trapped the
way the adversarial case above describes. That's a real, useful finding on
its own: it's evidence the "greedy is good enough" call for v1 wasn't just
theoretical hand-waving.

That doesn't mean the failure mode isn't real, though — a constructed
adversarial case proves it:

```
Budget: 10h
Big:     remaining 10h, score 10    (density 1.0)
DecoyA:  remaining 5.1h, score 5.89 (density 1.15)
DecoyB:  remaining 5.1h, score 5.89 (density 1.15)
```

Both decoys sort ahead of Big (higher density), but the two decoys together
need 10.2h (over budget), and neither combines with Big either. Greedy
takes one decoy and stops there — score 5.89, with 4.9h of the week left on
the table. The exact solver correctly finds that Big alone (score 10, fully
using the budget) beats any decoy combination. This is exactly the
"single expensive high-density decoy blocks a better answer" shape greedy
can't recover from, covered by
`src/engine/__tests__/scheduler.test.ts`'s `generatePlanExact` suite.

**A bug the comparison caught:** the first version of `generatePlanExact`
discretised hours to 0.5h units for the DP table but then reported each
game's original, un-rounded `remainingHours` as its allocated hours. That
mismatch let two decoy items whose *true* combined weight was 10.2h both
get taken — each individually rounded down to a 5.0h table weight, summing
to exactly 10 discretised units, while the real hours used came to 10.2h,
over budget. The fix: always derive `allocatedHours` from the same rounded
weight the DP actually reasoned about, and round weights **up** rather than
to-nearest, so a game can never discretise to look cheaper than it truly
is. Running the comparison at a coarser 0.5h granularity afterwards
surfaced a second, subtler effect of that same rounding-up conservatism:
exact could score *below* greedy on a couple of real budgets (e.g. -2% at
20h), because rounding every weight up can make the "exact" solver reject a
combination that would truly have fit. Shrinking the granularity to 0.05h
(3 minutes) — still a trivially small DP table — made exact match or beat
greedy everywhere on the real library again. Both fixes are captured in
`generatePlanExact`'s comments, not just this note.

## Checkpoint

Can explain, without notes: what maps to what (item/weight/value/capacity),
why the near-completion bonus lives in value rather than weight, why
"skip don't break" matters, where DP would clearly win over greedy, and why
genre variety needed the greedy loop to become iterative instead of a
single static sort.
