//! Tabulated inputs: constants, inline tables and CSV files
//!
//! A table is given inline as rows (`[[x, y], ...]`) or as a CSV file
//! (`{"file": "thrust.csv"}`) whose columns are read by position. CSV rows
//! that are not numeric (headers, comments) are skipped. Relative file names
//! are resolved by a [`TableSource`], normally the configuration's directory.

use crate::math::interp::{Grid2D, Linear};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Rows given inline or read from a CSV file
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(untagged)]
pub enum Table<R> {
    /// Rows of numbers
    Rows(Vec<R>),
    /// CSV file (header rows are skipped)
    File {
        file: String,
        /// Columns to read, 0-based (default: the first ones)
        #[serde(default, skip_serializing_if = "Option::is_none")]
        columns: Option<Vec<usize>>,
    },
}

/// Constant or a table of `[x, y]` rows (piecewise linear, clamped at the ends)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(untagged)]
pub enum Curve {
    Constant(f64),
    Table(Table<[f64; 2]>),
}

impl Curve {
    pub fn is_constant(&self, value: f64) -> bool {
        matches!(self, Curve::Constant(v) if *v == value)
    }

    pub fn as_constant(&self) -> Option<f64> {
        match self {
            Curve::Constant(v) => Some(*v),
            _ => None,
        }
    }
}

impl From<f64> for Curve {
    fn from(v: f64) -> Self {
        Curve::Constant(v)
    }
}

impl Default for Curve {
    fn default() -> Self {
        Curve::Constant(0.0)
    }
}

/// Values over Mach number x angle of attack [deg]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(untagged)]
pub enum Surface {
    Grid {
        /// Mach numbers (ascending)
        mach: Vec<f64>,
        /// Angles of attack [deg] (ascending, 0 to 90, or 180 for flow from behind)
        alpha_deg: Vec<f64>,
        /// `values[i][j]` at `mach[i]`, `alpha_deg[j]`
        values: Vec<Vec<f64>>,
    },
    /// CSV file: first row `-, alpha_1, alpha_2, ...`, then `mach, value_1, value_2, ...`
    File { file: String },
}

/// Reads the CSV files that tables refer to
pub trait TableSource {
    /// Contents of the file `name`
    fn read(&self, name: &str) -> Result<String, String>;
}

/// Files relative to a directory
pub struct DirSource(pub PathBuf);

impl TableSource for DirSource {
    fn read(&self, name: &str) -> Result<String, String> {
        let path = self.0.join(name);
        std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
    }
}

/// Files held in memory by name (the web app, share links)
#[derive(Debug, Clone, Default)]
pub struct MemorySource(pub HashMap<String, String>);

impl TableSource for MemorySource {
    fn read(&self, name: &str) -> Result<String, String> {
        let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
        self.0
            .get(name)
            .or_else(|| self.0.get(base))
            .cloned()
            .ok_or_else(|| format!("{name}: file not provided"))
    }
}

/// No files available: every file reference is an error
pub struct NoFiles;

impl TableSource for NoFiles {
    fn read(&self, name: &str) -> Result<String, String> {
        Err(format!(
            "{name}: tables must be given inline here (no file access)"
        ))
    }
}

/// Numeric CSV rows with at least `min_cols` columns; other rows are skipped
pub fn parse_csv(text: &str, min_cols: usize) -> Result<Vec<Vec<f64>>, String> {
    let mut rows = Vec::new();
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(text.as_bytes());
    for record in reader.records() {
        let record = record.map_err(|e| e.to_string())?;
        // Leading numeric fields; a row with fewer is not data
        let values: Vec<f64> = record.iter().map_while(|t| t.parse::<f64>().ok()).collect();
        if values.len() >= min_cols {
            rows.push(values);
        }
    }
    Ok(rows)
}

impl<const N: usize> Table<[f64; N]> {
    /// The rows, reading the file if needed
    pub fn rows(&self, source: &dyn TableSource) -> Result<Vec<[f64; N]>, String> {
        match self {
            Table::Rows(rows) => Ok(rows.clone()),
            Table::File { file, columns } => {
                let picks: Vec<usize> = match columns {
                    Some(c) if c.len() == N => c.clone(),
                    Some(c) => {
                        return Err(format!("{file}: give {N} columns, not {}", c.len()));
                    }
                    None => (0..N).collect(),
                };
                let width = picks.iter().max().map_or(N, |m| m + 1);
                let rows = parse_csv(&source.read(file)?, width)?;
                if rows.is_empty() {
                    return Err(format!("{file}: no numeric rows with {width} columns"));
                }
                Ok(rows
                    .into_iter()
                    .map(|r| std::array::from_fn(|i| r[picks[i]]))
                    .collect())
            }
        }
    }
}

/// Check that a table axis is finite and ascending
pub fn check_axis(axis: impl IntoIterator<Item = f64>) -> Result<(), String> {
    let mut prev = f64::NEG_INFINITY;
    for (i, x) in axis.into_iter().enumerate() {
        if !x.is_finite() {
            return Err(format!("row {}: non-finite value", i + 1));
        }
        if x < prev {
            return Err(format!("row {}: axis value {x} is not ascending", i + 1));
        }
        prev = x;
    }
    Ok(())
}

