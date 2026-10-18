//! UTC date and time in ISO 8601 form

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

/// A UTC instant, written as `YYYY-MM-DDTHH:MM:SSZ`. On input a fraction of
/// a second and an offset (`+09:00`) are accepted; the offset is converted
/// to UTC.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UtcTime {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: f64,
}

impl Default for UtcTime {
    /// J2000-ish epoch: 2000-01-01T00:00:00Z
    fn default() -> Self {
        Self {
            year: 2000,
            month: 1,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0.0,
        }
    }
}

/// Days from 1970-01-01 of a proleptic Gregorian date
fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = i64::from(y) - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (i64::from(m) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Proleptic Gregorian date of a day count from 1970-01-01
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = (yoe + era * 400 + i64::from(m <= 2)) as i32;
    (y, m, d)
}

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

impl UtcTime {
    /// Seconds since 1970-01-01T00:00:00Z
    pub fn unix_seconds(&self) -> f64 {
        let days = days_from_civil(self.year, self.month, self.day);
        days as f64 * 86_400.0
            + f64::from(self.hour) * 3600.0
            + f64::from(self.minute) * 60.0
            + self.second
    }

    fn from_unix_seconds(t: f64) -> Self {
        let days = (t / 86_400.0).floor();
        let (year, month, day) = civil_from_days(days as i64);
        let rest = t - days * 86_400.0;
        let hour = (rest / 3600.0).floor();
        let minute = ((rest - hour * 3600.0) / 60.0).floor();
        Self {
            year,
            month,
            day,
            hour: hour as u32,
            minute: minute as u32,
            second: rest - hour * 3600.0 - minute * 60.0,
        }
    }

    /// Julian date
    pub fn julian_date(&self) -> f64 {
        self.unix_seconds() / 86_400.0 + 2_440_587.5
    }

    /// Parse `YYYY-MM-DD[T ]HH:MM[:SS[.sss]][Z|±HH:MM]` (no offset: UTC)
    pub fn parse(text: &str) -> Result<Self, String> {
        let err = || format!("invalid date-time {text:?} (expected e.g. 2024-07-01T01:00:00Z)");
        let s = text.trim();
        let (date, rest) = s.split_at_checked(10).ok_or_else(err)?;
        let mut d = date.split('-');
        let num = |p: Option<&str>| p.and_then(|v| v.parse::<i64>().ok()).ok_or_else(err);
        let (year, month, day) = (num(d.next())?, num(d.next())?, num(d.next())?);
        let rest = rest.strip_prefix(['T', 't', ' ']).unwrap_or(rest);
        // Split the offset off the clock time
        let (clock, offset_min) = if let Some(c) = rest.strip_suffix(['Z', 'z']) {
            (c, 0)
        } else if let Some(i) = rest.rfind(['+', '-']).filter(|&i| i > 0) {
            let (c, off) = rest.split_at(i);
            let sign = if off.starts_with('-') { -1 } else { 1 };
            let mut hm = off[1..].split(':');
            let h = num(hm.next())?;
            let m = hm.next().map_or(Ok(0), |v| num(Some(v)))?;
            (c, sign * (h * 60 + m))
        } else {
            (rest, 0)
        };
        let mut parts = clock.split(':');
        let hour = if clock.is_empty() {
            0
        } else {
            num(parts.next())?
        };
        let minute = parts.next().map_or(Ok(0), |v| num(Some(v)))?;
        let second = match parts.next() {
            Some(v) => v.parse::<f64>().map_err(|_| err())?,
            None => 0.0,
        };
        let valid = (1..=12).contains(&month)
            && (0..24).contains(&hour)
            && (0..60).contains(&minute)
            && (0.0..60.0).contains(&second)
            && year.abs() < 100_000;
        if !valid || !(1..=i64::from(days_in_month(year as i32, month as u32))).contains(&day) {
            return Err(err());
        }
        let local = Self {
            year: year as i32,
            month: month as u32,
            day: day as u32,
            hour: hour as u32,
            minute: minute as u32,
            second,
        };
        Ok(if offset_min == 0 {
            local
        } else {
            Self::from_unix_seconds(local.unix_seconds() - offset_min as f64 * 60.0)
        })
    }
}

impl fmt::Display for UtcTime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{:04}-{:02}-{:02}T{:02}:{:02}:",
            self.year, self.month, self.day, self.hour, self.minute
        )?;
        if self.second.fract() == 0.0 {
            write!(f, "{:02}Z", self.second as u32)
        } else {
            let s = format!("{:06.3}", self.second);
            write!(f, "{}Z", s.trim_end_matches('0'))
        }
    }
}

impl Serialize for UtcTime {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for UtcTime {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        UtcTime::parse(&text).map_err(serde::de::Error::custom)
    }
}

#[cfg(feature = "schema")]
impl schemars::JsonSchema for UtcTime {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "UtcTime".into()
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "string",
            "format": "date-time",
            "description": "ISO 8601 date-time; without an offset it is UTC",
            "examples": ["2024-07-01T01:00:00Z"]
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_formats() {
        let t = UtcTime::parse("2019-05-04T05:45:00Z").unwrap();
        assert_eq!(
            (t.year, t.month, t.day, t.hour, t.minute),
            (2019, 5, 4, 5, 45)
        );
        assert_eq!(t.to_string(), "2019-05-04T05:45:00Z");
        assert_eq!(
            UtcTime::parse("2019-05-04 05:45").unwrap().to_string(),
            "2019-05-04T05:45:00Z"
        );
        assert_eq!(
            UtcTime::parse("2019-05-04T05:45:30.25Z")
                .unwrap()
                .to_string(),
            "2019-05-04T05:45:30.25Z"
        );
    }

    #[test]
    fn offsets_convert_to_utc() {
        let t = UtcTime::parse("2024-01-01T08:30:00+09:00").unwrap();
        assert_eq!(t.to_string(), "2023-12-31T23:30:00Z");
        let t = UtcTime::parse("2024-02-28T23:00:00-02:00").unwrap();
        assert_eq!(t.to_string(), "2024-02-29T01:00:00Z");
    }

    #[test]
    fn rejects_invalid_dates() {
        for bad in [
            "2023-02-29T00:00:00Z",
            "2024-13-01T00:00:00Z",
            "2024-01-01T24:00:00Z",
            "x",
        ] {
            assert!(UtcTime::parse(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn julian_date_of_j2000() {
        let t = UtcTime::parse("2000-01-01T12:00:00Z").unwrap();
        assert_eq!(t.julian_date(), 2_451_545.0);
    }
}
