// Hypergeometric probability utilities using BigInt for precision.

const factCache: bigint[] = [1n];
function fact(n: number): bigint {
  for (let i = factCache.length; i <= n; i++) {
    factCache.push(factCache[i - 1] * BigInt(i));
  }
  return factCache[n];
}

export function combinations(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  return fact(n) / (fact(k) * fact(n - k));
}

export interface CategoryConstraint {
  size: number; // number of cards of this category in the deck
  min: number; // minimum copies desired in hand
  max?: number; // optional maximum copies in hand
}

/**
 * Constraint over the union of several categories (indexes into the categories
 * array). Lets a "Starters" bucket and a highlighted card carved out of it be
 * counted together while still being disjoint buckets in the math.
 */
export interface GroupConstraint {
  members: number[];
  min: number;
  max?: number;
}

/**
 * Probability that a random hand of `handSize` drawn from a deck of `deckSize`
 * satisfies all category constraints simultaneously (multivariate hypergeometric).
 * Categories are disjoint; any remaining cards are treated as "other".
 * Optional `groups` add constraints over unions of categories.
 * Returns { numerator, denominator, probability }.
 */
export function multivariateProbability(
  deckSize: number,
  handSize: number,
  categories: CategoryConstraint[],
  groups: GroupConstraint[] = [],
): { numerator: bigint; denominator: bigint; probability: number } {
  const totalCategorized = categories.reduce((s, c) => s + c.size, 0);
  const otherSize = deckSize - totalCategorized;
  const denom = combinations(deckSize, handSize);
  if (denom === 0n || otherSize < 0 || handSize > deckSize) {
    return { numerator: 0n, denominator: denom || 1n, probability: 0 };
  }

  let numerator = 0n;
  const picks: number[] = new Array(categories.length).fill(0);

  const groupsOk = () =>
    groups.every((g) => {
      const total = g.members.reduce((s, i) => s + (picks[i] ?? 0), 0);
      return total >= g.min && (g.max === undefined || total <= g.max);
    });

  // Recurse over each category picking a valid count.
  function recurse(idx: number, remaining: number, product: bigint) {
    if (idx === categories.length) {
      if (remaining < 0 || remaining > otherSize) return;
      if (!groupsOk()) return;
      numerator += product * combinations(otherSize, remaining);
      return;
    }
    const c = categories[idx];
    const lo = Math.max(c.min, 0);
    const hi = Math.min(c.max ?? c.size, c.size, remaining);
    for (let k = lo; k <= hi; k++) {
      picks[idx] = k;
      recurse(idx + 1, remaining - k, product * combinations(c.size, k));
    }
    picks[idx] = 0;
  }
  recurse(0, handSize, 1n);

  // Compute probability as a Number by dividing BigInts with precision.
  const probability = bigDiv(numerator, denom);
  return { numerator, denominator: denom, probability };
}


function bigDiv(a: bigint, b: bigint): number {
  if (b === 0n) return 0;
  // scale by 1e15 for precision
  const scale = 1_000_000_000_000_000n;
  const scaled = (a * scale) / b;
  return Number(scaled) / 1e15;
}

export function formatFraction(n: bigint, d: bigint): string {
  if (d === 0n) return "0";
  const g = gcd(n < 0n ? -n : n, d);
  const nn = n / g;
  const dd = d / g;
  return `${nn.toString()} / ${dd.toString()}`;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}
