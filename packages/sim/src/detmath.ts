/**
 * Deterministic math.
 *
 * Math.sin / cos / atan2 / exp are NOT guaranteed to return bit-identical results
 * across JS engines (Chrome vs Firefox vs Safari vs the server). Basic arithmetic
 * (+ - * /) and Math.sqrt ARE (IEEE-754 correctly rounded). The server re-simulates
 * submitted laps to verify them, so the sim may only use the functions in this file
 * plus basic arithmetic, Math.sqrt, Math.abs, Math.min, Math.max and Math.floor.
 */

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** Wrap an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  return a - TWO_PI * Math.floor((a + PI) / TWO_PI);
}

/** sin via range reduction + Taylor series (error < 1e-9). */
export function sin(x: number): number {
  let a = wrapAngle(x);
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  const a2 = a * a;
  return (
    a *
    (1 +
      a2 *
        (-1 / 6 +
          a2 *
            (1 / 120 +
              a2 *
                (-1 / 5040 +
                  a2 *
                    (1 / 362880 +
                      a2 * (-1 / 39916800 + a2 * (1 / 6227020800 + a2 * (-1 / 1307674368000))))))))
  );
}

export function cos(x: number): number {
  return sin(x + HALF_PI);
}

/** atan via two argument-halvings + Taylor series (error < 1e-12). */
export function atan(x: number): number {
  let sign = 1;
  if (x < 0) {
    x = -x;
    sign = -1;
  }
  let inverted = false;
  if (x > 1) {
    x = 1 / x;
    inverted = true;
  }
  // tan(θ/2) = tanθ / (1 + sqrt(1 + tan²θ)); applied twice → |x| ≤ tan(π/16) ≈ 0.199
  x = x / (1 + Math.sqrt(1 + x * x));
  x = x / (1 + Math.sqrt(1 + x * x));
  const x2 = x * x;
  let r =
    x *
    (1 +
      x2 *
        (-1 / 3 +
          x2 *
            (1 / 5 +
              x2 *
                (-1 / 7 +
                  x2 * (1 / 9 + x2 * (-1 / 11 + x2 * (1 / 13 + x2 * (-1 / 15 + x2 * (1 / 17)))))))));
  r *= 4;
  if (inverted) r = HALF_PI - r;
  return sign * r;
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}
