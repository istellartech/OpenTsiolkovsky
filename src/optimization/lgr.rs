//! Right (flipped) Legendre-Gauss-Radau: -1 is a state-only point;
//! P_N - P_(N-1) supplies N collocation points including +1.
#[derive(Debug, Clone)]
pub struct Lgr {
    pub nodes: Vec<f64>,
    pub weights: Vec<f64>,
    pub differentiation: Vec<Vec<f64>>,
}

fn legendre(n: usize, x: f64) -> (f64, f64) {
    if n == 0 {
        return (1.0, 0.0);
    }
    let (mut p0, mut p1) = (1.0, x);
    for k in 2..=n {
        let p = ((2 * k - 1) as f64 * x * p1 - (k - 1) as f64 * p0) / k as f64;
        p0 = p1;
        p1 = p;
    }
    (p1, p0)
}

impl Lgr {
    pub fn new(n: usize) -> Result<Self, String> {
        if !(1..=16).contains(&n) {
            return Err("LGR degree must be in 1..16".into());
        }
        let polynomial = |x: f64| {
            let (pn, pm) = legendre(n, x);
            pn - pm
        };
        let mut nodes = vec![-1.0];
        // Bracket every interior root before safeguarded Newton iteration. The
        // O(N^-2) endpoint spacing requires a scan proportional to N^2.
        let steps = 64 * n * n;
        let mut lo = -1.0;
        for k in 1..steps {
            let hi = -1.0 + 2.0 * k as f64 / steps as f64;
            if polynomial(lo) * polynomial(hi) <= 0.0 {
                let (mut a, mut b) = (lo, hi);
                let mut x = (a + b) / 2.0;
                for _ in 0..80 {
                    let (pn, pm) = legendre(n, x);
                    let dpn = n as f64 * (pm - x * pn) / (1.0 - x * x);
                    let (_, pmm) = legendre(n - 1, x);
                    let dpm = if n == 1 {
                        0.0
                    } else {
                        (n - 1) as f64 * (pmm - x * pm) / (1.0 - x * x)
                    };
                    let f = pn - pm;
                    if f.abs() < 2e-15 || b - a < 2e-15 {
                        break;
                    }
                    if polynomial(a) * f <= 0.0 {
                        b = x;
                    } else {
                        a = x;
                    }
                    let newton = x - f / (dpn - dpm);
                    x = if newton > a && newton < b {
                        newton
                    } else {
                        (a + b) / 2.0
                    };
                }
                if nodes.last().is_none_or(|last| (x - last).abs() > 1e-12) {
                    nodes.push(x);
                }
            }
            lo = hi;
        }
        nodes.push(1.0);
        if nodes.len() != n + 1 {
            return Err("LGR root isolation failed".into());
        }
        let weights = nodes[1..]
            .iter()
            .map(|&x| {
                let (p, _) = legendre(n - 1, x);
                (1.0 + x) / ((n * n) as f64 * p * p)
            })
            .collect();
        let bary = barycentric_weights(&nodes);
        let differentiation = (1..=n)
            .map(|i| {
                let mut row = vec![0.0; n + 1];
                for j in 0..=n {
                    if i != j {
                        row[j] = bary[j] / (bary[i] * (nodes[i] - nodes[j]));
                    }
                }
                row[i] = -row.iter().sum::<f64>();
                row
            })
            .collect();
        Ok(Self {
            nodes,
            weights,
            differentiation,
        })
    }
}

fn barycentric_weights(nodes: &[f64]) -> Vec<f64> {
    nodes
        .iter()
        .enumerate()
        .map(|(j, &x)| {
            1.0 / nodes
                .iter()
                .enumerate()
                .filter(|(k, _)| *k != j)
                .map(|(_, &y)| x - y)
                .product::<f64>()
        })
        .collect()
}

/// Includes explicit extrapolation at the initial state-only point.
pub fn interpolate(nodes: &[f64], values: &[f64], x: f64) -> f64 {
    assert_eq!(nodes.len(), values.len());
    if let Some(i) = nodes
        .iter()
        .position(|&t| (x - t).abs() < 4.0 * f64::EPSILON)
    {
        return values[i];
    }
    let bary = barycentric_weights(nodes);
    let (top, bottom) = nodes
        .iter()
        .enumerate()
        .fold((0.0, 0.0), |(a, b), (i, &t)| {
            let w = bary[i] / (x - t);
            (a + w * values[i], b + w)
        });
    top / bottom
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn known_right_radau_points_and_polynomial_exactness() {
        let two = Lgr::new(2).unwrap();
        assert!((two.nodes[1] + 1.0 / 3.0).abs() < 1e-14);
        assert!((two.weights[0] - 1.5).abs() < 1e-14);
        assert!((two.weights[1] - 0.5).abs() < 1e-14);
        for n in 1..=16 {
            let grid = Lgr::new(n).unwrap();
            assert!(grid.nodes.windows(2).all(|v| v[0] < v[1]));
            assert!(grid.weights.iter().all(|w| *w > 0.0));
            assert!((grid.weights.iter().sum::<f64>() - 2.0).abs() < 1e-11);
            for power in 0..=n {
                for (i, row) in grid.differentiation.iter().enumerate() {
                    let derivative: f64 = row
                        .iter()
                        .zip(&grid.nodes)
                        .map(|(d, t)| d * t.powi(power as i32))
                        .sum();
                    let expected = if power == 0 {
                        0.0
                    } else {
                        power as f64 * grid.nodes[i + 1].powi(power as i32 - 1)
                    };
                    assert!(
                        (derivative - expected).abs() < 2e-10,
                        "degree {n} power {power}"
                    );
                }
            }
            for power in 0..=2 * n - 2 {
                let integral: f64 = grid
                    .weights
                    .iter()
                    .zip(&grid.nodes[1..])
                    .map(|(w, t)| w * t.powi(power as i32))
                    .sum();
                let expected = if power % 2 == 0 {
                    2.0 / (power + 1) as f64
                } else {
                    0.0
                };
                assert!(
                    (integral - expected).abs() < 1e-11,
                    "degree {n} power {power}"
                );
            }
        }
    }
}
