//! Interpolation of tabulated data
//!
//! Tables are clamped: outside the tabulated range the end values are used.

/// Interval of an ascending axis that contains `x`: `(i, a)` with
/// `x ≈ axis[i] + a (axis[i+1] - axis[i])`, `a` in [0, 1]. Outside the
/// axis the end point is returned (`a = 0`). `None` for an empty axis.
pub fn bracket(axis: &[f64], x: f64) -> Option<(usize, f64)> {
    let n = axis.len();
    if n == 0 {
        return None;
    }
    if n == 1 || x <= axis[0] {
        return Some((0, 0.0));
    }
    if x >= axis[n - 1] {
        return Some((n - 1, 0.0));
    }
    // First index with axis[i] > x, so axis[i-1] <= x < axis[i]
    let i = axis.partition_point(|&v| v <= x) - 1;
    let dx = axis[i + 1] - axis[i];
    let a = if dx.abs() < 1e-10 {
        0.0
    } else {
        (x - axis[i]) / dx
    };
    Some((i, a))
}

/// Piecewise linear function of one variable; a single point is a constant
#[derive(Debug, Clone, PartialEq)]
pub struct Linear {
    x: Vec<f64>,
    y: Vec<f64>,
}

impl Linear {
    pub fn constant(value: f64) -> Self {
        Self {
            x: vec![0.0],
            y: vec![value],
        }
    }

    /// From `(x, y)` points with ascending `x` (an empty table is zero)
    pub fn from_points(points: impl IntoIterator<Item = (f64, f64)>) -> Self {
        let (x, y): (Vec<f64>, Vec<f64>) = points.into_iter().unzip();
        if x.is_empty() {
            return Self::constant(0.0);
        }
        Self { x, y }
    }

    pub fn eval(&self, x: f64) -> f64 {
        self.eval_scalar(x)
    }

    /// Choose a piece by its real value, preserving derivatives inside it.
    /// At an interior knot use the right derivative; outside the table it is zero.
    pub fn eval_scalar<T: crate::physics::Scalar>(&self, x: T) -> T {
        let Some((i, _)) = bracket(&self.x, x.re()) else {
            return T::from(0.0);
        };
        if self.x.len() == 1 || x.re() <= self.x[0] || i + 1 >= self.x.len() {
            return T::from(self.y[i]);
        }
        T::from(self.y[i])
            + (x - self.x[i]) / (self.x[i + 1] - self.x[i]) * (self.y[i + 1] - self.y[i])
    }

    pub fn is_constant(&self) -> bool {
        self.x.len() == 1
    }

    pub fn points(&self) -> impl Iterator<Item = (f64, f64)> + '_ {
        self.x.iter().copied().zip(self.y.iter().copied())
    }

    /// The function multiplied by `k`
    pub fn scaled(&self, k: f64) -> Self {
        Self {
            x: self.x.clone(),
            y: self.y.iter().map(|v| v * k).collect(),
        }
    }

    /// The function with every value shifted by `d`
    pub fn offset(&self, d: f64) -> Self {
        Self {
            x: self.x.clone(),
            y: self.y.iter().map(|v| v + d).collect(),
        }
    }

    /// The function with values mapped by `f`
    pub fn map(&self, f: impl Fn(f64) -> f64) -> Self {
        Self {
            x: self.x.clone(),
            y: self.y.iter().map(|&v| f(v)).collect(),
        }
    }

    /// `f(x * k)`: compressed along the axis by `k` (stretched for k < 1)
    pub fn compressed(&self, k: f64) -> Self {
        Self {
            x: self.x.iter().map(|v| v / k).collect(),
            y: self.y.clone(),
        }
    }
}

/// Function of two variables on a grid, e.g. CN over Mach x angle of attack
#[derive(Debug, Clone, PartialEq)]
pub struct Grid2D {
    /// Primary axis (ascending), e.g. Mach
    x: Vec<f64>,
    /// Secondary axis (ascending), e.g. angle of attack [deg]
    y: Vec<f64>,
    /// `z[i][j]` at `(x[i], y[j])`
    z: Vec<Vec<f64>>,
}