impl Curve {
    /// Interpolating function, reading the file if needed
    pub fn load(&self, source: &dyn TableSource) -> Result<Linear, String> {
        match self {
            Curve::Constant(v) => Ok(Linear::constant(*v)),
            Curve::Table(table) => {
                let rows = table.rows(source)?;
                if rows.is_empty() {
                    return Err("table has no rows".to_string());
                }
                check_axis(rows.iter().map(|r| r[0]))?;
                if let Some(r) = rows.iter().find(|r| !r[1].is_finite()) {
                    return Err(format!("non-finite value at {}", r[0]));
                }
                Ok(Linear::from_points(rows.into_iter().map(|r| (r[0], r[1]))))
            }
        }
    }
}

impl Surface {
    /// Grid of values, reading the file if needed
    pub fn load(&self, source: &dyn TableSource) -> Result<Grid2D, String> {
        let (mach, alpha, values) = match self {
            Surface::Grid {
                mach,
                alpha_deg,
                values,
            } => (mach.clone(), alpha_deg.clone(), values.clone()),
            Surface::File { file } => parse_surface(&source.read(file)?)?,
        };
        if mach.len() < 2 || alpha.len() < 2 {
            return Err("needs at least 2 Mach numbers and 2 angles".to_string());
        }
        if values.len() != mach.len() || values.iter().any(|row| row.len() != alpha.len()) {
            return Err(format!(
                "values must be {} rows (Mach) of {} columns (angle)",
                mach.len(),
                alpha.len()
            ));
        }
        check_axis(mach.iter().copied()).map_err(|e| format!("mach: {e}"))?;
        check_axis(alpha.iter().copied()).map_err(|e| format!("alpha_deg: {e}"))?;
        if values.iter().flatten().any(|v| !v.is_finite()) {
            return Err("non-finite value".to_string());
        }
        Ok(Grid2D::new(mach, alpha, values))
    }
}

/// Mach numbers, angles and `values[mach][angle]`
pub type SurfaceGrid = (Vec<f64>, Vec<f64>, Vec<Vec<f64>>);

/// Mach, angle and value grid of a surface CSV (first row: anything, then
/// the angles; every other row: Mach, then the values). Rows are sorted by
/// Mach; a short row is padded with its last value.
pub fn parse_surface(text: &str) -> Result<SurfaceGrid, String> {
    let mut lines = text
        .lines()
        .map(|line| {
            line.split(',')
                .map(|t| match t.trim() {
                    "" => Some(0.0),
                    t => t.parse::<f64>().ok(),
                })
                .collect::<Option<Vec<f64>>>()
        })
        .filter_map(|row| row.filter(|r| r.len() >= 2));
    let header = lines.next().ok_or("empty surface table")?;
    let alpha = header[1..].to_vec();
    let mut rows: Vec<Vec<f64>> = lines.collect();
    if rows.len() < 2 {
        return Err("surface table needs at least 2 Mach rows".to_string());
    }
    rows.sort_by(|a, b| a[0].total_cmp(&b[0]));
    let mach = rows.iter().map(|r| r[0]).collect();
    let values = rows
        .into_iter()
        .map(|r| {
            let mut v = r[1..].to_vec();
            let last = v.last().copied().unwrap_or(0.0);
            v.resize(alpha.len(), last);
            v
        })
        .collect();
    Ok((mach, alpha, values))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curve_forms_deserialize() {
        let c: Curve = serde_json::from_str("1.5").unwrap();
        assert_eq!(c, Curve::Constant(1.5));
        let c: Curve = serde_json::from_str("[[0, 1], [10, 2]]").unwrap();
        assert_eq!(c.load(&NoFiles).unwrap().eval(5.0), 1.5);
        let c: Curve = serde_json::from_str(r#"{"file": "t.csv"}"#).unwrap();
        let files = MemorySource(HashMap::from([(
            "t.csv".to_string(),
            "time[s],thrust[N],isp[s]\n0,100,200\n10,200,300,extra\n".to_string(),
        )]));
        assert_eq!(c.load(&files).unwrap().eval(5.0), 150.0);
        assert!(c.load(&NoFiles).is_err());
        let c: Curve = serde_json::from_str(r#"{"file": "t.csv", "columns": [0, 2]}"#).unwrap();
        assert_eq!(c.load(&files).unwrap().eval(5.0), 250.0);
    }

    #[test]
    fn descending_axis_is_rejected() {
        let c: Curve = serde_json::from_str("[[10, 1], [0, 2]]").unwrap();
        assert!(c.load(&NoFiles).unwrap_err().contains("ascending"));
    }

    #[test]
    fn surface_csv_parses() {
        let (mach, alpha, values) = parse_surface("0,0,10\n1.0,0,3\n0.5,0,1\n").unwrap();
        assert_eq!(mach, vec![0.5, 1.0]);
        assert_eq!(alpha, vec![0.0, 10.0]);
        assert_eq!(values, vec![vec![0.0, 1.0], vec![0.0, 3.0]]);
    }
}
