//! Polynomial control interpolation and sufficient continuous-time envelopes.
/// Lagrange interpolation and derivative weights, including initial extrapolation.
pub fn basis(nodes: &[f64], tau: f64) -> (Vec<f64>, Vec<f64>) {
    let n = nodes.len();
    let mut b = vec![0.0; n];
    let mut d = vec![0.0; n];
    for i in 0..n {
        b[i] = (0..n)
            .filter(|&j| j != i)
            .map(|j| (tau - nodes[j]) / (nodes[i] - nodes[j]))
            .product();
        d[i] = (0..n)
            .filter(|&k| k != i)
            .map(|k| {
                (0..n)
                    .filter(|&j| j != i && j != k)
                    .map(|j| (tau - nodes[j]) / (nodes[i] - nodes[j]))
                    .product::<f64>()
                    / (nodes[i] - nodes[k])
            })
            .sum();
    }
    (b, d)
}

/// Convert nodal values to Bernstein coefficients on s=(tau+1)/2 in [0,1].
/// Their convex hull bounds the complete polynomial, and differences of
/// adjacent coefficients bound its time derivative throughout the interval.
pub(crate) fn bernstein_weights(nodes: &[f64]) -> Vec<Vec<f64>> {
    let n = nodes.len() - 1;
    let choose = |n: usize, k: usize| (0..k).fold(1.0, |v, i| v * (n - i) as f64 / (i + 1) as f64);
    let mut weights = vec![vec![0.0; n + 1]; n + 1];
    for j in 0..=n {
        let sj = (nodes[j] + 1.0) * 0.5;
        let mut power = vec![1.0];
        for (k, node) in nodes.iter().enumerate() {
            if k != j {
                let sk = (node + 1.0) * 0.5;
                let mut next = vec![0.0; power.len() + 1];
                for (i, a) in power.iter().enumerate() {
                    next[i] -= a * sk / (sj - sk);
                    next[i + 1] += a / (sj - sk);
                }
                power = next;
            }
        }
        for (i, row) in weights.iter_mut().enumerate() {
            row[j] = (0..=i)
                .map(|k| power[k] * choose(i, k) / choose(n, k))
                .sum();
        }
    }
    weights
}