impl Grid2D {
    /// Grid with `z[i][j]` at `(x[i], y[j])`; at least 2 x 2 points
    pub fn new(x: Vec<f64>, y: Vec<f64>, z: Vec<Vec<f64>>) -> Self {
        Self { x, y, z }
    }

    pub fn scaled(&self, k: f64) -> Self {
        Self {
            x: self.x.clone(),
            y: self.y.clone(),
            z: self
                .z
                .iter()
                .map(|row| row.iter().map(|v| v * k).collect())
                .collect(),
        }
    }

    /// Triangle interpolation of the C++ simulator (`interp_matrix_2d`):
    /// each grid cell is split into four triangles around its centre.
    /// Outside the grid the nearest edge is used.
    pub fn eval(&self, x: f64, y: f64) -> f64 {
        self.eval_scalar(x, y)
    }

    pub fn eval_scalar<T: crate::physics::Scalar>(&self, x: T, y: T) -> T {
        let (m, n) = (self.x.len(), self.y.len());
        if m < 2 || n < 2 {
            return T::from(0.0);
        }
        let cell = |axis: &[f64], v: T| -> (usize, T) {
            let len = axis.len();
            let v = if v.re() <= axis[0] {
                T::from(axis[0])
            } else if v.re() >= axis[len - 1] {
                T::from(axis[len - 1])
            } else {
                v
            };
            let i = (axis.partition_point(|&a| a <= v.re()).max(1) - 1).min(len - 2);
            let d = axis[i + 1] - axis[i];
            (
                i,
                if d.abs() < 1e-12 {
                    T::from(0.0)
                } else {
                    (v - axis[i]) / d
                },
            )
        };
        let (i, dx) = cell(&self.x, x);
        let (j, dy) = cell(&self.y, y);
        let f = |ii: usize, jj: usize| T::from(self.z[ii][jj]);
        if dx.re() < 0.5 {
            if dy.re() < 0.5 {
                f(i, j) + (f(i + 1, j) - f(i, j)) * dx + (f(i, j + 1) - f(i, j)) * dy
            } else {
                f(i, j + 1)
                    + (f(i + 1, j + 1) - f(i, j + 1)) * dx
                    + (f(i, j + 1) - f(i, j)) * (dy - 1.0)
            }
        } else if dy.re() < 0.5 {
            f(i + 1, j)
                + (f(i + 1, j) - f(i, j)) * (dx - 1.0)
                + (f(i + 1, j + 1) - f(i + 1, j)) * dy
        } else {
            f(i + 1, j + 1)
                + (f(i + 1, j + 1) - f(i, j + 1)) * (dx - 1.0)
                + (f(i + 1, j + 1) - f(i + 1, j)) * (dy - 1.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_interpolates_and_clamps() {
        let f = Linear::from_points([(0.0, 0.0), (10.0, 100.0), (20.0, 200.0)]);
        assert_eq!(f.eval(5.0), 50.0);
        assert_eq!(f.eval(10.0), 100.0);
        assert_eq!(f.eval(-10.0), 0.0);
        assert_eq!(f.eval(40.0), 200.0);
        assert_eq!(Linear::constant(3.0).eval(1e9), 3.0);
        assert_eq!(f.compressed(2.0).eval(5.0), 100.0);
        assert_eq!(f.scaled(0.5).eval(10.0), 50.0);
    }

    #[test]
    fn grid_matches_cells_and_corners() {
        let g = Grid2D::new(
            vec![0.0, 1.0],
            vec![0.0, 10.0],
            vec![vec![0.0, 1.0], vec![2.0, 3.0]],
        );
        assert_eq!(g.eval(0.0, 0.0), 0.0);
        assert_eq!(g.eval(1.0, 10.0), 3.0);
        assert!((g.eval(0.25, 2.5) - 0.75).abs() < 1e-12);
        // Clamped outside the grid
        assert_eq!(g.eval(5.0, 50.0), 3.0);
    }
}
